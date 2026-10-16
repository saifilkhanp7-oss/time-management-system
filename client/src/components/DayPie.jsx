import { fmtMin } from '../lib/time.js';

/** Pie of minutes per category for one day. `totals` = { [categoryId]: minutes } */
export default function DayPie({ title, subtitle, totals = {}, categories }) {
  const data = categories
    .map(c => ({ name: c.name, value: Math.round(totals[c.id] || 0), color: c.color }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((t, d) => t + d.value, 0);
  const untracked = Math.max(0, 1440 - total);

  return (
    <div className="card pie-card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <span className="pill">{fmtMin(total)} tracked</span>
      </div>
      {total === 0 ? (
        <div className="empty">No time tracked for this day.</div>
      ) : (
        <div className="pie-wrap">
          <div className="pie-chart">
            <Donut data={data} total={total} />
            <div className="pie-center"><b>{fmtMin(total)}</b><span>of 24h</span></div>
          </div>
          <ul className="legend">
            {data.map(d => (
              <li key={d.name}>
                <span className="swatch" style={{ background: d.color }} />
                <span className="legend-name">{d.name}</span>
                <span className="mono">{fmtMin(d.value)}</span>
                <span className="muted small">{Math.round((d.value / total) * 100)}%</span>
              </li>
            ))}
            <li className="muted small">Untracked: {fmtMin(untracked)}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/** Lightweight SVG donut (one arc per category). */
function Donut({ data, total }) {
  const R = 74, W = 30, C = 2 * Math.PI * R, GAP = data.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Time split by category">
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={W} />
      {data.map(d => {
        const len = (d.value / total) * C;
        const seg = (
          <circle key={d.name} cx="100" cy="100" r={R} fill="none" stroke={d.color} strokeWidth={W}
            strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-offset}
            transform="rotate(-90 100 100)" className="donut-seg">
            <title>{`${d.name}: ${fmtMin(d.value)}`}</title>
          </circle>
        );
        offset += len;
        return seg;
      })}
    </svg>
  );
}
