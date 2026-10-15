const config = window.JENNYLUXE_BOOKING || {};
const client = window.supabase?.createClient && config.supabaseUrl && config.supabaseAnonKey
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const loginView = document.querySelector("#login-view");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const dashboardMessage = document.querySelector("#dashboard-message");
const reservationRows = document.querySelector("#reservation-rows");
const slotList = document.querySelector("#slot-list");
const statusFilter = document.querySelector("#status-filter");
const slotForm = document.querySelector("#slot-form");
const slotStart = document.querySelector("#slot-start");
const adminToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
slotStart.min = `${adminToday}T00:00`;

let appointments = [];
let slots = [];
let realtimeChannel = null;

function showLogin(message) {
  loginView.hidden = false;
  dashboard.hidden = true;
  loginStatus.textContent = message;
}

function showDashboard() {
  loginView.hidden = true;
  dashboard.hidden = false;
}

function showMessage(message, isError = false) {
  dashboardMessage.textContent = message;
  dashboardMessage.style.color = isError ? "#9a4141" : "#3f7049";
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function displayStatus(appointment) {
  if (appointment.status === "payment_pending" && new Date(appointment.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return appointment.status;
}

function makeCell(content, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (typeof content === "string") cell.textContent = content;
  else if (content) cell.append(content);
  return cell;
}

function renderReservations() {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const selectedStatus = statusFilter.value;
  const visible = appointments.filter((appointment) =>
    selectedStatus === "all" || displayStatus(appointment) === selectedStatus
  );
  reservationRows.replaceChildren();

  if (!visible.length) {
    const row = document.createElement("tr");
    const cell = makeCell("No reservations match this filter.", "empty-row");
    cell.colSpan = 6;
    row.append(cell);
    reservationRows.append(row);
    return;
  }

  visible.forEach((appointment) => {
    const row = document.createElement("tr");
    const clientCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "client-name";
    name.textContent = appointment.guest_name;
    const phone = document.createElement("a");
    phone.className = "client-phone";
    phone.href = `tel:${appointment.guest_phone}`;
    phone.textContent = appointment.guest_phone;
    clientCell.append(name, phone);
    if (appointment.note) {
      const note = document.createElement("span");
      note.className = "note-text";
      note.textContent = appointment.note;
      clientCell.append(note);
    }

    const slot = slotById.get(appointment.slot_id);
    const dateCell = document.createElement("td");
    dateCell.textContent = slot ? formatDateTime(slot.starts_at) : "Slot unavailable";
    const state = displayStatus(appointment);
    const statusPill = document.createElement("span");
    statusPill.className = `status-pill ${state === "payment_pending" ? "" : state}`;
    statusPill.textContent = state === "payment_pending" ? "Awaiting payment" : state.replaceAll("_", " ");
    const expiryText = state === "payment_pending"
      ? `Hold until ${formatDateTime(appointment.expires_at)}`
      : state === "confirmed" ? `Paid ${formatDateTime(appointment.paid_at)}` : "";
    const reservationCell = document.createElement("td");
    reservationCell.append(statusPill);
    if (expiryText) {
      const detail = document.createElement("span");
      detail.className = "note-text";
      detail.textContent = expiryText;
      reservationCell.append(detail);
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (appointment.status === "payment_pending" && state !== "expired") {
      const confirmButton = document.createElement("button");
      confirmButton.className = "confirm-action";
      confirmButton.type = "button";
      confirmButton.textContent = "Confirm payment";
      confirmButton.addEventListener("click", () => updateAppointment("confirm_appointment_payment", appointment.id));
      actions.append(confirmButton);
    }
    if (["payment_pending", "confirmed"].includes(appointment.status)) {
      const cancelButton = document.createElement("button");
      cancelButton.className = "cancel-action";
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel booking";
      cancelButton.addEventListener("click", () => updateAppointment("cancel_appointment", appointment.id));
      actions.append(cancelButton);
    }
    if (!actions.childElementCount) actions.textContent = "No actions";

    row.append(
      clientCell,
      makeCell(appointment.service),
      dateCell,
      reservationCell,
      makeCell(appointment.status === "confirmed" ? "Verified" : "Not verified"),
      makeCell(actions)
    );
    reservationRows.append(row);
  });
}

function renderSlots() {
  const upcoming = slots.filter((slot) => new Date(slot.starts_at).getTime() > Date.now());
  document.querySelector("#slot-count").textContent = String(upcoming.filter((slot) => slot.is_active).length);
  slotList.replaceChildren();
  if (!upcoming.length) {
    const empty = document.createElement("p");
    empty.className = "empty-row";
    empty.textContent = "No upcoming slots. Add appointment times when the spa is available.";
    slotList.append(empty);
    return;
  }

  upcoming.forEach((slot) => {
    const row = document.createElement("div");
    row.className = "slot-row";
    const time = document.createElement("time");
    time.dateTime = slot.starts_at;
    time.textContent = formatDateTime(slot.starts_at);
    const state = document.createElement("span");
    const holdActive = slot.reserved_until && slot.reserved_until !== "infinity"
      && new Date(slot.reserved_until).getTime() > Date.now();
    const confirmed = slot.reserved_until === "infinity";
    state.className = `slot-state ${confirmed ? "confirmed" : holdActive ? "held" : ""}`;
    state.textContent = !slot.is_active ? "Inactive" : confirmed ? "Confirmed" : holdActive ? "15-minute hold" : "Available";
    row.append(time, state);
    slotList.append(row);
  });
}

async function refreshDashboard() {
  const [appointmentResult, slotResult] = await Promise.all([
    client.from("appointments").select("id,slot_id,guest_name,guest_phone,service,note,status,expires_at,created_at,paid_at").order("created_at", { ascending: false }),
    client.from("booking_slots").select("id,starts_at,is_active,reserved_until,active_reservation").order("starts_at", { ascending: true })
  ]);
  if (appointmentResult.error) throw appointmentResult.error;
  if (slotResult.error) throw slotResult.error;

  appointments = appointmentResult.data;
  slots = slotResult.data;
  document.querySelector("#pending-count").textContent = String(appointments.filter((appointment) => displayStatus(appointment) === "payment_pending").length);
  document.querySelector("#confirmed-count").textContent = String(appointments.filter((appointment) => appointment.status === "confirmed").length);
  renderReservations();
  renderSlots();
}

async function updateAppointment(action, appointmentId) {
  const confirmPayment = action === "confirm_appointment_payment";
  if (confirmPayment && !window.confirm("Have you verified this payment outside the website? Confirming will secure the appointment.")) return;
  if (!confirmPayment && !window.confirm("Cancel this appointment and release its time slot?")) return;

  showMessage(confirmPayment ? "Confirming verified payment..." : "Cancelling appointment...");
  const { error } = await client.rpc(action, { p_appointment_id: appointmentId });
  if (error) {
    showMessage(error.message, true);
    return;
  }
  showMessage(confirmPayment ? "Payment marked verified and appointment confirmed." : "Appointment cancelled and slot released.");
  try {
    await refreshDashboard();
  } catch (refreshError) {
    showMessage(refreshError.message, true);
  }
}

function subscribeToUpdates() {
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeChannel = client.channel("booking-admin-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => refreshDashboard().catch((error) => showMessage(error.message, true)))
    .on("postgres_changes", { event: "*", schema: "public", table: "booking_slots" }, () => refreshDashboard().catch((error) => showMessage(error.message, true)))
    .subscribe((status) => {
      const liveIndicator = document.querySelector("#live-indicator");
      const connected = status === "SUBSCRIBED";
      liveIndicator.dataset.state = connected ? "live" : ["CHANNEL_ERROR", "TIMED_OUT"].includes(status) ? "offline" : "connecting";
      document.querySelector("#live-label").textContent = connected ? "LIVE" : liveIndicator.dataset.state === "offline" ? "RECONNECTING" : "CONNECTING";
    });
}

async function enterDashboard(user) {
  const { data, error } = await client.from("booking_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error || !data) {
    await client.auth.signOut();
    showLogin(error?.message || "This account is not authorized for booking administration.");
    return;
  }

  showDashboard();
  try {
    await refreshDashboard();
    subscribeToUpdates();
  } catch (refreshError) {
    showMessage(refreshError.message, true);
  }
}

if (!client) {
  showLogin("Booking admin needs the Supabase URL and anon key in booking-config.js.");
} else {
  showLogin("Sign in with your authorized admin account.");
  client.auth.getSession().then(({ data, error }) => {
    if (error) showLogin(error.message);
    else if (data.session) enterDashboard(data.session.user);
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return;
  const submit = loginForm.querySelector("button[type=submit]");
  submit.disabled = true;
  loginStatus.textContent = "Signing in...";
  const formData = new FormData(loginForm);
  const { data, error } = await client.auth.signInWithPassword({
    email: formData.get("email"), password: formData.get("password")
  });
  submit.disabled = false;
  if (error) {
    loginStatus.textContent = error.message;
    return;
  }
  await enterDashboard(data.user);
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  await client.auth.signOut();
  appointments = [];
  slots = [];
  showLogin("You have signed out.");
});

statusFilter.addEventListener("change", renderReservations);
slotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !slotStart.value) return;
  const start = new Date(slotStart.value);
  if (start.getTime() <= Date.now()) {
    showMessage("Choose a future appointment time.", true);
    return;
  }
  const addButton = slotForm.querySelector("button[type=submit]");
  addButton.disabled = true;
  const { error } = await client.from("booking_slots").insert({ starts_at: start.toISOString() });
  addButton.disabled = false;
  if (error) {
    showMessage(error.code === "23505" ? "That appointment time already exists." : error.message, true);
    return;
  }
  slotForm.reset();
  showMessage("Appointment time added to the live calendar.");
  try {
    await refreshDashboard();
  } catch (refreshError) {
    showMessage(refreshError.message, true);
  }
});

window.setInterval(() => {
  if (!dashboard.hidden && client) refreshDashboard().catch((error) => showMessage(error.message, true));
}, 30000);