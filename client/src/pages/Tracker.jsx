import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { addDays, atTime, fmtClock, fmtDateLong, fmtMin, fmtTime, todayStr } from '../lib/time.js';
import { SearchIcon, TrashIcon, EditIcon } from '../components/Icons.jsx';
import WeekChart from '../components/WeekChart.jsx';
import YearCalendar from '../components/YearCalendar.jsx';

const GROUPS = [['study', 'Study'], ['work', 'Work'], ['health', 'Health'], ['rest', 'Rest'], ['leisure', 'Leisure'], ['other', 'Other']];

function GoalEditor({ cat, onDone }) {
  const { refreshCategories, toast } = useApp();
  const [h, setH] = useState(Math.floor(cat.daily_goal_min / 60));
  const [m, setM] = useState(cat.daily_goal_min % 60);
  async function save(e) {
    e.preventDefault();
    try {
      await api(`/categories/${cat.id}`, { method: 'PATCH', body: { daily_goal_min: (+h || 0) * 60 + (+m || 0) } });
      await refreshCategories();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <form className="goal-editor" onSubmit={save}>
      <input type="number" min="0" max="24" value={h} onChange={e => setH(e.target.value)} aria-label="Hours" /> h
      <input type="number" min="0" max="59" value={m} onChange={e => setM(e.target.value)} aria-label="Minutes" /> m
      <button className="btn small primary">Save</button>
      <button type="button" className="btn small ghost" onClick={onDone}>Cancel</button>
    </form>
  );
}

function CategoryCard({ cat }) {
  const { live, now, startTracking, stopTracking, confirm, refreshCategories, toast, bump } = useApp();
  const [editing, setEditing] = useState(false);
  const isLive = live?.category_id === cat.id;
  const liveMin = isLive ? (now - live.start_ts) / 60000 : 0;
  const minutes = cat.today_min;
  const pct = cat.daily_goal_min ? Math.min(100, (minutes / cat.daily_goal_min) * 100) : 0;

  async function remove() {
    const ok = await confirm('Do you want to delete this?', { detail: `"${cat.name}" and all of its tracked sessions will be permanently removed.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api(`/categories/${cat.id}`, { method: 'DELETE' }); await refreshCategories(); bump(); toast(`Deleted "${cat.name}".`); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div className={`card cat-card ${isLive ? 'is-live' : ''}`} style={{ '--c': cat.color }}>
      <div className="cat-top">
        <span className="cat-dot" />
        <h3>{cat.name}</h3>
        <span className="tag">{cat.grp}</span>
        <button className="icon-btn sm" title="Delete category" onClick={remove}><TrashIcon /></button>
      </div>
      <div className="cat-time">
        <span className="mono big-num">{fmtMin(minutes)}</span>
        <span className="muted small">today{cat.daily_goal_min ? ` / goal ${fmtMin(cat.daily_goal_min)}` : ''}</span>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="cat-meta">
        {cat.daily_goal_min ? (
          <span className={`flame ${cat.streak?.current ? 'on' : ''}`} title={`Best streak: ${cat.streak?.best || 0} days`}>
            🔥 {cat.streak?.current || 0} day streak{cat.streak?.todayMet ? ' · today ✓' : ''}
          </span>
        ) : <span className="muted small">No daily goal set</span>}
        {!editing && <button className="link small" onClick={() => setEditing(true)}><EditIcon /> Goal</button>}
      </div>
      {editing && <GoalEditor cat={cat} onDone={() => setEditing(false)} />}
      {isLive ? (
        <button className="btn danger full" onClick={stopTracking}>■ Stop tracking · <span className="mono">{fmtClock(liveMin * 60)}</span></button>
      ) : (
        <button className="btn soft full" onClick={() => startTracking(cat.id)} disabled={!!live}>▶ Start tracking now</button>
      )}
    </div>
  );
}

function AddCategory() {
  const { refreshCategories, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [grp, setGrp] = useState('study');
  const [goal, setGoal] = useState(60);
  async function add(e) {
    e.preventDefault();
    try {
      await api('/categories', { method: 'POST', body: { name, grp, daily_goal_min: +goal || 0 } });
      await refreshCategories();
      toast(`Added "${name.trim()}".`, 'success');
      setName(''); setOpen(false);
    } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <div className="add-cat">
      <label className="check">
        <input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} />
        <span>Add a new category</span>
      </label>
      {open && (
        <form className="add-cat-form" onSubmit={add}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Category name, e.g. DSA" maxLength={30} required />
          <select value={grp} onChange={e => setGrp(e.target.value)} title="Group (used by the AI analyst)">
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="inline">Goal <input type="number" min="0" max="1440" value={goal} onChange={e => setGoal(e.target.value)} /> min/day</label>
          <button className="btn primary">Add</button>
        </form>
      )}
    </div>
  );
}

function SessionForm({ date, setDate, onAdded }) {
  const { categories, toast } = useApp();
  const [catId, setCatId] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [error, setError] = useState('');
  useEffect(() => { if (!catId && categories[0]) setCatId(String(categories[0].id)); }, [categories, catId]);

  const startTs = atTime(date, start);
  const crosses = end <= start;
  const endTs = atTime(crosses ? addDays(date, 1) : date, end);
  const dur = (endTs - startTs) / 60000;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (endTs > Date.now()) return setError('This session would end in the future. You can only log time that has already happened.');
    try {
      await api('/sessions', { method: 'POST', body: { category_id: +catId, start_ts: startTs, end_ts: endTs } });
      toast(`Logged ${fmtMin(dur)}.`, 'success');
      onAdded();
    } catch (err) { setError(err.message); }
  }

  return (
    <form className="card session-form" onSubmit={submit}>
      <h3>Add time</h3>
      <div className="form-grid">
        <label className="field"><span>Category</span>
          <select value={catId} onChange={e => setCatId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Date</span>
          <input type="date" value={date} min="2020-01-01" max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="field"><span>Start</span><input type="time" value={start} onChange={e => setStart(e.target.value)} required /></label>
        <label className="field"><span>End</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} required /></label>
      </div>
      <p className="muted small">Duration: <b>{fmtMin(dur)}</b>{crosses && ' · ends the next day (e.g. sleep)'}</p>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary">Add session</button>
    </form>
  );
}

function SessionList({ date, version, onChanged }) {
  const { confirm, toast } = useApp();
  const [sessions, setSessions] = useState([]);
  useEffect(() => { api(`/sessions?date=${date}`).then(d => setSessions(d.sessions)).catch(() => {}); }, [date, version]);
  async function remove(s) {
    if (!(await confirm('Do you want to delete this?', { detail: `${s.cat} · ${fmtTime(s.start_ts)} – ${fmtTime(s.end_ts)}`, danger: true, confirmText: 'Yes, delete' }))) return;
    try { await api(`/sessions/${s.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div className="card">
      <div className="card-head"><h3>Sessions</h3><span className="muted small">{fmtDateLong(date)}</span></div>
      {!sessions.length ? <div className="empty">No sessions on this day yet.</div> : (
        <ul className="session-list">
          {sessions.map(s => (
            <li key={s.id}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="session-cat">{s.cat}</span>
              <span className="mono">{fmtTime(s.start_ts)} – {s.end_ts ? fmtTime(s.end_ts) : 'now'}</span>
              <span className="muted mono small">{s.end_ts ? fmtMin((s.end_ts - s.start_ts) / 60000) : 'live'}</span>
              <span className="tag">{s.source}</span>
              {s.end_ts && <button className="icon-btn sm" title="Delete session" onClick={() => remove(s)}><TrashIcon /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportExport() {
  const { toast, confirm, refreshCategories, bump } = useApp();
  const fileRef = useRef(null);
  async function doExport() {
    try {
      const data = await api('/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chronos-export-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`Exported ${data.sessions.length} sessions.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON.', 'error'); }
    if (data?.app !== 'chronos') return toast('This does not look like a Chronos export file.', 'error');
    const ok = await confirm('Import this file?', { detail: `${data.categories?.length || 0} categories, ${data.sessions?.length || 0} sessions, ${data.goals?.length || 0} goals, ${data.reminders?.length || 0} reminders. Existing data is kept; overlapping sessions are skipped.`, confirmText: 'Import' });
    if (!ok) return;
    try {
      const { report } = await api('/import', { method: 'POST', body: data });
      await refreshCategories(); bump();
      toast(`Imported ${report.sessions} sessions, ${report.categories} categories, ${report.goals} goals${report.sessionsSkipped ? ` (${report.sessionsSkipped} sessions skipped)` : ''}.`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <div className="io-buttons">
      <button className="btn ghost" onClick={() => fileRef.current?.click()}>⬆ Import JSON</button>
      <button className="btn ghost" onClick={doExport}>⬇ Export JSON</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
    </div>
  );
}

export default function Tracker() {
  const { categories, dataVersion, bump, refreshCategories } = useApp();
  const [q, setQ] = useState('');
  const [date, setDate] = useState(todayStr());
  const filtered = useMemo(() => categories.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase())), [categories, q]);
  const changed = () => { bump(); refreshCategories(); };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Time Tracker</h1>
          <p className="muted">Track your day by category. Meet a category's daily goal to grow its streak.</p>
        </div>
        <ImportExport />
      </div>

      <div className="search">
        <SearchIcon />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search categories…" aria-label="Search categories" />
      </div>

      <div className="cat-grid">
        {filtered.map(c => <CategoryCard key={c.id} cat={c} />)}
        {!filtered.length && <div className="empty">No category matches “{q}”.</div>}
      </div>
      <AddCategory />

      <div className="grid-2 align-start">
        <SessionForm date={date} setDate={setDate} onAdded={changed} />
        <SessionList date={date} version={dataVersion} onChanged={changed} />
      </div>

      <WeekChart />
      <YearCalendar onPickDate={d => { setDate(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </div>
  );
}
