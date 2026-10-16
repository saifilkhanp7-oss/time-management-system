// Timezone helpers. The client sends its IANA timezone (x-tz header) so that
// "a day" and "an hour" mean the user's local day/hour, not the server's.

const cache = new Map();
function fmt(tz) {
  if (!cache.has(tz)) {
    cache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return cache.get(tz);
}

export function validTz(tz) {
  try { if (tz) { fmt(tz); return tz; } } catch { /* fall through */ }
  return 'Asia/Kolkata';
}

const pad = n => String(n).padStart(2, '0');

export function parts(ts, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ts))) o[p.type] = p.value;
  const hour = +o.hour % 24;
  return { date: `${o.year}-${o.month}-${o.day}`, hour, minute: +o.minute, second: +o.second };
}

export const localDate = (ts, tz) => parts(ts, tz).date;
export const hhmm = (ts, tz) => { const p = parts(ts, tz); return `${pad(p.hour)}:${pad(p.minute)}`; };
export const today = tz => localDate(Date.now(), tz);

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Epoch ms of local midnight that starts `dateStr` in `tz`. */
export function dayStartTs(dateStr, tz) {
  const target = Date.parse(dateStr + 'T00:00:00Z');
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const localAsUtc = Date.parse(`${p.date}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}Z`);
    const diff = target - localAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** Splits [start,end) into pieces per local day: [{date, ms}] */
export function splitByDay(start, end, tz) {
  const out = [];
  let s = start;
  while (s < end) {
    const date = localDate(s, tz);
    const boundary = dayStartTs(addDays(date, 1), tz);
    const e = Math.min(boundary, end);
    out.push({ date, ms: e - s });
    s = e;
  }
  return out;
}

/** Splits [start,end) into minutes per local hour-of-day (array of 24). */
export function minutesByHour(start, end, tz, acc = new Array(24).fill(0)) {
  let s = start;
  while (s < end) {
    const p = parts(s, tz);
    const msIntoHour = (p.minute * 60 + p.second) * 1000 + (s % 1000);
    const e = Math.min(s - msIntoHour + 3600000, end);
    acc[p.hour] += (e - s) / 60000;
    s = e;
  }
  return acc;
}

export const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
