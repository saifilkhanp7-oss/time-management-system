import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { COUNTRIES } from '../lib/countries.js';
import { TrashIcon, SearchIcon } from '../components/Icons.jsx';

function zoneParts(now, tz) {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now)) o[p.type] = p.value;
  const h = +o.hour % 24, m = +o.minute, s = +o.second;
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, h, m, s);
  return { h, m, s, offsetMin: Math.round((asUtc - Math.floor(now / 1000) * 1000) / 60000) };
}

function diffLabel(min) {
  if (min === 0) return 'Same time as you';
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${h ? `${h}h` : ''}${m ? ` ${m}m` : ''} ${min > 0 ? 'ahead' : 'behind'}`.trim();
}

function Analog({ h, m, s }) {
  const hand = (deg, len, w, cls) => <line className={cls} x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} strokeWidth={w} strokeLinecap="round" />;
  const night = h < 6 || h >= 19;
  return (
    <svg viewBox="0 0 100 100" className={`analog ${night ? 'night' : 'day'}`} aria-hidden="true">
      <circle cx="50" cy="50" r="47" className="face" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180, r1 = i % 3 ? 40 : 37;
        return <line key={i} className="tick" x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + 43 * Math.sin(a)} y2={50 - 43 * Math.cos(a)} strokeWidth={i % 3 ? 1.2 : 2.4} />;
      })}
      {hand(((h % 12) + m / 60) * 30, 24, 4, 'hh')}
      {hand((m + s / 60) * 6, 34, 2.6, 'mh')}
      {hand(s * 6, 38, 1.2, 'sh')}
      <circle cx="50" cy="50" r="2.8" className="pin" />
    </svg>
  );
}

export default function WorldClock() {
  const { confirm, toast } = useApp();
  const [clocks, setClocks] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { api('/clocks').then(d => setClocks(d.clocks)).catch(e => toast(e.message, 'error')); }, [toast]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const localOffset = -new Date(now).getTimezoneOffset();
  const options = useMemo(() => {
    const have = new Set(clocks.map(c => c.label));
    return COUNTRIES.filter(([n]) => !have.has(n) && n.toLowerCase().includes(q.trim().toLowerCase()));
  }, [clocks, q]);

  async function add(label, tz) {
    try { const d = await api('/clocks', { method: 'POST', body: { label, tz } }); setClocks(d.clocks); setQ(''); setAdding(false); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(c) {
    if (!(await confirm('Do you want to delete this?', { detail: `${c.label} clock`, danger: true, confirmText: 'Yes, delete' }))) return;
    try { const d = await api(`/clocks/${c.id}`, { method: 'DELETE' }); setClocks(d.clocks); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>World Clock</h1>
          <p className="muted">India is your default clock. Add any country you work or study with.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Add a country'}</button>
      </div>

      {adding && (
        <div className="card">
          <div className="search"><SearchIcon /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search a country…" /></div>
          <div className="country-list">
            {options.map(([name, tz]) => {
              const p = zoneParts(now, tz);
              return (
                <button key={name} className="country" onClick={() => add(name, tz)}>
                  <span>{name}</span>
                  <span className="mono muted small">{String(p.h).padStart(2, '0')}:{String(p.m).padStart(2, '0')}</span>
                </button>
              );
            })}
            {!options.length && <div className="empty">No country found.</div>}
          </div>
        </div>
      )}

      <div className="clock-grid">
        {clocks.map(c => {
          const p = zoneParts(now, c.tz);
          const date = new Date(now).toLocaleDateString([], { timeZone: c.tz, weekday: 'short', day: 'numeric', month: 'short' });
          const time = new Date(now).toLocaleTimeString([], { timeZone: c.tz, hour: '2-digit', minute: '2-digit' });
          return (
            <div key={c.id} className={`card clock-card ${c.is_default ? 'default' : ''}`}>
              <Analog {...p} />
              <div className="clock-info">
                <div className="clock-label">{c.label}{c.is_default ? <span className="tag">default</span> : null}</div>
                <div className="mono clock-time">{time}</div>
                <div className="muted small">{date} · {diffLabel(p.offsetMin - localOffset)}</div>
              </div>
              {!c.is_default && <button className="icon-btn sm clock-del" title="Remove" onClick={() => remove(c)}><TrashIcon /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
