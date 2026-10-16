import { useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { MONTHS, WEEKDAYS, fmtDateShort, fmtMin, monthGrid, todayStr } from '../lib/time.js';

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

export default function YearCalendar({ onPickDate }) {
  const { categories, dataVersion } = useApp();
  const [catId, setCatId] = useState('all');
  const [year, setYear] = useState(Math.min(2026, Math.max(2020, new Date().getFullYear())));
  const [days, setDays] = useState({});
  const [hover, setHover] = useState(null);
  const today = todayStr();

  useEffect(() => { api(`/stats/daily?from=${year}-01-01&to=${year}-12-31`).then(d => setDays(d.days)).catch(() => {}); }, [year, dataVersion]);

  const cat = categories.find(c => String(c.id) === String(catId));
  const minutesOn = d => {
    const day = days[d];
    if (!day) return 0;
    if (cat) return day[cat.id] || 0;
    return Object.values(day).reduce((a, b) => a + b, 0);
  };
  const allVals = Object.keys(days).map(minutesOn);
  const max = Math.max(1, ...allVals);
  const yearTotal = allVals.reduce((a, b) => a + b, 0);
  const activeDays = allVals.filter(v => v > 0).length;
  const target = cat?.daily_goal_min || max;
  const level = m => (m <= 0 ? 0 : Math.min(4, Math.ceil((m / target) * 4)));
  const color = cat?.color || 'var(--accent)';

  return (
    <div className="card">
      <div className="card-head wrap">
        <div>
          <h3>Calendar view</h3>
          <p className="muted small">{year} · {fmtMin(yearTotal)} across {activeDays} active days{cat?.daily_goal_min ? ` · darkest = goal of ${fmtMin(cat.daily_goal_min)} reached` : ''}</p>
        </div>
        <div className="row">
          <select value={catId} onChange={e => setCatId(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="year-tabs" role="tablist">
            {YEARS.map(y => <button key={y} className={y === year ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        </div>
      </div>

      <div className="hover-line">
        {hover ? <><b>{fmtDateShort(hover)} {year}</b> · {fmtMin(minutesOn(hover))}{cat ? ` of ${cat.name}` : ' tracked'}</> : <span className="muted small">Hover a day to see the time invested. Click it to see that day's sessions.</span>}
      </div>

      <div className="months" style={{ '--heat': color }}>
        {MONTHS.map((name, mi) => (
          <div key={name} className="month">
            <div className="month-name">{name}</div>
            <div className="month-grid">
              {WEEKDAYS.map(w => <span key={w} className="wd">{w[0]}</span>)}
              {monthGrid(year, mi).map((d, i) => d ? (
                <button
                  key={d}
                  className={`day lv${level(minutesOn(d))} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}
                  onMouseEnter={() => setHover(d)}
                  onFocus={() => setHover(d)}
                  onClick={() => d <= today && onPickDate?.(d)}
                  title={`${d}: ${fmtMin(minutesOn(d))}`}
                >{+d.slice(8)}</button>
              ) : <span key={`e${i}`} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="heat-legend">Less {[0, 1, 2, 3, 4].map(l => <span key={l} className={`day lv${l}`} style={{ '--heat': color }} />)} More</div>
    </div>
  );
}
