import db from './db.js';
import { splitByDay, dayStartTs, addDays, today } from './time.js';

/** Sessions (with category info) overlapping [fromTs, toTs). Live sessions end "now". */
export function loadSessions(userId, fromTs, toTs) {
  const now = Date.now();
  return db.prepare(`SELECT s.*, c.name AS cat, c.grp, c.color, c.daily_goal_min AS goal
                     FROM sessions s JOIN categories c ON c.id = s.category_id
                     WHERE s.user_id=? AND s.start_ts < ? AND COALESCE(s.end_ts, ?) > ?
                     ORDER BY s.start_ts`)
    .all(userId, toTs, now, fromTs)
    .map(s => ({ ...s, end: s.end_ts ?? now, live: s.end_ts == null }));
}

/** { 'YYYY-MM-DD': { [categoryId]: minutes } } for every local day in [from, to]. */
export function dailyTotals(userId, from, to, tz) {
  const fromTs = dayStartTs(from, tz);
  const toTs = dayStartTs(addDays(to, 1), tz);
  const out = {};
  for (const s of loadSessions(userId, fromTs, toTs)) {
    const start = Math.max(s.start_ts, fromTs), end = Math.min(s.end, toTs);
    for (const piece of splitByDay(start, end, tz)) {
      const day = (out[piece.date] ||= {});
      day[s.category_id] = (day[s.category_id] || 0) + piece.ms / 60000;
    }
  }
  for (const d of Object.values(out)) for (const k in d) d[k] = Math.round(d[k] * 10) / 10;
  return out;
}

/** Current and best streak per category. A day counts when the daily goal is reached.
 *  Today still being in progress does not break the current streak. */
export function streaks(userId, tz, categories) {
  const end = today(tz);
  const start = addDays(end, -365);
  const totals = dailyTotals(userId, start, end, tz);
  const result = {};
  for (const c of categories) {
    if (!c.daily_goal_min) { result[c.id] = { current: 0, best: 0, todayMet: false }; continue; }
    const met = d => (totals[d]?.[c.id] || 0) >= c.daily_goal_min;
    const todayMet = met(end);
    let current = 0;
    let d = todayMet ? end : addDays(end, -1);
    while (d >= start && met(d)) { current++; d = addDays(d, -1); }
    let best = 0, run = 0;
    for (let x = start; x <= end; x = addDays(x, 1)) { run = met(x) ? run + 1 : 0; best = Math.max(best, run); }
    result[c.id] = { current, best, todayMet };
  }
  return result;
}
