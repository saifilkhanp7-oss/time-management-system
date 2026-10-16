import { useApp } from '../AppContext.jsx';
import { TUNES, previewTune } from '../lib/sound.js';
import { fmtClock } from '../lib/time.js';

const PRESETS = [[15 * 60, '15m'], [25 * 60, '25m'], [45 * 60, '45m'], [60 * 60, '1h'], [90 * 60, '1h 30m']];

export default function Timer() {
  const { categories, timer, timerRemaining, configureTimer, startTimer, pauseTimer, resumeTimer, stopTimer, live } = useApp();
  const idle = timer.status === 'idle';
  const h = Math.floor(timer.totalSec / 3600), m = Math.floor((timer.totalSec % 3600) / 60), s = timer.totalSec % 60;
  const setPart = (part, v) => {
    const n = Math.max(0, Math.min(part === 'h' ? 23 : 59, Math.floor(+v || 0)));
    const parts = { h, m, s, [part]: n };
    configureTimer({ totalSec: parts.h * 3600 + parts.m * 60 + parts.s });
  };
  const cat = categories.find(c => c.id === timer.categoryId);
  const progress = timer.totalSec ? 1 - timerRemaining / timer.totalSec : 0;
  const R = 120, C = 2 * Math.PI * R;
  const statusText = { idle: 'Ready', running: 'Running · tracking time', paused: 'Paused · not tracking', ringing: "Time's up!", snoozed: 'Snoozed' }[timer.status];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Timer</h1>
          <p className="muted">Starting a timer tracks time for its category automatically. Stopping tracking in the Time Tracker pauses the timer — they stay in sync.</p>
        </div>
      </div>

      <div className="timer-layout">
        <div className="card timer-face" style={{ '--c': cat?.color || 'var(--accent)' }}>
          <svg viewBox="0 0 280 280" className="timer-ring" aria-hidden="true">
            <circle cx="140" cy="140" r={R} className="ring-bg" />
            <circle cx="140" cy="140" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <div className="timer-center">
            <div className="muted small">{cat ? cat.name : 'No category'}</div>
            <div className="timer-digits mono">{fmtClock(timerRemaining)}</div>
            <div className={`status s-${timer.status}`}>{statusText}</div>
          </div>
          <div className="timer-controls">
            {idle && <button className="btn primary big" onClick={startTimer}>▶ Start</button>}
            {timer.status === 'running' && <button className="btn soft big" onClick={pauseTimer}>❚❚ Pause</button>}
            {timer.status === 'paused' && <button className="btn primary big" onClick={resumeTimer}>▶ Resume</button>}
            {(timer.status === 'running' || timer.status === 'paused') && <button className="btn danger big" onClick={stopTimer}>■ Stop</button>}
          </div>
        </div>

        <div className="card stack">
          <div>
            <h3>Category</h3>
            <div className="chips">
              {categories.map(c => (
                <button key={c.id} disabled={!idle} className={`chip ${timer.categoryId === c.id ? 'on' : ''}`} style={{ '--c': c.color }} onClick={() => configureTimer({ categoryId: c.id })}>
                  <span className="swatch" style={{ background: c.color }} /> {c.name}
                </button>
              ))}
            </div>
            {live && idle && <p className="muted small">Currently tracking <b>{live.cat}</b>. A timer can only be started for that same category until you stop it.</p>}
          </div>

          <div>
            <h3>Duration</h3>
            <div className="hms">
              <label><input type="number" min="0" max="23" value={h} disabled={!idle} onChange={e => setPart('h', e.target.value)} /><span>hr</span></label>
              <label><input type="number" min="0" max="59" value={m} disabled={!idle} onChange={e => setPart('m', e.target.value)} /><span>min</span></label>
              <label><input type="number" min="0" max="59" value={s} disabled={!idle} onChange={e => setPart('s', e.target.value)} /><span>sec</span></label>
            </div>
            <div className="chips">
              {PRESETS.map(([sec, label]) => <button key={sec} disabled={!idle} className={`chip ${timer.totalSec === sec ? 'on' : ''}`} onClick={() => configureTimer({ totalSec: sec })}>{label}</button>)}
            </div>
          </div>

          <div>
            <h3>Alarm tune</h3>
            <div className="tunes">
              {Object.entries(TUNES).map(([key, t]) => (
                <label key={key} className={`tune ${timer.tune === key ? 'on' : ''}`}>
                  <input type="radio" name="tune" checked={timer.tune === key} onChange={() => configureTimer({ tune: key })} />
                  <span>{t.label}</span>
                  <button type="button" className="link small" onClick={() => previewTune(key)}>▶ play</button>
                </label>
              ))}
            </div>
            <p className="muted small">When the timer ends, tracking stops and the alarm rings. If you don't turn it off, it snoozes and rings again every 2 minutes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
