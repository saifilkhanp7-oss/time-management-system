import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { fmtDateLong, fmtDateShort, fmtTime } from '../lib/time.js';
import { EditIcon, PinIcon, TrashIcon } from '../components/Icons.jsx';

function crackers() {
  const colors = ['#e8672e', '#f5a524', '#4f7cff', '#17c3b2', '#ef476f', '#ffffff'];
  const fire = (x, y, n = 70) => confetti({ particleCount: n, spread: 360, startVelocity: 38, gravity: 0.9, ticks: 120, origin: { x, y }, colors, scalar: 0.9, zIndex: 9999 });
  fire(0.5, 0.5, 120);
  setTimeout(() => fire(0.25, 0.35), 220);
  setTimeout(() => fire(0.75, 0.35), 420);
  setTimeout(() => fire(0.4, 0.25), 650);
  setTimeout(() => fire(0.62, 0.55), 850);
  setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors, zIndex: 9999 }), 300);
  setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors, zIndex: 9999 }), 300);
}

function GoalItem({ g, today, onUpdate, onDelete, pinnedCount }) {
  const { confirm, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(g.text);
  const carried = g.created_date < today;

  async function complete() {
    if (!(await confirm('Do you want to mark it as complete?', { detail: g.text, confirmText: 'Yes, mark it' }))) return;
    if (await onUpdate(g.id, { completed: true })) crackers();
  }
  async function save(e) {
    e.preventDefault();
    if (await onUpdate(g.id, { text })) setEditing(false);
  }
  function pin() {
    if (!g.pinned && pinnedCount >= 4) return toast('You can pin at most 4 goals. Unpin one first.', 'error');
    onUpdate(g.id, { pinned: !g.pinned });
  }
  return (
    <li className={`goal ${g.pinned ? 'pinned' : ''} ${carried ? 'carried' : ''}`}>
      <button className="goal-check" title="Mark as complete" onClick={complete} aria-label="Mark as complete" />
      {editing ? (
        <form className="goal-edit" onSubmit={save}>
          <input autoFocus value={text} onChange={e => setText(e.target.value)} maxLength={200} />
          <button className="btn small primary">Save</button>
          <button type="button" className="btn small ghost" onClick={() => { setEditing(false); setText(g.text); }}>Cancel</button>
        </form>
      ) : (
        <div className="goal-text">
          <span>{g.text}</span>
          {carried && <span className="tag warn">carried over from {fmtDateShort(g.created_date)}</span>}
        </div>
      )}
      {!editing && (
        <div className="goal-actions">
          <button className={`icon-btn sm ${g.pinned ? 'on' : ''}`} title={g.pinned ? 'Unpin' : 'Pin'} onClick={pin}><PinIcon filled={g.pinned} /></button>
          <button className="icon-btn sm" title="Edit" onClick={() => setEditing(true)}><EditIcon /></button>
          <button className="icon-btn sm" title="Delete" onClick={() => onDelete(g)}><TrashIcon /></button>
        </div>
      )}
    </li>
  );
}

export default function Planner() {
  const { confirm, toast, bump } = useApp();
  const [data, setData] = useState({ open: [], doneToday: [], today: '' });
  const [text, setText] = useState('');
  useEffect(() => { api('/goals').then(setData).catch(e => toast(e.message, 'error')); }, [toast]);

  async function add(e) {
    e.preventDefault();
    try { setData(await api('/goals', { method: 'POST', body: { text } })); setText(''); bump(); } catch (err) { toast(err.message, 'error'); }
  }
  async function update(id, body) {
    try { setData(await api(`/goals/${id}`, { method: 'PATCH', body })); bump(); return true; } catch (err) { toast(err.message, 'error'); return false; }
  }
  async function remove(g) {
    if (!(await confirm('Do you want to delete this?', { detail: g.text, danger: true, confirmText: 'Yes, delete' }))) return;
    try { setData(await api(`/goals/${g.id}`, { method: 'DELETE' })); bump(); } catch (err) { toast(err.message, 'error'); }
  }
  async function undo(g) { update(g.id, { completed: false }); }

  const pinned = data.open.filter(g => g.pinned);
  const rest = data.open.filter(g => !g.pinned);
  const carried = data.open.filter(g => g.created_date < data.today);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Planner</h1>
          <p className="muted">{data.today && fmtDateLong(data.today)} · Goals you don't finish are carried over to the next day.</p>
        </div>
        <div className="planner-stats">
          <div><b>{data.open.length}</b><span>open</span></div>
          <div><b>{data.doneToday.length}</b><span>done today</span></div>
          <div><b>{pinned.length}/4</b><span>pinned</span></div>
        </div>
      </div>

      <form className="card add-goal" onSubmit={add}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a goal for today…" maxLength={200} required />
        <button className="btn primary">Add goal</button>
      </form>

      {carried.length > 0 && <div className="alert warning">⚠️ {carried.length} goal{carried.length > 1 ? 's' : ''} not completed on previous days {carried.length > 1 ? 'have' : 'has'} been carried over to today.</div>}

      {pinned.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>📌 Pinned</h3><span className="muted small">{pinned.length} of 4</span></div>
          <ul className="goal-list">{pinned.map(g => <GoalItem key={g.id} g={g} today={data.today} onUpdate={update} onDelete={remove} pinnedCount={pinned.length} />)}</ul>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h3>Today's goals</h3></div>
        {rest.length ? (
          <ul className="goal-list">{rest.map(g => <GoalItem key={g.id} g={g} today={data.today} onUpdate={update} onDelete={remove} pinnedCount={pinned.length} />)}</ul>
        ) : <div className="empty">{pinned.length ? 'All other goals are pinned above.' : 'No goals yet. Add your first one above.'}</div>}
      </section>

      {data.doneToday.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>🎉 Completed today</h3></div>
          <ul className="goal-list done">
            {data.doneToday.map(g => (
              <li key={g.id} className="goal">
                <span className="goal-check checked">✓</span>
                <div className="goal-text"><span>{g.text}</span><span className="muted small">at {fmtTime(g.completed_at)}</span></div>
                <button className="link small" onClick={() => undo(g)}>Undo</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
