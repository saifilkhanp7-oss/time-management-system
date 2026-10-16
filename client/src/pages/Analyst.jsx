import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { fmtDateLong, fmtDateShort, fmtMin, todayStr } from '../lib/time.js';

const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' };
const hrs = h => fmtMin((h || 0) * 60);

function Pipeline({ source }) {
  const steps = ['Raw sessions', 'Backend', 'Analytics engine', 'Statistics / features', source === 'claude' ? 'AI interpretation (Claude)' : 'Interpretation (built-in rules)', 'Your insights'];
  return (
    <div className="pipeline">
      {steps.map((s, i) => <span key={s} className={`pipe-step ${i >= 2 && i <= 4 ? 'hot' : ''}`}>{s}</span>)}
    </div>
  );
}

function Insights({ insights, loading }) {
  if (loading) return <div className="card insights"><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /></div>;
  if (!insights) return null;
  return (
    <div className="card insights">
      <div className="card-head">
        <h2>{insights.headline}</h2>
        <span className={`pill ${insights.source === 'claude' ? 'ai' : ''}`}>{insights.source === 'claude' ? `✦ ${insights.model}` : 'Built-in analyst'}</span>
      </div>
      {insights.note && <p className="muted small">{insights.note}</p>}
      {insights.observations.length > 0 && <ul className="insight-list">{insights.observations.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {insights.patterns.length > 0 && (
        <div className="insight-block pattern">
          <h4>Pattern detected</h4>
          <ul>{insights.patterns.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {insights.suggestions.length > 0 && (
        <div className="insight-block suggestion">
          <h4>Suggestion</h4>
          <ul>{insights.suggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Readout({ rows }) {
  return (
    <div className="readout mono">
      {rows.map(([k, v], i) => (k === '' ? <div key={i} className="gap" /> : <div key={i} className="ro-row"><span>{k}</span><span>{v}</span></div>))}
    </div>
  );
}

function DayView({ s }) {
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const rows = [
    ['Total tracked', fmtMin(s.total_tracked_min)],
    ['Focus (study + work)', fmtMin(s.focus_time_min)],
    ['By category', ''],
    ...s.by_category.filter(c => c.minutes > 0).map(c => [`  ${c.category}`, fmtMin(c.minutes)]),
    [''],
    ['Sessions (productive)', s.productive_session_count],
    ['Average session', s.average_session_min ? fmtMin(s.average_session_min) : '—'],
    ['Longest session', s.longest_session ? `${fmtMin(s.longest_session.minutes)} (${s.longest_session.category})` : '—'],
    ['First start / last end', s.first_start ? `${s.first_start} / ${s.last_end}` : '—'],
    ['Breaks', s.break_frequency ? `${s.break_frequency} · avg ${fmtMin(s.average_break_min)}` : '0'],
    ['Largest gap', s.largest_gap ? `${fmtMin(s.largest_gap.minutes)} (${s.largest_gap.from}–${s.largest_gap.to})` : '—'],
    [''],
    ['Goals met', `${s.goals.goals_met} / ${s.goals.categories_with_goal}`],
    ['Planned vs actual focus', s.planned_vs_actual_focus.planned_min ? `${fmtMin(s.planned_vs_actual_focus.actual_min)} / ${fmtMin(s.planned_vs_actual_focus.planned_min)} (${s.planned_vs_actual_focus.completion_pct}%)` : '—'],
    ['Timers completed', s.timer.timer_sessions ? `${s.timer.completed} / ${s.timer.timer_sessions}` : '—'],
  ];
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h3>Timeline</h3><span className="muted small">{fmtDateLong(s.date)}</span></div>
        {s.timeline.length ? (
          <>
            <div className="timeline">
              {s.timeline.map((t, i) => {
                const a = toMin(t.from), b = t.to === '00:00' && a > 0 ? 1440 : toMin(t.to);
                return <span key={i} className="tl-seg" title={`${t.category} ${t.from}–${t.to}`} style={{ left: `${(a / 1440) * 100}%`, width: `${Math.max(0.4, ((b - a) / 1440) * 100)}%`, background: t.color }} />;
              })}
            </div>
            <div className="tl-axis">{['00', '03', '06', '09', '12', '15', '18', '21', '24'].map(h => <span key={h}>{h}</span>)}</div>
            <ul className="tl-list mono small">
              {s.timeline.map((t, i) => <li key={i}><span className="swatch" style={{ background: t.color }} />{t.from}–{t.to}<span>{t.category}</span><span className="muted">{fmtMin(t.minutes)}{t.live ? ' · live' : ''}</span></li>)}
            </ul>
          </>
        ) : <div className="empty">No sessions on this day.</div>}
      </div>
      <div className="card"><h3>Computed statistics</h3><Readout rows={rows} /></div>
    </div>
  );
}

function RangeView({ s }) {
  const rows = [
    ['Focus time (study + work)', hrs(s.focus_hours)],
    ['Total tracked', hrs(s.total_tracked_hours)],
    ...s.by_category.filter(c => c.minutes > 0).map(c => [`  ${c.category}`, hrs(c.hours)]),
    [''],
    ['Average session', s.average_session_min ? fmtMin(s.average_session_min) : '—'],
    ['Longest session', s.longest_session ? `${fmtMin(s.longest_session.minutes)} (${s.longest_session.category})` : '—'],
    [''],
    ['Most productive', s.most_productive_window ? `${s.most_productive_window.from} – ${s.most_productive_window.to}` : '—'],
    ['Least productive', s.least_productive_window ? `${s.least_productive_window.from} – ${s.least_productive_window.to}` : '—'],
    [''],
    ['Planned vs actual', s.planned_vs_actual_focus.planned_hours ? `${hrs(s.planned_vs_actual_focus.actual_hours)} / ${hrs(s.planned_vs_actual_focus.planned_hours)} (${s.planned_vs_actual_focus.completion_pct}%)` : '—'],
    ['Active focus days', `${s.daily_consistency.active_focus_days} / ${s.daily_consistency.of_days}`],
    ['Breaks per active day', s.breaks.avg_per_active_day],
    ['vs previous period', s.change_vs_previous_pct == null ? '—' : `${s.change_vs_previous_pct > 0 ? '+' : ''}${s.change_vs_previous_pct}%`],
  ];
  const daily = s.daily_focus_min.map(d => ({ label: fmtDateShort(d.date), hours: +(d.minutes / 60).toFixed(2), min: d.minutes }));
  const hourly = s.focus_minutes_by_hour.map((m, h) => ({ label: String(h).padStart(2, '0'), min: m }));
  return (
    <div className="stack">
      <div className="card"><h3>Computed statistics · {fmtDateShort(s.period.from)} – {fmtDateShort(s.period.to)}</h3><Readout rows={rows} /></div>
      <div className="grid-2">
        <div className="card">
          <h3>Focus per day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={daily} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip cursor={{ fill: 'var(--hover)' }} contentStyle={tip} formatter={(v, n, p) => [fmtMin(p.payload.min), 'Focus']} />
              <Bar dataKey="hours" fill="var(--accent)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>When you focus (by hour)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} unit="m" />
              <Tooltip cursor={{ fill: 'var(--hover)' }} contentStyle={tip} formatter={v => [fmtMin(v), 'Focus']} labelFormatter={l => `${l}:00`} />
              <Bar dataKey="min" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function Analyst() {
  const { dataVersion, toast } = useApp();
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const url = mode === 'day' ? `/analytics/day?date=${date}` : `/analytics/range?days=${mode}`;
    api(url).then(d => alive && setData(d)).catch(e => toast(e.message, 'error')).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode, date, dataVersion, toast]);

  const s = data?.stats;
  const showDay = s?.kind === 'day' && mode === 'day';
  const showRange = s?.kind === 'range' && mode !== 'day';

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>AI Analyst</h1>
          <p className="muted">Your app does the analytics. The AI explains the analytics.</p>
        </div>
        <div className="row">
          <div className="seg">
            <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Day</button>
            <button className={mode === '7' ? 'on' : ''} onClick={() => setMode('7')}>Last 7 days</button>
            <button className={mode === '30' ? 'on' : ''} onClick={() => setMode('30')}>Last 30 days</button>
          </div>
          {mode === 'day' && <input type="date" value={date} max={todayStr()} min="2020-01-01" onChange={e => e.target.value && setDate(e.target.value)} />}
        </div>
      </div>

      <Pipeline source={data?.insights?.source} />

      <div className="analyst-layout">
        <Insights insights={data?.insights} loading={loading} />
        <div>
          {showDay && <DayView s={s} />}
          {showRange && <RangeView s={s} />}
        </div>
      </div>
    </div>
  );
}
