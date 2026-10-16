import { useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { api } from '../lib/api.js';
import { MONTHS, WEEKDAYS, addDays, fmtDateLong, fmtDateShort, monthGrid, todayStr } from '../lib/time.js';
import { TrashIcon } from '../components/Icons.jsx';
import useIsMobile from '../lib/useIsMobile.js';
import MonthPager from '../components/MonthPager.jsx';

export default function Reminders() {
  const { confirm, toast, bump } = useApp();
  const [reminders, setReminders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const today = todayStr();
  const year = +today.slice(0, 4);
  const tomorrow = addDays(today, 1);
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(+today.slice(5, 7) - 1);

  useEffect(() => { api('/reminders').then(d => setReminders(d.reminders)).catch(e => toast(e.message, 'error')); }, [toast]);

  const byDate = reminders.reduce((m, r) => ((m[r.date] ||= []).push(r), m), {});

  async function add(e) {
    e.preventDefault();
    try { const d = await api('/reminders', { method: 'POST', body: { date: selected, text } }); setReminders(d.reminders); setText(''); bump(); toast('Reminder added.', 'success'); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(r) {
    if (!(await confirm('Do you want to delete this?', { detail: r.text, danger: true, confirmText: 'Yes, delete' }))) return;
    try { const d = await api(`/reminders/${r.id}`, { method: 'DELETE' }); setReminders(d.reminders); bump(); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Reminders</h1>
          <p className="muted">Pick any future day in {year}. The day before, it shows up on your home screen as “Your tomorrow's activity is: …”.</p>
        </div>
      </div>

      {byDate[tomorrow] && (
        <div className="card alert-card reminder">
          <h3>📅 Your tomorrow's activity is:</h3>
          <ul>{byDate[tomorrow].map(r => <li key={r.id}>{r.text}</li>)}</ul>
        </div>
      )}

      <div className="reminder-layout">
        <div className="card">
          <div className="card-head"><h3>{year}</h3><span className="muted small">Past days and today are locked</span></div>
          {isMobile && <MonthPager month={month} setMonth={setMonth} year={year} min={+today.slice(5, 7) - 1} />}
          <div className={`months compact ${isMobile ? 'single' : ''}`}>
            {MONTHS.map((name, mi) => (isMobile && mi !== month) ? null : (
              <div key={name} className="month">
                <div className="month-name">{name}</div>
                <div className="month-grid">
                  {WEEKDAYS.map(w => <span key={w} className="wd">{w[0]}</span>)}
                  {monthGrid(year, mi).map((d, i) => d ? (
                    <button key={d} disabled={d <= today}
                      className={`day rday ${d === today ? 'today' : ''} ${byDate[d] ? 'has' : ''} ${selected === d ? 'sel' : ''}`}
                      onClick={() => { setSelected(d); if (isMobile) setTimeout(() => document.getElementById('reminder-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} title={byDate[d] ? byDate[d].map(r => r.text).join(' • ') : d}>
                      {+d.slice(8)}
                    </button>
                  ) : <span key={`e${i}`} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card" id="reminder-form">
            {selected ? (
              <>
                <h3>{fmtDateLong(selected)}</h3>
                <form className="stack" onSubmit={add}>
                  <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's planned for this day?" maxLength={300} rows={3} required />
                  <button className="btn primary">Add reminder</button>
                </form>
                {byDate[selected] && (
                  <ul className="reminder-list">
                    {byDate[selected].map(r => (
                      <li key={r.id}><span>{r.text}</span><button className="icon-btn sm" onClick={() => remove(r)} title="Delete"><TrashIcon /></button></li>
                    ))}
                  </ul>
                )}
              </>
            ) : <div className="empty">Select a future date on the calendar to add a reminder.</div>}
          </div>

          <div className="card">
            <h3>Upcoming</h3>
            {!reminders.length ? <div className="empty">No upcoming reminders.</div> : (
              <ul className="reminder-list">
                {reminders.map(r => (
                  <li key={r.id}>
                    <button className="tag date-tag" onClick={() => setSelected(r.date)}>{r.date === tomorrow ? 'Tomorrow' : fmtDateShort(r.date)}</button>
                    <span>{r.text}</span>
                    <button className="icon-btn sm" onClick={() => remove(r)} title="Delete"><TrashIcon /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
