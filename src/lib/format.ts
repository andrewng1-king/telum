export const DAY_MS = 86_400_000;

/** 32 -> "32", 32.5 -> "32.5" */
export function fmtW(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** Session tonnage "7.8" (t) */
export function fmtTonnes(kg: number): string {
  return (kg / 1000).toFixed(1);
}

/** hh:mm:ss elapsed clock */
export function fmtClock(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** m:ss rest countdown */
export function fmtRest(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "5:32" pace from seconds-per-km; em dash when unknown. */
export function fmtPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 30 * 60) return '—:——';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "4.82" km from meters. */
export function fmtKm(m: number): string {
  return (m / 1000).toFixed(2);
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Friday · 22 Jul" */
export function fmtGreetDate(t: number): string {
  const d = new Date(t);
  return `${WD[d.getDay()]} · ${d.getDate()} ${MO3[d.getMonth()]}`;
}

/** "Fri 22 Jul" */
export function fmtShortDate(t: number): string {
  const d = new Date(t);
  return `${WD3[d.getDay()]} ${d.getDate()} ${MO3[d.getMonth()]}`;
}

/** "Fri · 22 Jul · 9:41" */
export function fmtCardDate(t: number): string {
  const d = new Date(t);
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WD3[d.getDay()]} · ${d.getDate()} ${MO3[d.getMonth()]} · ${hh}:${mm}`;
}

export function weekday3(t: number): string {
  return WD3[new Date(t).getDay()];
}

/** "19 Aug" */
export function fmtDayMonth(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MO3[d.getMonth()]}`;
}

export function monthName(t: number): string {
  return MONTHS[new Date(t).getMonth()];
}

export function dayOfMonth(t: number): number {
  return new Date(t).getDate();
}

/** Monday 00:00 local of the week containing t. */
export function startOfWeek(t: number = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // Mon=0
  return d.getTime() - shift * DAY_MS;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today" | "1d ago" | "4d ago" | "3w ago" */
export function agoLabel(t: number): string {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(t)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** Weekday label for a day n slots after today: "Today", "Sat", "Sun"... */
export function upcomingLabel(offset: number): string {
  if (offset === 0) return 'Today';
  return WD3[new Date(Date.now() + offset * DAY_MS).getDay()];
}
