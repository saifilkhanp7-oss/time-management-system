import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { addDays, fmtDateLong, fmtDateShort, fmtMin, greeting, todayStr } from '../lib/time.js';
import DayPie from '../components/DayPie.jsx';

const FEATURES = [
  ['/tracker', '⏱', 'Time Tracker', 'Log sessions per category, set daily goals, build streaks, and see week and calendar views.'],
  ['/timer', '⏳', 'Focus Timer', 'Countdown timers that log time automatically and stay in sync with the tracker.'],
  ['/planner', '✅', 'Planner', 'Today\'s goals with pins. Unfinished goals carry over so nothing slips.'],
  ['/reminders', '📅', 'Reminders', 'Note future activities — you get a heads-up the day before.'],
  ['/world-clock', '🌍', 'World Clock', 'India by default, plus any country you work with.'],
  ['/analyst', '🧠', 'AI Analyst', 'An analytics engine computes your stats; the AI explains the patterns.'],
];

export default function Home() {
  const { user, categories, dataVersion } = useApp();
  const [totals, setTotals] = useState({});
  const [goals, setGoals] = useState(null);
  const [reminders, setReminders] = useState([]);
  const today = todayStr(), yesterday = addDays(today, -1), tomorrow = addDays(today, 1);

  useEffect(() => {
    api(`/stats/daily?from=${yesterday}&to=${today}`).then(d => setTotals(d.days)).catch(() => {});
    api('/goals').then(setGoals).catch(() => {});
    api('/reminders').then(d => setReminders(d.reminders)).catch(() => {});
  }, [dataVersion, today, yesterday]);

  const tomorrowReminders = reminders.filter(r => r.date === tomorrow);
  const carried = (goals?.open || []).filter(g => g.created_date < (goals?.today || today));
  const openGoals = goals?.open || [];
  const withGoal = categories.filter(c => c.daily_goal_min > 0);

  return (
    <div className="stack-lg">
      <section className="hero">
        <div>
          <p className="eyebrow">{fmtDateLong(today)}</p>
          <h1>{greeting()}, {user.username.split(' ')[0]}.</h1>
          <p className="lead">
            Chronos is your personal time lab. Track where your hours go across study, work, sleep, gym and anything else you care about.
            Set a daily goal for each category and keep your streaks alive, run focus timers that log themselves, plan the day,
            and let the AI analyst turn your raw sessions into statistics — and those statistics into advice.
          </p>
        </div>
      </section>

      {(tomorrowReminders.length > 0 || carried.length > 0) && (
        <section className="alerts">
          {tomorrowReminders.length > 0 && (
            <div className="card alert-card reminder">
              <h3>📅 Your tomorrow's activity is:</h3>
              <ul>{tomorrowReminders.map(r => <li key={r.id}>{r.text}</li>)}</ul>
              <Link to="/reminders" className="link small">Open reminders →</Link>
            </div>
          )}
          {carried.length > 0 && (
            <div className="card alert-card warning">
              <h3>⚠️ Warning: goals not completed</h3>
              <p className="muted small">{carried.length} goal{carried.length > 1 ? 's were' : ' was'} carried over from previous days. Full list of goals not completed yet:</p>
              <ul>
                {openGoals.map(g => (
                  <li key={g.id}>
                    {g.text}
                    {g.created_date < (goals?.today || today) && <span className="tag warn">since {fmtDateShort(g.created_date)}</span>}
                  </li>
                ))}
              </ul>
              <Link to="/planner" className="link small">Go to planner →</Link>
            </div>
          )}
        </section>
      )}

      <section className="grid-2">
        <DayPie title="Today so far" subtitle="Updates live as you track" totals={totals[today]} categories={categories} />
        <DayPie title="Yesterday's summary" subtitle={`End-of-day split for ${fmtDateShort(yesterday)}`} totals={totals[yesterday]} categories={categories} />
      </section>

      {withGoal.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Streaks & daily goals</h3><Link to="/tracker" className="link small">Track time →</Link></div>
          <div className="streak-row">
            {withGoal.map(c => {
              const pct = Math.min(100, (c.today_min / c.daily_goal_min) * 100);
              return (
                <div key={c.id} className="streak-tile" style={{ '--c': c.color }}>
                  <div className="streak-top"><span>{c.name}</span><span className={`flame ${c.streak?.current ? 'on' : ''}`}>🔥 {c.streak?.current || 0}</span></div>
                  <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                  <div className="muted small">{fmtMin(c.today_min)} / {fmtMin(c.daily_goal_min)}{c.streak?.todayMet ? ' · goal met ✓' : ''}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">What you can do here</h2>
        <div className="feature-grid">
          {FEATURES.map(([to, icon, title, text]) => (
            <Link key={to} to={to} className="feature card">
              <span className="feature-icon">{icon}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
