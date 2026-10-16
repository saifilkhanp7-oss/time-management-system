import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './AppContext.jsx';
import { fmtClock } from './lib/time.js';
import { LogoMark, TabIcon } from './components/Icons.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Tracker from './pages/Tracker.jsx';
import Timer from './pages/Timer.jsx';
import Planner from './pages/Planner.jsx';
import WorldClock from './pages/WorldClock.jsx';
import Reminders from './pages/Reminders.jsx';
import Analyst from './pages/Analyst.jsx';

const NAV = [
  ['/', 'Home'], ['/tracker', 'Time Tracker'], ['/timer', 'Timer'], ['/planner', 'Planner'],
  ['/reminders', 'Reminders'], ['/world-clock', 'World Clock'], ['/analyst', 'AI Analyst'],
];

function LivePill() {
  const { live, now, stopTracking } = useApp();
  if (!live) return null;
  return (
    <div className="live-pill" style={{ '--c': live.color }}>
      <span className="live-dot" />
      <span>{live.cat}</span>
      <span className="mono">{fmtClock((now - live.start_ts) / 1000)}</span>
      <button onClick={stopTracking} title="Stop tracking">■</button>
    </div>
  );
}

const TABS = [['/', 'Home', 'home'], ['/tracker', 'Tracker', 'tracker'], ['/timer', 'Timer', 'timer'], ['/planner', 'Planner', 'planner']];
const MORE = [['/reminders', 'Reminders', 'reminders'], ['/world-clock', 'World Clock', 'clock'], ['/analyst', 'AI Analyst', 'analyst']];

/** Bottom tab bar shown on phones instead of the top menu. */
function BottomNav() {
  const { user, logout } = useApp();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const moreActive = MORE.some(([to]) => pathname.startsWith(to));
  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab"><TabIcon name={icon} /><span>{label}</span></NavLink>
        ))}
        <button className={`tab ${moreActive || open ? 'active' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <TabIcon name="more" /><span>More</span>
        </button>
      </nav>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            {MORE.map(([to, label, icon]) => (
              <NavLink key={to} to={to} className="sheet-item"><TabIcon name={icon} /><span>{label}</span></NavLink>
            ))}
            <div className="sheet-user">
              <span className="avatar">{user.username[0].toUpperCase()}</span>
              <div><b>{user.username}</b><div className="muted small break">{user.email}</div></div>
              <button className="btn small ghost" onClick={logout}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RingOverlay() {
  const { timer, categories, dismissAlarm } = useApp();
  if (timer.status !== 'ringing' && timer.status !== 'snoozed') return null;
  const cat = categories.find(c => c.id === timer.categoryId);
  if (timer.status === 'snoozed') {
    return (
      <div className="snooze-bar">
        ⏰ {cat?.name || 'Timer'} finished — snoozing, rings again every 2 minutes.
        <button className="btn small" onClick={dismissAlarm}>Turn off</button>
      </div>
    );
  }
  return (
    <div className="modal-backdrop ring-backdrop">
      <div className="modal ring-modal">
        <div className="ring-bell">⏰</div>
        <p className="modal-title">Time's up{cat ? ` — ${cat.name}` : ''}!</p>
        <p className="muted">Tracking has been stopped and the session was saved. If you don't turn this off it will snooze and ring again every 2 minutes.</p>
        <button className="btn primary big" autoFocus onClick={dismissAlarm}>Turn off alarm</button>
      </div>
    </div>
  );
}

export default function App() {
  const { user, booting, bootError, retryBoot, logout } = useApp();
  if (booting) return <div className="boot"><LogoMark size={56} /></div>;
  if (!user && bootError) {
    return (
      <div className="boot">
        <div className="boot-msg">
          <LogoMark size={48} />
          <h2>Can't reach Chronos right now</h2>
          <p className="muted">You're still signed in. Check your internet connection, or wait a minute if the app is updating.</p>
          <button className="btn primary big" onClick={retryBoot}>Try again</button>
        </div>
      </div>
    );
  }
  if (!user) return <Auth />;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand"><LogoMark /> <span>Chronos</span></NavLink>
          <nav className="nav">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
          </nav>
          <div className="topbar-right">
            <LivePill />
            <ThemeToggle />
            <div className="user-chip" title={user.email}>
              <span className="avatar">{user.username[0].toUpperCase()}</span>
              <button className="link" onClick={logout}>Log out</button>
            </div>
          </div>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/timer" element={<Timer />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/world-clock" element={<WorldClock />} />
          <Route path="/analyst" element={<Analyst />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <BottomNav />
      <RingOverlay />
    </div>
  );
}
