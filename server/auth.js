import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import db, { seedUser } from './db.js';
import { sendOtpEmail } from './mailer.js';
import { validTz } from './time.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Stay logged in on a device: tokens last a year and are renewed every time the app is opened.
const TOKEN_LIFE = '365d';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M} .'-]{2,40}$/u;
const OTP_TTL = 5 * 60 * 1000;
const RESEND_GAP = 30 * 1000;
const hash = c => crypto.createHash('sha256').update(String(c)).digest('hex');
const USER_COLS = 'id, username, email';
const signToken = uid => jwt.sign({ uid }, JWT_SECRET, { expiresIn: TOKEN_LIFE });
const cleanEmail = e => String(e || '').trim().toLowerCase();

export const authRouter = Router();

// Per-IP limit so a public deployment can't be used to spam people's inboxes.
const ipHits = new Map();
function ipLimited(ip, max = 8, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 10000) ipHits.clear();
  return hits.length > max;
}

authRouter.post('/request-otp', async (req, res) => {
  const { mode } = req.body || {};
  const email = cleanEmail(req.body?.email);
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
  if (!['login', 'signup'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address, e.g. you@gmail.com' });

  const existing = db.prepare('SELECT id, username FROM users WHERE email=?').get(email);
  if (mode === 'signup') {
    if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Name must be 2–40 letters (spaces, dots and hyphens are fine).' });
    if (existing) return res.status(409).json({ error: 'This email already has an account. Please log in.' });
  } else if (!existing) {
    return res.status(404).json({ error: 'No account found for this email. Please sign up.' });
  }

  const prev = db.prepare('SELECT sent_at FROM otps WHERE dest=?').get(email);
  if (prev && Date.now() - prev.sent_at < RESEND_GAP) {
    const wait = Math.ceil((RESEND_GAP - (Date.now() - prev.sent_at)) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }
  if (ipLimited(req.ip)) return res.status(429).json({ error: 'Too many code requests from this network. Try again in an hour.' });

  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();
  db.prepare(`INSERT INTO otps(dest,code_hash,purpose,username,expires_at,attempts,sent_at)
              VALUES(?,?,?,?,?,0,?)
              ON CONFLICT(dest) DO UPDATE SET code_hash=excluded.code_hash, purpose=excluded.purpose,
              username=excluded.username, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at`)
    .run(email, hash(code), mode, mode === 'signup' ? name : null, now + OTP_TTL, now);

  try {
    const r = await sendOtpEmail(email, code, mode === 'signup' ? name : existing.username);
    res.json({ ok: true, devOtp: r.dev ? code : undefined });
  } catch (e) {
    console.error('[EMAIL] send failed:', e.message);
    db.prepare('DELETE FROM otps WHERE dest=?').run(email);
    res.status(502).json({ error: 'Could not send the email right now. Please try again in a minute.' });
  }
});

authRouter.post('/verify-otp', (req, res) => {
  const email = cleanEmail(req.body?.email);
  const code = String(req.body?.code || '');
  const row = db.prepare('SELECT * FROM otps WHERE dest=?').get(email);
  if (!row) return res.status(400).json({ error: 'Please request a code first.' });
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM otps WHERE dest=?').run(email);
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if (row.attempts >= 5) {
    db.prepare('DELETE FROM otps WHERE dest=?').run(email);
    return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
  }
  if (hash(code) !== row.code_hash) {
    db.prepare('UPDATE otps SET attempts=attempts+1 WHERE dest=?').run(email);
    return res.status(400).json({ error: `Incorrect code. ${4 - row.attempts} attempt(s) left.` });
  }
  db.prepare('DELETE FROM otps WHERE dest=?').run(email);

  let user;
  if (row.purpose === 'signup') {
    try {
      const id = db.transaction(() => {
        const info = db.prepare('INSERT INTO users(username,email,created_at) VALUES(?,?,?)').run(row.username, email, Date.now());
        seedUser(info.lastInsertRowid);
        return info.lastInsertRowid;
      })();
      user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).get(id);
    } catch {
      return res.status(409).json({ error: 'This email was just registered. Please log in.' });
    }
  } else {
    user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE email=?`).get(email);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
  }
  res.json({ token: signToken(user.id), user });
});

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).get(uid);
    if (!user) throw new Error('gone');
    req.user = user;
    req.tz = validTz(req.headers['x-tz']);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}

// Called each time the app opens: returns the user and a renewed token, so an active device never gets logged out.
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user, token: signToken(req.user.id) }));
