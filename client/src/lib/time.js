export const pad = n => String(n).padStart(2, '0');

export const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** Local epoch ms for "YYYY-MM-DD" + "HH:MM". */
export const atTime = (dateStr, hhmm) => { const [h, mi] = hhmm.split(':').map(Number); const d = parseDate(dateStr); d.setHours(h, mi, 0, 0); return d.getTime(); };

export function fmtMin(m) {
  const t = Math.round(m || 0), h = Math.floor(t / 60), r = t % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fmtDateLong = s => parseDate(s).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateShort = s => parseDate(s).toLocaleDateString([], { day: 'numeric', month: 'short' });

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Monday-first month grid: array of (dateStr|null). */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function mondayOf(dateStr) {
  const d = parseDate(dateStr);
  return addDays(dateStr, -((d.getDay() + 6) % 7));
}

export const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
