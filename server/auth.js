import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import db, { seedUser } from './db.js';
import { sendSms } from './sms.js';
import { validTz } from './time.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const MOBILE_RE = /^\+[1-9]\d{7,14}$/;
const USER_RE = /^[A-Za-z0-9_.]{3,24}$/;
const OTP_TTL = 5 * 60 * 1000;
const RESEND_GAP = 30 * 1000;
const hash = c => crypto.createHash('sha256').update(String(c)).digest('hex');

export const authRouter = Router();

// Simple per-IP limit so a public deployment can't be used to spam SMS (each SMS costs money).
const ipHits = new Map();
function ipLimited(ip, max = 6, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 10000) ipHits.clear();
  return hits.length > max;
}

authRouter.post('/request-otp', async (req, res) => {
  const { mode, mobile, username } = req.body || {};
  if (ipLimited(req.ip)) return res.status(429).json({ error: 'Too many OTP requests from this network. Try again in an hour.' });
  if (!['login', 'signup'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  if (!MOBILE_RE.test(mobile || '')) {
    return res.status(400).json({ error: 'Enter a valid mobile number with country code, e.g. +919876543210' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE mobile=?').get(mobile);
  if (mode === 'signup') {
    if (!USER_RE.test(username || '')) {
      return res.status(400).json({ error: 'Username must be 3–24 characters: letters, numbers, _ or .' });
    }
    if (existing) return res.status(409).json({ error: 'This mobile number already has an account. Please log in.' });
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
      return res.status(409).json({ error: 'This username is already taken.' });
    }
  } else if (!existing) {
    return res.status(404).json({ error: 'No account found for this mobile number. Please sign up.' });
  }

  const prev = db.prepare('SELECT sent_at FROM otps WHERE mobile=?').get(mobile);
  if (prev && Date.now() - prev.sent_at < RESEND_GAP) {
    const wait = Math.ceil((RESEND_GAP - (Date.now() - prev.sent_at)) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another OTP.` });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();
  db.prepare(`INSERT INTO otps(mobile,code_hash,purpose,username,expires_at,attempts,sent_at)
              VALUES(?,?,?,?,?,0,?)
              ON CONFLICT(mobile) DO UPDATE SET code_hash=excluded.code_hash, purpose=excluded.purpose,
              username=excluded.username, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at`)
    .run(mobile, hash(code), mode, mode === 'signup' ? username : null, now + OTP_TTL, now);

  try {
    const r = await sendSms(mobile, `Your Chronos verification code is ${code}. It expires in 5 minutes.`);
    res.json({ ok: true, devOtp: r.dev ? code : undefined });
  } catch (e) {
    db.prepare('DELETE FROM otps WHERE mobile=?').run(mobile);
    res.status(502).json({ error: 'Could not send the SMS: ' + e.message });
  }
});

authRouter.post('/verify-otp', (req, res) => {
  const { mobile, code } = req.body || {};
  const row = db.prepare('SELECT * FROM otps WHERE mobile=?').get(mobile || '');
  if (!row) return res.status(400).json({ error: 'Please request an OTP first.' });
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM otps WHERE mobile=?').run(mobile);
    return res.status(400).json({ error: 'This OTP has expired. Request a new one.' });
  }
  if (row.attempts >= 5) {
    db.prepare('DELETE FROM otps WHERE mobile=?').run(mobile);
    return res.status(429).json({ error: 'Too many wrong attempts. Request a new OTP.' });
  }
  if (hash(code || '') !== row.code_hash) {
    db.prepare('UPDATE otps SET attempts=attempts+1 WHERE mobile=?').run(mobile);
    return res.status(400).json({ error: `Incorrect OTP. ${4 - row.attempts} attempt(s) left.` });
  }
  db.prepare('DELETE FROM otps WHERE mobile=?').run(mobile);

  let user;
  if (row.purpose === 'signup') {
    try {
      const create = db.transaction(() => {
        const info = db.prepare('INSERT INTO users(username,mobile,created_at) VALUES(?,?,?)').run(row.username, mobile, Date.now());
        seedUser(info.lastInsertRowid);
        return info.lastInsertRowid;
      });
      const id = create();
      user = db.prepare('SELECT id,username,mobile FROM users WHERE id=?').get(id);
    } catch {
      return res.status(409).json({ error: 'That username or mobile number was just taken. Try again.' });
    }
  } else {
    user = db.prepare('SELECT id,username,mobile FROM users WHERE mobile=?').get(mobile);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
  }
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user });
});

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id,username,mobile FROM users WHERE id=?').get(uid);
    if (!user) throw new Error('gone');
    req.user = user;
    req.tz = validTz(req.headers['x-tz']);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
