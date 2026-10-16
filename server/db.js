import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mobile TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS otps (
  mobile TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  username TEXT,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grp TEXT NOT NULL DEFAULT 'other',
  color TEXT NOT NULL,
  daily_goal_min INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_name ON categories(user_id, name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,               -- NULL = live session currently being tracked
  source TEXT NOT NULL DEFAULT 'manual',  -- manual | live | timer
  planned_sec INTEGER,          -- timer sessions: how long the timer was set for
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sess_user_time ON sessions(user_id, start_ts);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_date TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clocks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  tz TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

export const PALETTE = ['#4f7cff', '#f5a524', '#8b5cf6', '#17c3b2', '#94a3b8', '#ef476f', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6', '#a16207'];
export const GROUPS = ['study', 'work', 'health', 'rest', 'leisure', 'other'];

const DEFAULT_CATEGORIES = [
  { name: 'Study', grp: 'study', goal: 120 },
  { name: 'Work', grp: 'work', goal: 240 },
  { name: 'Sleep', grp: 'rest', goal: 420 },
  { name: 'Gym', grp: 'health', goal: 45 },
  { name: 'Other', grp: 'other', goal: 0 },
];

export function seedUser(userId) {
  const now = Date.now();
  const ins = db.prepare('INSERT INTO categories(user_id,name,grp,color,daily_goal_min,is_default,created_at) VALUES(?,?,?,?,?,1,?)');
  DEFAULT_CATEGORIES.forEach((c, i) => ins.run(userId, c.name, c.grp, PALETTE[i], c.goal, now));
  db.prepare('INSERT INTO clocks(user_id,label,tz,is_default,created_at) VALUES(?,?,?,1,?)').run(userId, 'India', 'Asia/Kolkata', now);
}

export function nextColor(userId) {
  const used = new Set(db.prepare('SELECT color FROM categories WHERE user_id=?').all(userId).map(r => r.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

export default db;
