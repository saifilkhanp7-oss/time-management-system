// Sends the login code by email. Three ways, picked by which settings exist:
//
// 1. GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET  → a small Google Apps Script in your Gmail sends it over HTTPS.
//    Works on Railway's Free/Hobby plans (they block normal email ports). See gmail-sender.gs.
// 2. GMAIL_USER + GMAIL_APP_PASSWORD         → direct Gmail SMTP with an App Password.
//    Works on your own computer or Railway Pro. Blocked on Railway Hobby.
// 3. Neither                                  → the code is printed in the server log
//    (and shown on screen when OTP_DEMO_MODE=true or when running locally).

const APP = 'Chronos';

function render(code, name) {
  const subject = `${code} is your ${APP} code`;
  const text = `Hi ${name || 'there'},\n\nYour ${APP} verification code is ${code}.\nIt expires in 5 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1e1b17">
  <div style="font-size:20px;font-weight:700;margin-bottom:16px"><span style="color:#e2602a">&#9679;</span> ${APP}</div>
  <p style="margin:0 0 12px">Hi ${escapeHtml(name || 'there')},</p>
  <p style="margin:0 0 16px">Your verification code is:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f5f1ea;border-radius:12px;padding:16px;text-align:center">${code}</div>
  <p style="margin:16px 0 0;color:#6e685f;font-size:13px">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
</div>`;
  return { subject, text, html };
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emailMode() {
  if (process.env.GMAIL_SCRIPT_URL && process.env.GMAIL_SCRIPT_SECRET) return 'apps-script';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'smtp';
  return 'none';
}

let transporter;

export async function sendOtpEmail(to, code, name) {
  const msg = render(code, name);
  const mode = emailMode();

  if (mode === 'apps-script') {
    const res = await fetch(process.env.GMAIL_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.GMAIL_SCRIPT_SECRET, to, ...msg, name: APP }),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    let data = {};
    try { data = JSON.parse(body); } catch { /* not JSON: usually a Google sign-in page = wrong deployment access */ }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'the Gmail script did not accept the request (check the script URL, the secret, and that access is set to "Anyone")');
    }
    return { dev: false };
  }

  if (mode === 'smtp') {
    if (!transporter) {
      const { default: nodemailer } = await import('nodemailer');
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
        connectionTimeout: 15000,
      });
    }
    await transporter.sendMail({ from: `"${APP}" <${process.env.GMAIL_USER}>`, to, ...msg });
    return { dev: false };
  }

  console.log(`\n[DEV OTP] Email to ${to}: ${code}\n`);
  return { dev: process.env.NODE_ENV !== 'production' || process.env.OTP_DEMO_MODE === 'true' };
}
