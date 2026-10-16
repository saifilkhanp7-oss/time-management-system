import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter } from './auth.js';
import { api } from './api.js';
import { emailMode } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24)) {
  console.error('JWT_SECRET must be set to a long random string (24+ characters) in production.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // behind the hosting provider's proxy: use the real client IP
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from ../client/dist
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'File too large.' : 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Chronos API running on http://localhost:${PORT}`);
  const mail = emailMode();
  if (mail === 'apps-script') console.log('  • Email codes: sent through your Gmail (Apps Script)');
  else if (mail === 'smtp') console.log(`  • Email codes: sent from ${process.env.GMAIL_USER} (Gmail SMTP)`);
  else console.log(process.env.OTP_DEMO_MODE === 'true'
    ? '  • Email codes: DEMO MODE — codes are shown on screen. Anyone can log in to any account.'
    : '  • Email codes: not configured (codes are printed here)');
  if (!process.env.ANTHROPIC_API_KEY) console.log('  • AI analyst: built-in rule-based insights (set ANTHROPIC_API_KEY to use Claude)');
});
