# Chronos — Time Management App

A full-stack time management app: **React (Vite)** frontend, **Node/Express** API, **SQLite** database.

## Features

| Area | What it does |
|---|---|
| **Login / Sign up** | Username + mobile number, verified by a 6-digit SMS OTP (Twilio). Login uses the mobile number + OTP. OTPs expire in 5 min, max 5 attempts, 30 s resend gap. |
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

**Without Twilio keys** the OTP is printed in the server terminal and also shown on the OTP screen
(dev mode only — never in `NODE_ENV=production`).
**Without `ANTHROPIC_API_KEY`** the analyst uses the built-in rule-based insights.

### Production (single server)

```bash
npm run build                       # builds client/dist
NODE_ENV=production npm start       # Express serves the API and the built app on PORT
```

Set in `server/.env`: a long random `JWT_SECRET`, Twilio credentials (`TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`), and `ANTHROPIC_API_KEY`
(model via `ANTHROPIC_MODEL`). The database is the file `server/data.sqlite` (change with `DB_PATH`).


## Notes

- All times are stored as UTC timestamps; days, hours and streaks are computed in the user's browser time zone (sent with each request).
- Live sessions shorter than 1 minute are discarded. Only one session can be tracked live at a time.
- Import merges: existing data is kept, categories are matched by name, overlapping sessions are skipped and reported.
- Browsers only allow sound after a click, so the alarm is unlocked when you press Start.
