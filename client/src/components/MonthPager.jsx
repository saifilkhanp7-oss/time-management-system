import { MONTHS } from '../lib/time.js';

/** ‹ Month Year › switcher used by the calendars on small screens. */
export default function MonthPager({ month, setMonth, year, min = 0, max = 11 }) {
  return (
    <div className="month-pager">
      <button className="icon-btn" disabled={month <= min} onClick={() => setMonth(month - 1)} aria-label="Previous month">‹</button>
      <span>{MONTHS[month]} {year}</span>
      <button className="icon-btn" disabled={month >= max} onClick={() => setMonth(month + 1)} aria-label="Next month">›</button>
    </div>
  );
}
