import NepaliDate from 'nepali-date-converter';

// The school keeps every date in Bikram Sambat, as "YYYY-MM-DD" text.

export const BS_MONTHS = [
  'Baishakh',
  'Jestha',
  'Asar',
  'Shrawan',
  'Bhadra',
  'Asoj',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type BsMonth = { year: number; month: number }; // month is 1-12

const pad = (n: number) => String(n).padStart(2, '0');

export function bsToday(): string {
  return NepaliDate.now().format('YYYY-MM-DD');
}

export function bsThisMonth(): BsMonth {
  const now = NepaliDate.now();
  return { year: now.getYear(), month: now.getMonth() + 1 };
}

export function shiftMonth({ year, month }: BsMonth, by: number): BsMonth {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth({ year, month }: BsMonth): number {
  const first = new NepaliDate(year, month - 1, 1).toJsDate();
  const next = shiftMonth({ year, month }, 1);
  const nextFirst = new NepaliDate(next.year, next.month - 1, 1).toJsDate();
  return Math.round((nextFirst.getTime() - first.getTime()) / 86_400_000);
}

/** Weekday (0 = Sunday) of the month's first day. */
export function firstWeekday({ year, month }: BsMonth): number {
  return new NepaliDate(year, month - 1, 1).getDay();
}

export function monthStart(m: BsMonth): string {
  return `${m.year}-${pad(m.month)}-01`;
}

export function monthEnd(m: BsMonth): string {
  return `${m.year}-${pad(m.month)}-${pad(daysInMonth(m))}`;
}

export function monthLabel(m: BsMonth): string {
  return `${BS_MONTHS[m.month - 1]} ${m.year}`;
}

function parse(bs: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(bs ?? '');
  if (!match) return null;
  return { year: +match[1], month: +match[2], day: +match[3] };
}

/** "19 Kartik 2083" */
export function bsLong(bs: string | null | undefined): string {
  const d = parse(bs ?? '');
  if (!d || d.month < 1 || d.month > 12) return bs ?? '';
  return `${d.day} ${BS_MONTHS[d.month - 1]} ${d.year}`;
}

/** "19 Kartik" */
export function bsShort(bs: string | null | undefined): string {
  const d = parse(bs ?? '');
  if (!d || d.month < 1 || d.month > 12) return bs ?? '';
  return `${d.day} ${BS_MONTHS[d.month - 1]}`;
}

export function bsWeekday(bs: string): string {
  try {
    return WEEKDAYS[NepaliDate.parse(bs).getDay()];
  } catch {
    return '';
  }
}

/** Whole days from `from` to `to` (both BS), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number | null {
  try {
    const a = NepaliDate.parse(from).toJsDate().getTime();
    const b = NepaliDate.parse(to).toJsDate().getTime();
    return Math.round((b - a) / 86_400_000);
  } catch {
    return null;
  }
}

export function monthName(month: number | string | null | undefined): string {
  const n = Number(month);
  return n >= 1 && n <= 12 ? BS_MONTHS[n - 1] : '';
}

/** Rs 1,23,456 — Nepali grouping: the last three digits, then pairs. */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0';
  const negative = n < 0;
  const [whole, fraction] = Math.abs(n).toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const cents = fraction === '00' ? '' : `.${fraction}`;
  return `${negative ? '-' : ''}Rs ${grouped}${cents}`;
}

/** "08:02" from an ISO time or "08:02:11". */
export function clock(value: string | null | undefined): string {
  if (!value) return '';
  const match = /(\d{2}):(\d{2})/.exec(value);
  if (!match) return '';
  if (value.includes('T')) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return `${match[1]}:${match[2]}`;
}

export function titleCase(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** "75.00" → "75", "62.50" → "62.5"; anything else as it is. */
export function trimNumber(value: string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return /^-?\d+\.\d+$/.test(value) ? value.replace(/\.?0+$/, '') : value;
}

/** Rs from whole paisa, as the server sends money. */
export function rupees(paisa: number | null | undefined): string {
  return money((paisa ?? 0) / 100);
}

/** "Due today", "Due tomorrow", "Due in 3 days", "Was due 2 days ago". */
export function dueLabel(due: string, today: string): string {
  const days = daysBetween(today, due);
  if (days === null) return `Due ${bsShort(due)}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return days === -1 ? 'Was due yesterday' : `Was due ${-days} days ago`;
}

/** A BS date `days` after `from`. */
export function bsAddDays(from: string, days: number): string {
  const d = NepaliDate.parse(from).toJsDate();
  d.setDate(d.getDate() + days);
  return new NepaliDate(d).format('YYYY-MM-DD');
}

/** "27 Kartik 2083" from an ISO timestamp, by the phone's clock. */
export function bsFromIso(iso: string): string {
  try {
    return bsLong(new NepaliDate(new Date(iso)).format('YYYY-MM-DD'));
  } catch {
    return '';
  }
}
