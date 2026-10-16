import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../AppContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { LogoMark } from '../components/Icons.jsx';

export default function Auth() {
  const { login } = useApp();
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('details'); // details | otp
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('chronos_last_email') || ''; } catch { return ''; } });
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef(null);

  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const switchMode = m => { setMode(m); setStep('details'); setError(''); setOtp(''); setDevOtp(null); };

  async function requestOtp(e) {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/request-otp', { method: 'POST', body: { mode, email: cleanEmail, name: name.trim() } });
      setDevOtp(r.devOtp || null);
      setStep('otp'); setCooldown(30); setOtp('');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: { email: cleanEmail, code: otp } });
      try { localStorage.setItem('chronos_last_email', cleanEmail); } catch { /* ignore */ }
      login(r.token, r.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-top"><ThemeToggle /></div>
      <section className="auth-story">
        <div className="brand big"><LogoMark size={44} /> <span>Chronos</span></div>
        <h1>Know where your hours go.</h1>
        <p>Track time by category, run focus timers that log themselves, plan your day, and let the AI analyst turn your numbers into patterns you can act on.</p>
        <ul className="auth-points">
          <li><b>Streaks</b> for every daily goal</li>
          <li><b>Timer + tracker</b> always in sync</li>
          <li><b>Analytics engine</b> that does the math before the AI explains it</li>
        </ul>
      </section>

      <section className="auth-card card">
        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>Log in</button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>Sign up</button>
        </div>

        {step === 'details' ? (
          <form onSubmit={requestOtp} className="stack">
            <p className="muted">{mode === 'login' ? 'Welcome back. Enter your email and we will send you a 6-digit code.' : 'New here? Enter your name and email. We will send a code to confirm it is you.'}</p>
            {mode === 'signup' && (
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Saif Khan" autoComplete="name" required minLength={2} maxLength={40} />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary big" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">We sent a 6-digit code to <b className="break">{cleanEmail}</b>. <button type="button" className="link" onClick={() => setStep('details')}>Change</button></p>
            {devOtp
              ? <div className="alert info">Demo mode (email sending not set up yet): your code is <b className="mono">{devOtp}</b></div>
              : <p className="muted small">Check your inbox. If it isn't there within a minute, look in Spam or Promotions.</p>}
            <input ref={otpRef} className="otp-input mono" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" required minLength={6} />
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary big" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : mode === 'login' ? 'Verify & log in' : 'Verify & create account'}</button>
            <button type="button" className="btn ghost" disabled={cooldown > 0 || busy} onClick={requestOtp}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
