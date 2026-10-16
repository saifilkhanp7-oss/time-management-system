import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { addDays, fmtDateShort, fmtMin, mondayOf, parseDate, todayStr } from '../lib/time.js';

export default function WeekChart() {
  const { categories, dataVersion } = useApp();
  const [catId, setCatId] = useState(null);
  const [week, setWeek] = useState(mondayOf(todayStr()));
  const [days, setDays] = useState({});
  const busiest = [...categories].sort((a, b) => (a.grp === 'rest') - (b.grp === 'rest') || b.today_min - a.today_min)[0];
  const cat = categories.find(c => c.id === catId) || busiest;
  const weekEnd = addDays(week, 6);

  useEffect(() => { api(`/stats/daily?from=${week}&to=${weekEnd}`).then(d => setDays(d.days)).catch(() => {}); }, [week, weekEnd, dataVersion]);

  if (!cat) return null;
  const data = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(week, i);
    const min = days[d]?.[cat.id] || 0;
    return { label: parseDate(d).toLocaleDateString([], { weekday: 'short' }) + ' ' + parseDate(d).getDate(), hours: +(min / 60).toFixed(2), min, met: cat.daily_goal_min && min >= cat.daily_goal_min };
  });
  const total = data.reduce((t, d) => t + d.min, 0);
  const isCurrent = week === mondayOf(todayStr());

  return (
    <div className="card">
      <div className="card-head wrap">
        <div>
          <h3>Week view</h3>
          <p className="muted small">{fmtDateShort(week)} – {fmtDateShort(weekEnd)} · total {fmtMin(total)} · daily avg {fmtMin(total / 7)}</p>
        </div>
        <div className="row">
          <select value={cat.id} onChange={e => setCatId(+e.target.value)} aria-label="Category">
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn small ghost" onClick={() => setWeek(addDays(week, -7))}>‹ Prev</button>
          <button className="btn small ghost" disabled={isCurrent} onClick={() => setWeek(addDays(week, 7))}>Next ›</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} unit="h" allowDecimals />
          <Tooltip cursor={{ fill: 'var(--hover)' }} formatter={(v, n, p) => [fmtMin(p.payload.min), cat.name]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} />
          {cat.daily_goal_min > 0 && <ReferenceLine y={cat.daily_goal_min / 60} stroke="var(--accent)" strokeDasharray="5 4" label={{ value: `goal ${fmtMin(cat.daily_goal_min)}`, fill: 'var(--accent)', fontSize: 11, position: 'insideTopRight' }} />}
          <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={46}>
            {data.map((d, i) => <Cell key={i} fill={cat.color} fillOpacity={d.met || !cat.daily_goal_min ? 1 : 0.55} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {cat.daily_goal_min > 0 && <p className="muted small">Solid bars = daily goal reached. Faded bars = below goal.</p>}
    </div>
  );
}
