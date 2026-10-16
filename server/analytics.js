// Analytics engine: turns raw sessions into structured statistics/features.
// The AI layer (ai.js) only *interprets* these numbers; it never does the math.

import db from './db.js';
import { loadSessions, streaks } from './stats.js';
import { parts, hhmm, splitByDay, minutesByHour, dayStartTs, addDays, dateRange, today } from './time.js';

const FOCUS_GROUPS = new Set(['study', 'work']);
const BLOCKS = [
  { key: 'morning', label: 'Morning (5 AM–12 PM)', from: 5, to: 12 },
  { key: 'afternoon', label: 'Afternoon (12–5 PM)', from: 12, to: 17 },
  { key: 'evening', label: 'Evening (5–9 PM)', from: 17, to: 21 },
  { key: 'night', label: 'Night (9 PM–5 AM)', from: 21, to: 29 },
];
const r1 = n => Math.round(n * 10) / 10;
const blockOf = hour => BLOCKS.find(b => (hour >= b.from && hour < b.to) || (hour + 24 >= b.from && hour + 24 < b.to)).key;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const stdev = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const hourLabel = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? '12 AM' : x < 12 ? `${x} AM` : x === 12 ? '12 PM' : `${x - 12} PM`; };

function userCategories(uid) {
  return db.prepare('SELECT * FROM categories WHERE user_id=?').all(uid);
}

/** Sessions clipped to [fromTs, toTs) with derived fields. */
function clippedSessions(uid, fromTs, toTs, tz) {
  const cap = Math.min(toTs, Date.now());
  return loadSessions(uid, fromTs, cap).map(s => {
    const start = Math.max(s.start_ts, fromTs), end = Math.min(s.end, cap);
    const p = parts(start, tz);
    return {
      id: s.id, category_id: s.category_id, cat: s.cat, grp: s.grp, color: s.color, goal: s.goal,
      source: s.source, planned_sec: s.planned_sec, live: s.live,
      start, end, minutes: (end - start) / 60000, startHour: p.hour + p.minute / 60, date: p.date,
      productive: s.grp !== 'rest',
      fullMinutes: (s.end - s.start_ts) / 60000,
    };
  }).filter(s => s.minutes > 0);
}

function gapsBetween(sessions, tz) {
  const gaps = [];
  for (let i = 1; i < sessions.length; i++) {
    const a = sessions[i - 1], b = sessions[i];
    if (a.date !== b.date) continue;
    const g = (b.start - a.end) / 60000;
    if (g >= 1) gaps.push({ minutes: r1(g), from: hhmm(a.end, tz), to: hhmm(b.start, tz), date: a.date });
  }
  return gaps;
}

function timerStats(sessions) {
  const timed = sessions.filter(s => s.source === 'timer' && s.planned_sec && !s.live);
  const completed = timed.filter(s => s.fullMinutes * 60 >= s.planned_sec * 0.95);
  const abandoned = timed.filter(s => s.fullMinutes * 60 < s.planned_sec * 0.95);
  const buckets = [
    { label: 'up to 45 min', test: p => p <= 45 },
    { label: '45–90 min', test: p => p > 45 && p <= 90 },
    { label: 'over 90 min', test: p => p > 90 },
  ].map(b => {
    const set = timed.filter(s => b.test(s.planned_sec / 60));
    const done = set.filter(s => s.fullMinutes * 60 >= s.planned_sec * 0.95).length;
    return { planned: b.label, sessions: set.length, completion_rate: set.length ? r1((done / set.length) * 100) : null };
  });
  return {
    timer_sessions: timed.length,
    completed: completed.length,
    abandoned: abandoned.length,
    completion_rate_pct: timed.length ? r1((completed.length / timed.length) * 100) : null,
    median_minutes_before_abandoning: abandoned.length ? r1(median(abandoned.map(s => s.fullMinutes))) : null,
    completion_by_planned_length: buckets.filter(b => b.sessions > 0),
  };
}

function blockStats(productive) {
  return BLOCKS.map(b => {
    const set = productive.filter(s => blockOf(Math.floor(s.startHour)) === b.key);
    return {
      block: b.label, key: b.key, sessions: set.length,
      minutes: r1(set.reduce((t, s) => t + s.minutes, 0)),
      avg_session_min: set.length ? r1(mean(set.map(s => s.minutes))) : null,
    };
  });
}

function earlyVsLate(productive) {
  const early = productive.filter(s => s.startHour < 10), late = productive.filter(s => s.startHour >= 10);
  return {
    sessions_started_before_10am: early.length,
    avg_session_before_10am_min: early.length ? r1(mean(early.map(s => s.minutes))) : null,
    sessions_started_after_10am: late.length,
    avg_session_after_10am_min: late.length ? r1(mean(late.map(s => s.minutes))) : null,
  };
}

/* ======================= Single day ======================= */

export function analyzeDay(uid, date, tz) {
  const fromTs = dayStartTs(date, tz), toTs = dayStartTs(addDays(date, 1), tz);
  const cats = userCategories(uid);
  const sessions = clippedSessions(uid, fromTs, toTs, tz);
  const productive = sessions.filter(s => s.productive);

  const byCat = cats.map(c => {
    const set = sessions.filter(s => s.category_id === c.id);
    const minutes = set.reduce((t, s) => t + s.minutes, 0);
    return {
      category: c.name, group: c.grp, minutes: r1(minutes), sessions: set.length,
      daily_goal_min: c.daily_goal_min,
      goal_met: c.daily_goal_min > 0 ? minutes >= c.daily_goal_min : null,
      goal_progress_pct: c.daily_goal_min > 0 ? r1((minutes / c.daily_goal_min) * 100) : null,
    };
  }).filter(c => c.minutes > 0 || c.daily_goal_min > 0).sort((a, b) => b.minutes - a.minutes);

  const byGroup = {};
  for (const s of sessions) byGroup[s.grp] = r1((byGroup[s.grp] || 0) + s.minutes);

  const longest = productive.reduce((m, s) => (!m || s.minutes > m.minutes ? s : m), null);
  const gaps = gapsBetween(productive, tz);
  const breaks = gaps.filter(g => g.minutes >= 5);
  const largestGap = gaps.reduce((m, g) => (!m || g.minutes > m.minutes ? g : m), null);

  const consistent = byCat.filter(c => c.group !== 'rest' && c.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes)[0];

  const goalCats = byCat.filter(c => c.daily_goal_min > 0);
  const plannedFocus = cats.filter(c => FOCUS_GROUPS.has(c.grp)).reduce((t, c) => t + c.daily_goal_min, 0);
  const focus = sessions.filter(s => FOCUS_GROUPS.has(s.grp)).reduce((t, s) => t + s.minutes, 0);

  return {
    kind: 'day',
    date,
    is_today: date === today(tz),
    total_tracked_min: r1(sessions.reduce((t, s) => t + s.minutes, 0)),
    focus_time_min: r1(focus),
    productive_time_min: r1(productive.reduce((t, s) => t + s.minutes, 0)),
    by_group_min: byGroup,
    by_category: byCat,
    session_count: sessions.length,
    productive_session_count: productive.length,
    average_session_min: productive.length ? r1(mean(productive.map(s => s.minutes))) : null,
    longest_session: longest ? { category: longest.cat, minutes: r1(longest.minutes), from: hhmm(longest.start, tz), to: hhmm(longest.end, tz) } : null,
    most_consistent_activity: consistent ? { category: consistent.category, sessions: consistent.sessions, minutes: consistent.minutes } : null,
    first_start: productive.length ? hhmm(productive[0].start, tz) : null,
    last_end: productive.length ? hhmm(productive[productive.length - 1].end, tz) : null,
    break_frequency: breaks.length,
    average_break_min: breaks.length ? r1(mean(breaks.map(g => g.minutes))) : null,
    largest_gap: largestGap,
    start_time_distribution: blockStats(productive),
    early_vs_late: earlyVsLate(productive),
    goals: {
      categories_with_goal: goalCats.length,
      goals_met: goalCats.filter(c => c.goal_met).length,
      missed: goalCats.filter(c => !c.goal_met).map(c => ({ category: c.category, short_by_min: r1(c.daily_goal_min - c.minutes) })),
    },
    planned_vs_actual_focus: { planned_min: plannedFocus, actual_min: r1(focus), completion_pct: plannedFocus ? r1((focus / plannedFocus) * 100) : null },
    timer: timerStats(sessions),
    timeline: sessions.map(s => ({ category: s.cat, group: s.grp, color: s.color, from: hhmm(s.start, tz), to: hhmm(s.end, tz), minutes: r1(s.minutes), live: s.live })),
  };
}

/* ======================= Range (last N days) ======================= */

export function analyzeRange(uid, endDate, days, tz) {
  const startDate = addDays(endDate, -(days - 1));
  const dates = dateRange(startDate, endDate);
  const fromTs = dayStartTs(startDate, tz), toTs = dayStartTs(addDays(endDate, 1), tz);
  const cats = userCategories(uid);
  const sessions = clippedSessions(uid, fromTs, toTs, tz);
  const productive = sessions.filter(s => s.productive);
  const focusSessions = sessions.filter(s => FOCUS_GROUPS.has(s.grp));

  // per-day per-category minutes (sessions may cross midnight)
  const perDay = Object.fromEntries(dates.map(d => [d, {}]));
  for (const s of sessions) {
    for (const piece of splitByDay(s.start, s.end, tz)) {
      if (perDay[piece.date]) perDay[piece.date][s.category_id] = (perDay[piece.date][s.category_id] || 0) + piece.ms / 60000;
    }
  }

  const byCat = cats.map(c => {
    const daily = dates.map(d => perDay[d][c.id] || 0);
    const total = daily.reduce((a, b) => a + b, 0);
    const daysActive = daily.filter(m => m > 0).length;
    const daysGoalMet = c.daily_goal_min ? daily.filter(m => m >= c.daily_goal_min).length : null;
    return {
      category: c.name, group: c.grp, hours: r1(total / 60), minutes: r1(total), days_active: daysActive,
      daily_goal_min: c.daily_goal_min, days_goal_met: daysGoalMet,
      avg_per_active_day_min: daysActive ? r1(total / daysActive) : 0,
      day_to_day_stdev_min: r1(stdev(daily)),
    };
  }).sort((a, b) => b.minutes - a.minutes);

  const byGroupHours = {};
  for (const c of byCat) byGroupHours[c.group] = r1((byGroupHours[c.group] || 0) + c.hours);

  const focusDaily = dates.map(d => cats.filter(c => FOCUS_GROUPS.has(c.grp)).reduce((t, c) => t + (perDay[d][c.id] || 0), 0));
  const focusTotal = focusDaily.reduce((a, b) => a + b, 0);
  const plannedFocusPerDay = cats.filter(c => FOCUS_GROUPS.has(c.grp)).reduce((t, c) => t + c.daily_goal_min, 0);
  const plannedFocus = plannedFocusPerDay * days;

  // productivity by hour of day (focus groups, or all non-rest if no focus data)
  const hourSource = focusSessions.length ? focusSessions : productive;
  const byHour = new Array(24).fill(0);
  for (const s of hourSource) minutesByHour(s.start, s.end, tz, byHour);
  const windows = [];
  for (let h = 6; h <= 20; h++) windows.push({ from: h, to: h + 3, minutes: byHour[h] + byHour[h + 1] + byHour[h + 2] });
  const best = windows.reduce((m, w) => (w.minutes > m.minutes ? w : m), windows[0]);
  const waking = windows.filter(w => w.from >= 8);
  const worst = waking.reduce((m, w) => (w.minutes < m.minutes ? w : m), waking[0]);

  const consistent = byCat.filter(c => c.group !== 'rest' && c.minutes > 0)
    .sort((a, b) => b.days_active - a.days_active || a.day_to_day_stdev_min / (a.avg_per_active_day_min || 1) - b.day_to_day_stdev_min / (b.avg_per_active_day_min || 1))[0];
  const longest = productive.reduce((m, s) => (!m || s.minutes > m.minutes ? s : m), null);
  const gaps = gapsBetween(productive, tz).filter(g => g.minutes >= 5);
  const activeDays = focusDaily.filter(m => m > 0).length;
  const bestDayIdx = focusDaily.indexOf(Math.max(...focusDaily));

  // previous period, same length, for comparison
  const prevFrom = dayStartTs(addDays(startDate, -days), tz);
  const prevFocus = clippedSessions(uid, prevFrom, fromTs, tz).filter(s => FOCUS_GROUPS.has(s.grp)).reduce((t, s) => t + s.minutes, 0);

  const st = streaks(uid, tz, cats);

  return {
    kind: 'range',
    period: { from: startDate, to: endDate, days },
    total_tracked_hours: r1(sessions.reduce((t, s) => t + s.minutes, 0) / 60),
    focus_hours: r1(focusTotal / 60),
    by_group_hours: byGroupHours,
    by_category: byCat.filter(c => c.minutes > 0 || c.daily_goal_min > 0),
    productive_session_count: productive.length,
    average_session_min: productive.length ? r1(mean(productive.map(s => s.minutes))) : null,
    median_session_min: productive.length ? r1(median(productive.map(s => s.minutes))) : null,
    longest_session: longest ? { category: longest.cat, minutes: r1(longest.minutes), date: longest.date, from: hhmm(longest.start, tz) } : null,
    most_consistent_category: consistent ? { category: consistent.category, days_active: consistent.days_active, of_days: days } : null,
    daily_consistency: {
      active_focus_days: activeDays, of_days: days,
      avg_focus_per_day_min: r1(focusTotal / days),
      focus_stdev_min: r1(stdev(focusDaily)),
      best_day: focusTotal ? { date: dates[bestDayIdx], focus_min: r1(focusDaily[bestDayIdx]) } : null,
    },
    daily_focus_min: dates.map((d, i) => ({ date: d, minutes: r1(focusDaily[i]) })),
    planned_vs_actual_focus: {
      planned_hours: r1(plannedFocus / 60), actual_hours: r1(focusTotal / 60),
      completion_pct: plannedFocus ? r1((focusTotal / plannedFocus) * 100) : null,
    },
    focus_minutes_by_hour: byHour.map(r1),
    most_productive_window: best.minutes > 0 ? { from: hourLabel(best.from), to: hourLabel(best.to), minutes: r1(best.minutes) } : null,
    least_productive_window: best.minutes > 0 ? { from: hourLabel(worst.from), to: hourLabel(worst.to), minutes: r1(worst.minutes) } : null,
    start_time_distribution: blockStats(productive),
    early_vs_late: earlyVsLate(productive),
    breaks: { count: gaps.length, avg_per_active_day: activeDays ? r1(gaps.length / activeDays) : 0, avg_break_min: gaps.length ? r1(mean(gaps.map(g => g.minutes))) : null },
    timer: timerStats(sessions),
    streaks: cats.filter(c => c.daily_goal_min > 0).map(c => ({ category: c.name, current_days: st[c.id].current, best_days: st[c.id].best })),
    previous_period_focus_hours: r1(prevFocus / 60),
    change_vs_previous_pct: prevFocus ? r1(((focusTotal - prevFocus) / prevFocus) * 100) : null,
  };
}
