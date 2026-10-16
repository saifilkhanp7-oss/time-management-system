# Chronos — Time Management App

A full-stack time management app: **React (Vite)** frontend, **Node/Express** API, **SQLite** database.

## Features

| Area | What it does |
|---|---|
| **Login / Sign up** | Sign up with name + email, log in with email. A 6-digit code is emailed (from your Gmail). Codes expire in 5 min, max 5 attempts, 30 s resend gap. A device stays logged in: the login lasts a year and renews every time the app is opened. |
| **Light / dark mode** | Sun/moon icon at the top of every page, remembered per browser. |
| **Home** | App description, *“Your tomorrow's activity is: …”* reminders, *“Warning: goals not completed”* with the full open-goal list, today's live pie chart + yesterday's end-of-day pie chart, streak tiles. |
| **Time Tracker** | 5 default categories (Study, Work, Sleep, Gym, Other), *Add a new category* checkbox, category search, delete with *“Do you want to delete this?”*. Daily goal per category → streaks. Add sessions by date + start/end time (end ≤ start means it crosses midnight, e.g. sleep). **Sessions can't overlap any other tracked session and can't end in the future** (checked in the browser and enforced by the server). Week bar chart per category with goal line, year calendar heatmap (2020–2026, all 12 months), live "Start tracking now", **Import JSON / Export JSON**. |
| **Timer** | Same categories, hr/min/sec + presets, Start / Pause / Resume / Stop, 5 built-in alarm tunes (Web Audio, no files). Starting a timer tracks time automatically; stopping tracking in the tracker pauses the timer (and resuming tracking for that category resumes it). When time is up, tracking stops and the alarm rings; if not turned off it **snoozes and rings again every 2 minutes**. |
| **Planner** | Add / edit / delete (“Do you want to delete this?”) goals, pin up to 4, mark complete (“Do you want to mark it as complete?”) → firecracker burst. Unfinished goals carry over to the next day and show as a warning on Home. |
| **Reminders** | Calendar of the current year; only future days are selectable. The day before, the reminder shows on Home. |
| **World Clock** | India (default, can't be removed) + any country from a searchable list; analog + digital clocks, day/night faces, offset from you. |
| **AI Analyst** | Day / last 7 / last 30 days. See below. |

## How the AI analyst works

```
Raw sessions → Backend → Analytics engine (server/analytics.js) → statistics/features → AI interpretation (server/ai.js) → insights
```

The **app does the math**; the AI only explains it. `analytics.js` computes, per day or range:
total & focus time, per-category/per-group totals, average/median/longest session, break frequency and
largest gap, start-time distribution by time block, before-vs-after-10-AM session length, minutes by hour
of day → most/least productive 3-hour window, planned vs actual (daily goals × days), goal completion,
daily consistency, streaks, timer completion/abandonment (median minutes before abandoning, completion by
planned length), and change vs the previous period.

Those structured features (visible in the UI under *“Structured features sent to the AI”*) are sent to
Claude with instructions to interpret only the given numbers. Without an API key, or if the API call
fails, a built-in rule-based interpreter produces the same output shape (headline, observations,
patterns, suggestions). Sleep (group `rest`) is excluded from productivity metrics. When you add a
category you choose its group (study, work, health, rest, leisure, other) — study + work count as “focus”.

## Run it locally

Requires Node.js 18+.

```bash
npm run install:all
cp server/.env.example server/.env      # optional — works without editing

# terminal 1
npm run dev:server     # API on http://localhost:4000
# terminal 2
npm run dev:client     # app on http://localhost:5173
```

**Without an email sender** the code is printed in the server terminal and also shown on the code screen
(local dev, or when `OTP_DEMO_MODE=true`).
**Without `ANTHROPIC_API_KEY`** the analyst uses the built-in rule-based insights.

### Production (single server)

```bash
npm run build                       # builds client/dist
NODE_ENV=production npm start       # Express serves the API and the built app on PORT
```

Set in `server/.env`: a long random `JWT_SECRET`, an email sender (`GMAIL_SCRIPT_URL` + `GMAIL_SCRIPT_SECRET`,
or `GMAIL_USER` + `GMAIL_APP_PASSWORD`), and optionally `ANTHROPIC_API_KEY` (model via `ANTHROPIC_MODEL`). The database is the file `server/data.sqlite` (change with `DB_PATH`).

## Publish it online

The repo includes a `Dockerfile`. Any host that can run a Docker container **and give it a persistent
disk** works (Railway, Render with a disk, Fly.io, a VPS). The disk matters: the database is a SQLite
file, and without a persistent disk all accounts and data are wiped every time the server restarts.

**Railway (recommended, simplest):**
1. Push this folder to a GitHub repository.
2. On railway.app: *New Project → Deploy from GitHub repo* → pick the repo. It finds the `Dockerfile` automatically.
3. In the service: *Settings → Volumes → Add volume*, mount path **`/data`**.
4. *Variables* → add the environment variables below.
5. *Settings → Networking → Generate Domain* → your app is live at that URL.

**Environment variables for production**

| Variable | Required | Value |
|---|---|---|
| `JWT_SECRET` | yes | long random string (24+ chars). The server refuses to start without it. **Never change it** — changing it logs everyone out. |
| `GMAIL_SCRIPT_URL`, `GMAIL_SCRIPT_SECRET` | for real email codes on Railway | see *Email login* below |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | alternative, local / Railway Pro only | Gmail address + App Password (SMTP is blocked on Railway Free/Hobby) |
| `OTP_DEMO_MODE` | optional | `true` shows the code on screen when no email sender is set. **Anyone can then log in to any account** — demo only. |
| `ANTHROPIC_API_KEY` | optional | turns on Claude for the AI analyst |

Safety built in: code requests are limited to 8 per IP per hour, plus 5 tries per code and a 30 s resend gap. Health check: `GET /api/health`.

## Email login (send codes from your Gmail)

Railway's Free/Hobby plans block normal email sending (SMTP), so the app sends through a tiny
Google Apps Script that runs inside your Gmail account and is called over HTTPS. Free, ~100 emails/day.

1. Open https://script.google.com signed in to the Gmail that should send the codes → **New project**.
2. Delete the sample code, paste all of `gmail-sender.gs`, and change `SECRET` to your own long random text. Save.
3. Pick `testSend` in the function list → **Run** → allow the permissions (Advanced → Go to project → Allow). You get a test email.
4. **Deploy → New deployment** → type **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → **Deploy**. Copy the **Web app URL** (ends in `/exec`).
5. In Railway → Variables: `GMAIL_SCRIPT_URL` = that URL, `GMAIL_SCRIPT_SECRET` = the same secret as in the script. Remove `OTP_DEMO_MODE`.

If you edit the script later, use **Deploy → Manage deployments → Edit → Version: New version** so the URL stays the same.

## Project layout

```
server/
  index.js        Express app, serves client/dist in production
  auth.js         email code request/verify, long-lived login tokens, auth middleware
  mailer.js       sends the code: Gmail Apps Script, Gmail SMTP, or console
  db.js           SQLite schema, default categories + India clock per new user
  api.js          categories, sessions (overlap rules), live tracking, stats, goals, reminders, clocks, import/export, analytics routes
  stats.js        daily totals per category, streaks
  analytics.js    analytics engine (feature computation)
  ai.js           Claude interpretation + rule-based fallback
  time.js         timezone-aware day/hour helpers (uses the browser's time zone)
client/src/
  AppContext.jsx  auth, theme, toasts/confirm dialog, live tracking + timer state machine (sync, ring, snooze)
  pages/          Auth, Home, Tracker, Timer, Planner, Reminders, WorldClock, Analyst
  components/     WeekChart, YearCalendar, DayPie, icons, theme toggle
  lib/            api client, time helpers, alarm tunes, country → time zone list
```

## Notes

- All times are stored as UTC timestamps; days, hours and streaks are computed in the user's browser time zone (sent with each request).
- Live sessions shorter than 1 minute are discarded. Only one session can be tracked live at a time.
- Import merges: existing data is kept, categories are matched by name, overlapping sessions are skipped and reported.
- Browsers only allow sound after a click, so the alarm is unlocked when you press Start.
