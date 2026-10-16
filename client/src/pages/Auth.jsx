import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../AppContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { LogoMark } from '../components/Icons.jsx';

export default function Auth() {
  const { login } = useApp();
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('details'); // details | otp
  const [username, setUsername] = useState('');
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef(null);

  const mobile = `${cc.trim()}${phone.replace(/\D/g, '')}`;

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
      const r = await api('/auth/request-otp', { method: 'POST', body: { mode, mobile, username: username.trim() } });
      setDevOtp(r.devOtp || null);
      setStep('otp'); setCooldown(30); setOtp('');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: { mobile, code: otp } });
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
            <p className="muted">{mode === 'login' ? 'Already have an account? Enter your mobile number and we will text you a code.' : 'New here? Pick a username and verify your mobile number so your data is safely stored.'}</p>
            {mode === 'signup' && (
              <label className="field">
                <span>Username</span>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. saif_k" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.]+" title="Letters, numbers, _ or ." />
              </label>
            )}
            <label className="field">
              <span>Mobile number</span>
              <div className="phone">
                <input className="cc" value={cc} onChange={e => setCc(e.target.value)} aria-label="Country code" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" autoComplete="tel-national" required />
              </div>
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary big" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">Enter the 6-digit code sent to <b>{mobile}</b>. <button type="button" className="link" onClick={() => setStep('details')}>Change</button></p>
            {devOtp && <div className="alert info">Dev mode (no SMS provider configured): your code is <b className="mono">{devOtp}</b></div>}
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
