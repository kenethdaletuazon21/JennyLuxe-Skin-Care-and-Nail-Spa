# JennyLuxe Skincare & Nail Spa

Static, responsive business website for JennyLuxe in Angono, Rizal. The site is deployed to GitHub Pages by `.github/workflows/pages.yml` whenever changes are pushed to `main`.

## Included

- Business story and owner introduction based on the supplied JL image.
- Responsive service approach, location, directions, phone, and social links.
- Appointment request form that opens WhatsApp with the guest's selected details.
- Scripted concierge for common questions with a Messenger handoff.

## Booking and payment limitation

GitHub Pages only serves static files. The appointment form sends a request to WhatsApp; it does not save a booking, verify payment, or hold a time slot. The concierge uses fixed responses, not a generative AI model. For confirmed paid reservations, connect a booking backend and a payment provider (for example, a merchant-configured PayMongo integration) and only lock a slot after a verified payment webhook. Do not put provider secrets in this repository or browser code.

The service menu, prices, opening hours, payment destination, and verified Facebook/Messenger page username were not present in the supplied image. Review those details before advertising them. Update `MESSENGER_URL` in `app.js` if `m.me/jennyluxespa` is not the business's actual page username. Facebook and TikTok currently link to business-name searches; replace them with verified account URLs when available.

## Local preview

Open `index.html` in a browser, or run a local static server from the repository root:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.