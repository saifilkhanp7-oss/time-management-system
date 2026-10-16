import { Router } from 'express';
import db, { GROUPS, nextColor } from './db.js';
import { requireAuth } from './auth.js';
import { dailyTotals, streaks } from './stats.js';
import { today, addDays, dayStartTs, isDateStr, localDate } from './time.js';
import { analyzeDay, analyzeRange } from './analytics.js';
import { interpret } from './ai.js';

export const api = Router();
api.use(requireAuth);

const DAY = 86400000;
const MIN_LIVE_MS = 60 * 1000; // live sessions shorter than a minute are discarded
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const toInt = v => (Number.isFinite(+v) ? Math.round(+v) : NaN);

function getCategory(userId, id) {
  return db.prepare('SELECT * FROM categories WHERE id=? AND user_id=?').get(id, userId);
}

/** Returns the first session that overlaps [start,end), or undefined. */
function findOverlap(userId, start, end, ignoreId = -1) {
  return db.prepare(`SELECT s.*, c.name AS cat FROM sessions s JOIN categories c ON c.id=s.category_id
                     WHERE s.user_id=? AND s.id<>? AND s.start_ts < ? AND COALESCE(s.end_ts, ?) > ?
                     ORDER BY s.start_ts LIMIT 1`).get(userId, ignoreId, end, Date.now(), start);
}

function overlapMessage(o, tz) {
  const f = ts => new Date(ts).toLocaleString('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  return `This overlaps with a "${o.cat}" session (${f(o.start_ts)} – ${o.end_ts ? f(o.end_ts) : 'now, still running'}).`;
}

/* ---------------- Categories ---------------- */

function categoriesWithStats(req) {
  const cats = db.prepare('SELECT * FROM categories WHERE user_id=? ORDER BY is_default DESC, created_at, id').all(req.user.id);
  const t = today(req.tz);
  const todayTotals = dailyTotals(req.user.id, t, t, req.tz)[t] || {};
  const st = streaks(req.user.id, req.tz, cats);
  return cats.map(c => ({ ...c, today_min: todayTotals[c.id] || 0, streak: st[c.id] }));
}

api.get('/categories', (req, res) => res.json({ categories: categoriesWithStats(req) }));

api.post('/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const grp = GROUPS.includes(req.body?.grp) ? req.body.grp : 'other';
  const goal = toInt(req.body?.daily_goal_min ?? 0);
  if (!name || name.length > 30) return bad(res, 'Category name must be 1–30 characters.');
  if (!(goal >= 0 && goal <= 1440)) return bad(res, 'Daily goal must be between 0 and 1440 minutes.');
  if (db.prepare('SELECT 1 FROM categories WHERE user_id=? AND name=? COLLATE NOCASE').get(req.user.id, name)) {
    return bad(res, `A category named "${name}" already exists.`, 409);
  }
  db.prepare('INSERT INTO categories(user_id,name,grp,color,daily_goal_min,is_default,created_at) VALUES(?,?,?,?,?,0,?)')
    .run(req.user.id, name, grp, nextColor(req.user.id), goal, Date.now());
  res.status(201).json({ categories: categoriesWithStats(req) });
});

api.patch('/categories/:id', (req, res) => {
  const c = getCategory(req.user.id, req.params.id);
  if (!c) return bad(res, 'Category not found.', 404);
  const goal = req.body?.daily_goal_min !== undefined ? toInt(req.body.daily_goal_min) : c.daily_goal_min;
  const grp = GROUPS.includes(req.body?.grp) ? req.body.grp : c.grp;
  if (!(goal >= 0 && goal <= 1440)) return bad(res, 'Daily goal must be between 0 and 1440 minutes.');
  db.prepare('UPDATE categories SET daily_goal_min=?, grp=? WHERE id=?').run(goal, grp, c.id);
  res.json({ categories: categoriesWithStats(req) });
});

api.delete('/categories/:id', (req, res) => {
  const c = getCategory(req.user.id, req.params.id);
  if (!c) return bad(res, 'Category not found.', 404);
  db.prepare('DELETE FROM categories WHERE id=?').run(c.id);
  res.json({ categories: categoriesWithStats(req) });
});

/* ---------------- Sessions ---------------- */

api.get('/sessions', (req, res) => {
  const date = isDateStr(req.query.date) ? req.query.date : today(req.tz);
  const from = dayStartTs(date, req.tz), to = dayStartTs(addDays(date, 1), req.tz);
  const rows = db.prepare(`SELECT s.*, c.name AS cat, c.color FROM sessions s JOIN categories c ON c.id=s.category_id
                           WHERE s.user_id=? AND s.start_ts < ? AND COALESCE(s.end_ts, ?) > ? ORDER BY s.start_ts`)
    .all(req.user.id, to, Date.now(), from);
  res.json({ date, sessions: rows });
});

api.post('/sessions', (req, res) => {
  const { category_id } = req.body || {};
  const start = toInt(req.body?.start_ts), end = toInt(req.body?.end_ts);
  if (!getCategory(req.user.id, category_id)) return bad(res, 'Pick a valid category.');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return bad(res, 'Start and end time are required.');
  if (end <= start) return bad(res, 'End time must be after start time.');
  if (end - start > DAY) return bad(res, 'A single session cannot be longer than 24 hours.');
  if (end > Date.now() + 30000) return bad(res, 'A session cannot end in the future.');
  if (start < Date.parse('2020-01-01T00:00:00Z') - DAY) return bad(res, 'Sessions before 2020 are not supported.');
  const o = findOverlap(req.user.id, start, end);
  if (o) return bad(res, overlapMessage(o, req.tz), 409);
  const info = db.prepare('INSERT INTO sessions(user_id,category_id,start_ts,end_ts,source,created_at) VALUES(?,?,?,?,?,?)')
    .run(req.user.id, category_id, start, end, 'manual', Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

api.delete('/sessions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM sessions WHERE id=? AND user_id=? AND end_ts IS NOT NULL').run(req.params.id, req.user.id);
  if (!r.changes) return bad(res, 'Session not found (stop a running session before deleting it).', 404);
  res.json({ ok: true });
});

/* ---------------- Live tracking (shared by tracker + timer) ---------------- */

const liveRow = userId => db.prepare(`SELECT s.*, c.name AS cat, c.color FROM sessions s JOIN categories c ON c.id=s.category_id
                                       WHERE s.user_id=? AND s.end_ts IS NULL`).get(userId) || null;

api.get('/live', (req, res) => res.json({ live: liveRow(req.user.id) }));

api.post('/live/start', (req, res) => {
  const { category_id } = req.body || {};
  const source = req.body?.source === 'timer' ? 'timer' : 'live';
  const planned = req.body?.planned_sec ? toInt(req.body.planned_sec) : null;
  if (!getCategory(req.user.id, category_id)) return bad(res, 'Pick a valid category.');
  const current = liveRow(req.user.id);
  if (current) return bad(res, `You are already tracking "${current.cat}". Stop it first.`, 409);
  const now = Date.now();
  const o = findOverlap(req.user.id, now, now + 1);
  if (o) return bad(res, overlapMessage(o, req.tz), 409);
  db.prepare('INSERT INTO sessions(user_id,category_id,start_ts,end_ts,source,planned_sec,created_at) VALUES(?,?,?,NULL,?,?,?)')
    .run(req.user.id, category_id, now, source, planned, now);
  res.status(201).json({ live: liveRow(req.user.id) });
});

api.post('/live/stop', (req, res) => {
  const current = liveRow(req.user.id);
  if (!current) return res.json({ live: null, stopped: null });
  let end = Date.now();
  const asked = toInt(req.body?.end_ts);
  if (Number.isFinite(asked) && asked >= current.start_ts && asked < end) end = asked;
  if (end - current.start_ts < MIN_LIVE_MS) {
    db.prepare('DELETE FROM sessions WHERE id=?').run(current.id);
    return res.json({ live: null, stopped: null, discarded: true });
  }
  db.prepare('UPDATE sessions SET end_ts=? WHERE id=?').run(end, current.id);
  res.json({ live: null, stopped: { ...current, end_ts: end } });
});

/* ---------------- Stats ---------------- */

api.get('/stats/daily', (req, res) => {
  const { from, to } = req.query;
  if (!isDateStr(from) || !isDateStr(to) || from > to) return bad(res, 'from/to must be YYYY-MM-DD');
  if ((Date.parse(to) - Date.parse(from)) / DAY > 2600) return bad(res, 'Range too large.');
  res.json({ days: dailyTotals(req.user.id, from, to, req.tz) });
});

/* ---------------- Planner goals ---------------- */

const goalsPayload = req => {
  const t = today(req.tz);
  const rows = db.prepare('SELECT * FROM goals WHERE user_id=? ORDER BY pinned DESC, created_at').all(req.user.id);
  const open = rows.filter(g => !g.completed);
  const doneToday = rows.filter(g => g.completed && localDate(g.completed_at, req.tz) === t);
  return { today: t, open, doneToday };
};

api.get('/goals', (req, res) => res.json(goalsPayload(req)));

api.post('/goals', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text || text.length > 200) return bad(res, 'Goal must be 1–200 characters.');
  db.prepare('INSERT INTO goals(user_id,text,created_date,created_at) VALUES(?,?,?,?)').run(req.user.id, text, today(req.tz), Date.now());
  res.status(201).json(goalsPayload(req));
});

api.patch('/goals/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM goals WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!g) return bad(res, 'Goal not found.', 404);
  const b = req.body || {};
  let { text, pinned, completed, completed_at } = g;
  if (b.text !== undefined) {
    text = String(b.text).trim();
    if (!text || text.length > 200) return bad(res, 'Goal must be 1–200 characters.');
  }
  if (b.pinned !== undefined) {
    pinned = b.pinned ? 1 : 0;
    if (pinned && !g.pinned) {
      const n = db.prepare('SELECT COUNT(*) n FROM goals WHERE user_id=? AND pinned=1 AND completed=0').get(req.user.id).n;
      if (n >= 4) return bad(res, 'You can pin at most 4 goals. Unpin one first.');
    }
  }
  if (b.completed !== undefined) {
    completed = b.completed ? 1 : 0;
    completed_at = completed ? Date.now() : null;
    if (completed) pinned = 0;
  }
  db.prepare('UPDATE goals SET text=?, pinned=?, completed=?, completed_at=? WHERE id=?').run(text, pinned, completed, completed_at, g.id);
  res.json(goalsPayload(req));
});

api.delete('/goals/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json(goalsPayload(req));
});

/* ---------------- Reminders ---------------- */

const remindersPayload = req => ({
  today: today(req.tz),
  reminders: db.prepare('SELECT * FROM reminders WHERE user_id=? AND date>=? ORDER BY date, created_at').all(req.user.id, today(req.tz)),
});

api.get('/reminders', (req, res) => res.json(remindersPayload(req)));

api.post('/reminders', (req, res) => {
  const { date } = req.body || {};
  const text = String(req.body?.text || '').trim();
  const t = today(req.tz);
  if (!isDateStr(date)) return bad(res, 'Pick a date.');
  if (date <= t) return bad(res, 'Reminders can only be added for future days.');
  if (date.slice(0, 4) !== t.slice(0, 4)) return bad(res, 'Reminders can only be added for this year.');
  if (!text || text.length > 300) return bad(res, 'Reminder must be 1–300 characters.');
  db.prepare('INSERT INTO reminders(user_id,date,text,created_at) VALUES(?,?,?,?)').run(req.user.id, date, text, Date.now());
  res.status(201).json(remindersPayload(req));
});

api.delete('/reminders/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json(remindersPayload(req));
});

/* ---------------- World clocks ---------------- */

const clocksPayload = req => ({ clocks: db.prepare('SELECT * FROM clocks WHERE user_id=? ORDER BY is_default DESC, created_at').all(req.user.id) });

api.get('/clocks', (req, res) => res.json(clocksPayload(req)));

api.post('/clocks', (req, res) => {
  const label = String(req.body?.label || '').trim().slice(0, 60);
  const tz = String(req.body?.tz || '');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return bad(res, 'Unknown time zone.'); }
  if (!label) return bad(res, 'Clock label is required.');
  if (db.prepare('SELECT 1 FROM clocks WHERE user_id=? AND label=?').get(req.user.id, label)) return bad(res, `${label} is already on your board.`, 409);
  db.prepare('INSERT INTO clocks(user_id,label,tz,created_at) VALUES(?,?,?,?)').run(req.user.id, label, tz, Date.now());
  res.status(201).json(clocksPayload(req));
});

api.delete('/clocks/:id', (req, res) => {
  const r = db.prepare('DELETE FROM clocks WHERE id=? AND user_id=? AND is_default=0').run(req.params.id, req.user.id);
  if (!r.changes) return bad(res, 'The default India clock cannot be removed.');
  res.json(clocksPayload(req));
});

/* ---------------- Import / export ---------------- */

api.get('/export', (req, res) => {
  const uid = req.user.id;
  const cats = db.prepare('SELECT * FROM categories WHERE user_id=?').all(uid);
  const byId = Object.fromEntries(cats.map(c => [c.id, c.name]));
  res.json({
    app: 'chronos', version: 1, exported_at: new Date().toISOString(), username: req.user.username,
    categories: cats.map(c => ({ name: c.name, group: c.grp, color: c.color, daily_goal_min: c.daily_goal_min })),
    sessions: db.prepare('SELECT * FROM sessions WHERE user_id=? AND end_ts IS NOT NULL ORDER BY start_ts').all(uid)
      .map(s => ({ category: byId[s.category_id], start: new Date(s.start_ts).toISOString(), end: new Date(s.end_ts).toISOString(), source: s.source, planned_sec: s.planned_sec })),
    goals: db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid)
      .map(g => ({ text: g.text, created_date: g.created_date, pinned: !!g.pinned, completed: !!g.completed, completed_at: g.completed_at ? new Date(g.completed_at).toISOString() : null })),
    reminders: db.prepare('SELECT date,text FROM reminders WHERE user_id=?').all(uid),
    clocks: db.prepare('SELECT label,tz FROM clocks WHERE user_id=? AND is_default=0').all(uid),
  });
});

api.post('/import', (req, res) => {
  const d = req.body;
  if (!d || d.app !== 'chronos' || !Array.isArray(d.categories)) return bad(res, 'This does not look like a Chronos export file.');
  const uid = req.user.id;
  const report = { categories: 0, sessions: 0, sessionsSkipped: 0, goals: 0, reminders: 0, clocks: 0 };
  const run = db.transaction(() => {
    const catId = {};
    for (const c of db.prepare('SELECT id,name FROM categories WHERE user_id=?').all(uid)) catId[c.name.toLowerCase()] = c.id;
    for (const c of d.categories) {
      const name = String(c?.name || '').trim().slice(0, 30);
      if (!name || catId[name.toLowerCase()]) continue;
      const goal = Math.min(1440, Math.max(0, toInt(c.daily_goal_min) || 0));
      const info = db.prepare('INSERT INTO categories(user_id,name,grp,color,daily_goal_min,created_at) VALUES(?,?,?,?,?,?)')
        .run(uid, name, GROUPS.includes(c.group) ? c.group : 'other', /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : nextColor(uid), goal, Date.now());
      catId[name.toLowerCase()] = info.lastInsertRowid;
      report.categories++;
    }
    const ins = db.prepare('INSERT INTO sessions(user_id,category_id,start_ts,end_ts,source,planned_sec,created_at) VALUES(?,?,?,?,?,?,?)');
    for (const s of d.sessions || []) {
      const cid = catId[String(s?.category || '').toLowerCase()];
      const st = Date.parse(s?.start), en = Date.parse(s?.end);
      if (!cid || !(en > st) || en - st > DAY || en > Date.now() || findOverlap(uid, st, en)) { report.sessionsSkipped++; continue; }
      ins.run(uid, cid, st, en, ['manual', 'live', 'timer'].includes(s.source) ? s.source : 'manual', toInt(s.planned_sec) || null, Date.now());
      report.sessions++;
    }
    for (const g of d.goals || []) {
      const text = String(g?.text || '').trim().slice(0, 200);
      if (!text || !isDateStr(g.created_date)) continue;
      if (db.prepare('SELECT 1 FROM goals WHERE user_id=? AND text=? AND created_date=?').get(uid, text, g.created_date)) continue;
      const doneAt = g.completed ? Date.parse(g.completed_at) || Date.now() : null;
      db.prepare('INSERT INTO goals(user_id,text,created_date,pinned,completed,completed_at,created_at) VALUES(?,?,?,0,?,?,?)')
        .run(uid, text, g.created_date, g.completed ? 1 : 0, doneAt, Date.now());
      report.goals++;
    }
    for (const r of d.reminders || []) {
      const text = String(r?.text || '').trim().slice(0, 300);
      if (!text || !isDateStr(r.date)) continue;
      if (db.prepare('SELECT 1 FROM reminders WHERE user_id=? AND date=? AND text=?').get(uid, r.date, text)) continue;
      db.prepare('INSERT INTO reminders(user_id,date,text,created_at) VALUES(?,?,?,?)').run(uid, r.date, text, Date.now());
      report.reminders++;
    }
    for (const c of d.clocks || []) {
      try { new Intl.DateTimeFormat('en', { timeZone: c.tz }); } catch { continue; }
      const label = String(c.label || '').trim().slice(0, 60);
      if (!label || db.prepare('SELECT 1 FROM clocks WHERE user_id=? AND label=?').get(uid, label)) continue;
      db.prepare('INSERT INTO clocks(user_id,label,tz,created_at) VALUES(?,?,?,?)').run(uid, label, c.tz, Date.now());
      report.clocks++;
    }
  });
  run();
  res.json({ report });
});

/* ---------------- AI analyst ---------------- */

api.get('/analytics/day', async (req, res) => {
  const date = isDateStr(req.query.date) ? req.query.date : today(req.tz);
  const stats = analyzeDay(req.user.id, date, req.tz);
  const insights = await interpret('day', stats);
  res.json({ stats, insights });
});

api.get('/analytics/range', async (req, res) => {
  const days = [7, 14, 30].includes(+req.query.days) ? +req.query.days : 7;
  const end = isDateStr(req.query.end) ? req.query.end : today(req.tz);
  const stats = analyzeRange(req.user.id, end, days, req.tz);
  const insights = await interpret('range', stats);
  res.json({ stats, insights });
});
