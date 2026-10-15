# JennyLuxe Skincare & Nail Spa

Responsive business website and booking console for JennyLuxe in Angono, Rizal. The supplied logo is used in the header, footer, and admin page. GitHub Pages deployment is configured in `.github/workflows/pages.yml`.

## Included

- Business story and owner introduction based on the supplied JL image.
- Responsive service approach, location, directions, phone, and social links.
- Appointment calendar backed by Supabase, with Realtime availability and atomic 15-minute slot holds.
- Password-protected booking admin at `admin.html` for live reservations, manual payment confirmation, cancellations, and adding schedule slots.
- WhatsApp handoff for payment instructions and reservation details.
- Scripted concierge for common questions with a Messenger handoff.

## Configure Supabase

GitHub Pages serves the frontend only; Supabase provides the shared booking database and authentication.

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor. This creates the booking tables, row-level security policies, admin-only operations, and Realtime publication.
2. In Supabase Authentication, create the owner's user and confirm the email address.
3. Grant that user admin access in the SQL Editor, replacing the email:

	```sql
	insert into public.booking_admins (user_id)
	select id from auth.users where email = 'owner@example.com'
	on conflict (user_id) do nothing;
	```

4. Put the project's URL and publishable/anon key in `booking-config.js`. The anon key is intended for browser use; never put a service-role key in this file.
5. Open `/admin.html`, sign in, and add the actual appointment times JennyLuxe can honor. The supplied image did not include opening hours, so no times are preloaded.

Clients then see live open times and can reserve one. The database locks each slot atomically and holds it for 15 minutes with status `payment_pending`. The admin dashboard receives Supabase Realtime updates and also refreshes periodically. After contacting the guest and verifying payment in the merchant account, use **Confirm payment** in the dashboard; that permanently reserves the slot. **Cancel booking** releases the slot. Expired holds become available again automatically.

Payment collection and verification are manual; the dashboard does not process payments. Automated payment confirmation requires a merchant account and a server-side payment integration/webhook. Do not put provider secrets in this repository or browser code. The concierge uses fixed responses, not a generative AI model.

## Publish to GitHub Pages

Pushes to `main` run the Pages workflow. The initial deployment in this repository was blocked because GitHub reported an account billing lock; resolve that account issue and rerun the workflow from the repository's Actions page. The site also needs its Pages source set to **GitHub Actions** in repository Settings.

The service menu, prices, opening hours, payment destination, and verified Facebook/Messenger page username were not present in the supplied image. Update these before advertising them. Update `MESSENGER_URL` in `app.js` if `m.me/jennyluxespa` is not the business's actual page username. Facebook and TikTok currently link to business-name searches; replace them with verified account URLs when available.

## Local preview

Open `index.html` in a browser, or run a local static server from the repository root:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.