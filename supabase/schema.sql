create extension if not exists pgcrypto;

create table if not exists public.booking_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  is_active boolean not null default true,
  reserved_until timestamptz,
  active_reservation uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.booking_slots(id),
  guest_name text not null,
  guest_phone text not null,
  service text not null,
  note text,
  status text not null default 'payment_pending'
    check (status in ('payment_pending', 'confirmed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.booking_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.booking_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_admins enable row level security;

create or replace function public.is_booking_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.booking_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_booking_admin() from public, anon;
grant execute on function public.is_booking_admin() to authenticated;

drop policy if exists "Public can view open booking slots" on public.booking_slots;
drop policy if exists "Public can view future booking slots" on public.booking_slots;
create policy "Public can view future booking slots"
  on public.booking_slots
  for select
  to anon, authenticated
  using (
    is_active
    and starts_at > now()
  );

drop policy if exists "Admins can manage booking slots" on public.booking_slots;
create policy "Admins can manage booking slots"
  on public.booking_slots
  for all
  to authenticated
  using (public.is_booking_admin())
  with check (public.is_booking_admin());

drop policy if exists "Admins can view appointments" on public.appointments;
create policy "Admins can view appointments"
  on public.appointments
  for select
  to authenticated
  using (public.is_booking_admin());

drop policy if exists "Admins can view their own admin grant" on public.booking_admins;
create policy "Admins can view their own admin grant"
  on public.booking_admins
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.booking_slots from anon, authenticated;
grant select (id, starts_at, reserved_until) on public.booking_slots to anon;
grant select, insert, update on public.booking_slots to authenticated;
revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
revoke all on public.booking_admins from public, anon, authenticated;
grant select on public.booking_admins to authenticated;

create or replace function public.reserve_appointment(
  p_slot_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_service text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.booking_slots%rowtype;
  v_appointment_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if length(trim(coalesce(p_guest_name, ''))) not between 2 and 120
    or length(trim(coalesce(p_guest_phone, ''))) not between 7 and 30
    or length(trim(coalesce(p_service, ''))) not between 2 and 120
    or length(coalesce(p_note, '')) > 1000 then
    raise exception 'INVALID_BOOKING_DETAILS' using errcode = '22023';
  end if;

  select * into v_slot
  from public.booking_slots
  where id = p_slot_id and is_active
  for update;

  if not found then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_slot.starts_at <= now() then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_slot.reserved_until is not null and v_slot.reserved_until > now() then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_slot.active_reservation is not null then
    update public.appointments
    set status = 'expired'
    where id = v_slot.active_reservation and status = 'payment_pending';
  end if;

  insert into public.appointments (
    id, slot_id, guest_name, guest_phone, service, note, status, expires_at
  ) values (
    v_appointment_id, p_slot_id, trim(p_guest_name), trim(p_guest_phone),
    trim(p_service), nullif(trim(coalesce(p_note, '')), ''), 'payment_pending', v_expires_at
  );

  update public.booking_slots
  set reserved_until = v_expires_at,
      active_reservation = v_appointment_id
  where id = p_slot_id;

  return jsonb_build_object(
    'appointment_id', v_appointment_id,
    'expires_at', v_expires_at,
    'status', 'payment_pending'
  );
end;
$$;

revoke all on function public.reserve_appointment(uuid, text, text, text, text) from public;
grant execute on function public.reserve_appointment(uuid, text, text, text, text) to anon, authenticated;

create or replace function public.confirm_appointment_payment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot_id uuid;
  v_appointment public.appointments%rowtype;
begin
  if not public.is_booking_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select slot_id into v_slot_id
  from public.appointments
  where id = p_appointment_id;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform 1 from public.booking_slots where id = v_slot_id for update;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if v_appointment.status <> 'payment_pending' or v_appointment.expires_at <= now() then
    raise exception 'PAYMENT_HOLD_EXPIRED' using errcode = 'P0001';
  end if;

  update public.appointments
  set status = 'confirmed', paid_at = now()
  where id = p_appointment_id;

  update public.booking_slots
  set reserved_until = 'infinity'::timestamptz
  where id = v_slot_id;
end;
$$;

revoke all on function public.confirm_appointment_payment(uuid) from public, anon;
grant execute on function public.confirm_appointment_payment(uuid) to authenticated;

create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appointment public.appointments%rowtype;
begin
  if not public.is_booking_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform 1 from public.booking_slots where id = v_appointment.slot_id for update;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if v_appointment.status not in ('payment_pending', 'confirmed') then
    raise exception 'APPOINTMENT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  update public.appointments
  set status = 'cancelled'
  where id = p_appointment_id;

  update public.booking_slots
  set is_active = starts_at > now(),
      reserved_until = null,
      active_reservation = null
  where id = v_appointment.slot_id;
end;
$$;

revoke all on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_slots'
    ) then
      execute 'alter publication supabase_realtime add table public.booking_slots';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
    ) then
      execute 'alter publication supabase_realtime add table public.appointments';
    end if;
  end if;
end;
$$;