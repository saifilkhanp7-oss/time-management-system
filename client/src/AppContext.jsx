import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './lib/api.js';
import { startAlarm, stopAlarm, unlockAudio } from './lib/sound.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TIMER_KEY = 'chronos_timer';
const RING_MS = 30 * 1000;      // how long the alarm rings before snoozing
const SNOOZE_MS = 2 * 60 * 1000; // snooze interval
const DEFAULT_TIMER = { categoryId: null, totalSec: 25 * 60, remainingSec: 25 * 60, status: 'idle', endsAt: null, tune: 'chime', liveId: null, ringStartedAt: null, nextRingAt: null, snoozes: 0 };

function loadTimer() {
  try { return { ...DEFAULT_TIMER, ...JSON.parse(localStorage.getItem(TIMER_KEY) || '{}') }; } catch { return DEFAULT_TIMER; }
}

export function AppProvider({ children }) {
  /* ---------- theme ---------- */
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('chronos_theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  /* ---------- toasts + confirm dialog ---------- */
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  const [dialog, setDialog] = useState(null);
  const confirm = useCallback((message, opts = {}) => new Promise(resolve => setDialog({ message, ...opts, resolve })), []);
  const closeDialog = ok => { dialog?.resolve(ok); setDialog(null); };

  /* ---------- auth ---------- */
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);
  const loadMe = useCallback(() => {
    if (!getToken()) { setBooting(false); return; }
    setBooting(true); setBootError(null);
    // Stay logged in: renew the saved token each time the app opens.
    // Only a rejected token logs the user out; if the server can't be reached we keep the login and offer a retry.
    api('/auth/me')
      .then(d => { if (d.token) setToken(d.token); setUser(d.user); })
      .catch(e => { if (getToken()) setBootError(e.message || 'Could not reach the server.'); })
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('chronos:logout', onLogout);
    return () => window.removeEventListener('chronos:logout', onLogout);
  }, []);
  const login = (token, u) => { setToken(token); setUser(u); };
  const logout = () => { setToken(null); setUser(null); stopAlarm(); setTimer(DEFAULT_TIMER); };

  /* ---------- shared data ---------- */
  const [categories, setCategories] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const bump = useCallback(() => setDataVersion(v => v + 1), []);
  const refreshCategories = useCallback(async () => {
    try { const d = await api('/categories'); setCategories(d.categories); return d.categories; } catch (e) { toast(e.message, 'error'); return []; }
  }, [toast]);

  /* ---------- timer state ---------- */
  const [timer, setTimerState] = useState(loadTimer);
  const timerRef = useRef(timer);
  const setTimer = useCallback(upd => {
    setTimerState(prev => {
      const next = typeof upd === 'function' ? upd(prev) : upd;
      timerRef.current = next;
      try { localStorage.setItem(TIMER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /* ---------- live tracking (single source of truth = server) ---------- */
  const [live, setLive] = useState(null);
  const liveRef = useRef(null);
  const applyLive = useCallback(l => { liveRef.current = l; setLive(l); }, []);

  const pauseTimerLocally = useCallback((reason) => {
    const t = timerRef.current;
    if (t.status !== 'running') return;
    const remaining = Math.max(1, Math.ceil((t.endsAt - Date.now()) / 1000));
    setTimer({ ...t, status: 'paused', remainingSec: remaining, endsAt: null, liveId: null });
    if (reason) toast(reason);
  }, [setTimer, toast]);

  const refreshLive = useCallback(async () => {
    try {
      const { live: l } = await api('/live');
      applyLive(l);
      const t = timerRef.current;
      // Keep the timer in sync: if its tracking session was stopped elsewhere, pause it.
      if (t.status === 'running' && Date.now() < t.endsAt && (!l || l.id !== t.liveId)) {
        pauseTimerLocally('Timer paused because tracking was stopped.');
      }
      return l;
    } catch { return liveRef.current; }
  }, [applyLive, pauseTimerLocally]);

  useEffect(() => {
    if (!user) return;
    refreshCategories();
    refreshLive();
    const id = setInterval(refreshLive, 15000);
    return () => clearInterval(id);
  }, [user, refreshCategories, refreshLive]);

  const afterTrackingChange = useCallback(() => { bump(); refreshCategories(); }, [bump, refreshCategories]);

  /** Start live tracking from the Time Tracker. Resumes a paused timer of the same category. */
  const startTracking = async categoryId => {
    const t = timerRef.current;
    if (t.status === 'paused' && t.categoryId === categoryId) return resumeTimer();
    try {
      const { live: l } = await api('/live/start', { method: 'POST', body: { category_id: categoryId, source: 'live' } });
      applyLive(l);
      afterTrackingChange();
    } catch (e) { toast(e.message, 'error'); }
  };

  /** Stop live tracking (from the tracker or header). Pauses the timer — they stay in sync. */
  const stopTracking = async () => {
    try {
      const r = await api('/live/stop', { method: 'POST', body: {} });
      applyLive(null);
      if (timerRef.current.status === 'running') pauseTimerLocally('Timer paused because tracking was stopped.');
      if (r.discarded) toast('Session shorter than 1 minute was discarded.');
      else if (r.stopped) toast(`Tracked ${r.stopped.cat} session saved.`, 'success');
      afterTrackingChange();
    } catch (e) { toast(e.message, 'error'); }
  };

  /* ---------- timer actions ---------- */
  const configureTimer = patch => setTimer(t => {
    if (t.status !== 'idle') return { ...t, ...('tune' in patch ? { tune: patch.tune } : {}) };
    const next = { ...t, ...patch };
    if ('totalSec' in patch) next.remainingSec = patch.totalSec;
    return next;
  });

  async function beginSegment(categoryId, seconds) {
    const l = liveRef.current;
    if (l && l.category_id === categoryId) return l; // already tracking this category: attach to it
    if (l) throw new Error(`You are tracking "${l.cat}" right now. Stop it before starting a timer for another category.`);
    const { live: started } = await api('/live/start', { method: 'POST', body: { category_id: categoryId, source: 'timer', planned_sec: seconds } });
    applyLive(started);
    return started;
  }

  const startTimer = async () => {
    unlockAudio();
    const t = timerRef.current;
    if (!t.categoryId) return toast('Pick a category for the timer.', 'error');
    if (t.totalSec < 1) return toast('Set a duration first.', 'error');
    try {
      const l = await beginSegment(t.categoryId, t.totalSec);
      setTimer({ ...timerRef.current, status: 'running', remainingSec: t.totalSec, endsAt: Date.now() + t.totalSec * 1000, liveId: l.id, snoozes: 0 });
      afterTrackingChange();
    } catch (e) { toast(e.message, 'error'); }
  };

  const resumeTimer = async () => {
    unlockAudio();
    const t = timerRef.current;
    try {
      const l = await beginSegment(t.categoryId, t.remainingSec);
      setTimer({ ...timerRef.current, status: 'running', endsAt: Date.now() + t.remainingSec * 1000, liveId: l.id });
      afterTrackingChange();
    } catch (e) { toast(e.message, 'error'); }
  };

  const pauseTimer = async () => {
    pauseTimerLocally();
    try { await api('/live/stop', { method: 'POST', body: {} }); applyLive(null); afterTrackingChange(); } catch (e) { toast(e.message, 'error'); }
  };

  const stopTimer = async () => {
    const wasRunning = timerRef.current.status === 'running';
    stopAlarm();
    setTimer(t => ({ ...t, status: 'idle', remainingSec: t.totalSec, endsAt: null, liveId: null, ringStartedAt: null, nextRingAt: null }));
    if (wasRunning) {
      try { await api('/live/stop', { method: 'POST', body: {} }); applyLive(null); afterTrackingChange(); } catch (e) { toast(e.message, 'error'); }
    }
  };

  const dismissAlarm = () => {
    stopAlarm();
    setTimer(t => ({ ...t, status: 'idle', remainingSec: t.totalSec, endsAt: null, ringStartedAt: null, nextRingAt: null, snoozes: 0 }));
  };

  // the timer clock
  const [now, setNow] = useState(Date.now());
  const expiring = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      const n = Date.now();
      setNow(n);
      const t = timerRef.current;
      if (t.status === 'running' && n >= t.endsAt && !expiring.current) {
        expiring.current = true;
        setTimer({ ...t, status: 'ringing', remainingSec: 0, ringStartedAt: n, liveId: null });
        startAlarm(t.tune);
        try {
          // tracking stops exactly when the timer reached zero
          await api('/live/stop', { method: 'POST', body: { end_ts: t.endsAt } });
          applyLive(null);
          afterTrackingChange();
        } catch { /* will resync on next poll */ }
        expiring.current = false;
      } else if (t.status === 'ringing' && n - t.ringStartedAt >= RING_MS) {
        stopAlarm();
        setTimer({ ...t, status: 'snoozed', nextRingAt: n + SNOOZE_MS, snoozes: t.snoozes + 1 });
      } else if (t.status === 'snoozed' && n >= t.nextRingAt) {
        setTimer({ ...t, status: 'ringing', ringStartedAt: n });
        startAlarm(t.tune);
      }
    }, 250);
    return () => clearInterval(id);
  }, [setTimer, applyLive, afterTrackingChange]);

  const timerRemaining = timer.status === 'running' ? Math.max(0, (timer.endsAt - now) / 1000) : timer.remainingSec;

  const value = {
    theme, toggleTheme, toast, confirm,
    user, booting, bootError, retryBoot: loadMe, login, logout,
    categories, refreshCategories, dataVersion, bump,
    live, refreshLive, startTracking, stopTracking, now,
    timer, timerRemaining, configureTimer, startTimer, pauseTimer, resumeTimer, stopTimer, dismissAlarm,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
      </div>
      {dialog && (
        <div className="modal-backdrop" onClick={() => closeDialog(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{dialog.message}</p>
            {dialog.detail && <p className="muted">{dialog.detail}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => closeDialog(false)}>{dialog.cancelText || 'No'}</button>
              <button className={`btn ${dialog.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => closeDialog(true)}>{dialog.confirmText || 'Yes'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
