# Grow to Gobble 🌱😋

Grow the food you love to eat, step by step - written so a 10-year-old can follow it, which makes it easy for everyone.
Pick what you like to eat, and the app plans every job for your part of the UK: buying seeds, sowing, planting out,
looking after it, picking, and eating. Phone notifications nudge you when it's time.

Same setup as the Training Tracker: FastAPI + SQLite + a plain HTML/JS app that installs to the home screen.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app            # then open http://localhost:8000
.venv/bin/python -m pytest         # tests
```

`GARDEN_TODAY=2027-06-15 .venv/bin/python -m app` pretends it's another day - handy for seeing the summer jobs.

## What's where

| File | What it does |
|---|---|
| `app/plants.py` | The plant catalogue (40 fruit & veg): UK dates, difficulty, pots or beds, kid-friendly steps, tips, how to eat it. Plus the no-dig bed and pot guides. **Edit this to add plants.** |
| `app/regions.py` | Postcode → region → how many days earlier/later to plant. Only the first half of the postcode is kept. |
| `app/planner.py` | Turns a crop into dated jobs; bare-bed suggestions; badges. Pure logic, well tested. |
| `app/alerts.py` | Phone notifications (Web Push), frost/heat/dry-spell warnings (Open-Meteo, free), the calendar feed. |
| `app/shops.py` | Buy links (Thompson & Morgan, Suttons, Amazon) and affiliate settings. |
| `app/main.py` | The API. |
| `static/` | The app screens (`app.js`), styles, service worker, icons. |

## Deploy (Railway, from GitHub - like the Training Tracker)

Code: https://github.com/herbiefremantle/growtogobble - every push to `main` redeploys.

1. Railway → **New Project → Deploy from GitHub repo** → `growtogobble`. It builds the `Dockerfile`.
2. On the service: **Settings → Volumes → Add volume**, mount path **`/data`** (the database lives there -
   without it, accounts and gardens are wiped on every deploy).
3. **Settings → Networking → Generate Domain** for a public https address.
4. Optional variables (**Variables** tab):
   - `VAPID_CONTACT=mailto:you@yourdomain` - contact address sent with push notifications
   - `AMAZON_TAG`, `AWIN_ID`, `AWIN_MID_THOMPSON_MORGAN`, `AWIN_MID_SUTTONS` - affiliate ids (see `app/shops.py`)
   - `SESSION_SECRET` - otherwise one is generated and stored in the database
   - `ADMIN_EMAIL=you@example.com` - that account becomes an admin (comma-separate several). Admins get an
     **Admin** page under Badges → My account: every account, one-time password-reset links, make/remove admins,
     delete accounts, and a check that the database is safely on the volume.

Notifications need HTTPS (Railway gives you that). On iPhone they work once the app is added to the Home Screen (iOS 16.4+).

## Not done yet

- Password reset by email (needs an email service such as Postmark or Resend) - for now an admin makes a
  one-time reset link and sends it themselves, like the Training Tracker
- Photos/illustrations for each step (emoji for now)
- Crop rotation advice, and a drawn garden layout
- App Store / Play Store versions (the installable web app covers phones for now)
