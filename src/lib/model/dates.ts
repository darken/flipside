import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Local calendar date as YYYY-MM-DD. Never use toISOString(): that is UTC and shifts the day. */
export function todayKey(now: Date = new Date()): DateKey {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parts(key: string): [number, number, number] | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Round-trip through a UTC date to reject things like 2026-02-30.
  const check = new Date(0);
  check.setUTCFullYear(y, m - 1, d);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return [y, m, d];
}

export function isValidKey(key: unknown): key is DateKey {
  return typeof key === 'string' && parts(key) !== null;
}

/** Local midnight at the start of the given day. Throws on an invalid key. */
export function parseKey(key: DateKey): Date {
  const p = parts(key);
  if (!p) throw new RangeError(`Invalid date key: ${key}`);
  const date = new Date(2000, 0, 1);
  date.setFullYear(p[0], p[1] - 1, p[2]);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Calendar arithmetic, so it is unaffected by daylight-saving changes. */
export function addDays(key: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) throw new RangeError(`Not a whole number of days: ${days}`);
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

/** -1, 0 or 1. Valid keys sort the same as the dates they name. */
export function compareKeys(a: DateKey, b: DateKey): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) throw new RangeError(`Invalid date key: ${a ? to : from}`);
  const utc = ([y, m, d]: [number, number, number]) => {
    const date = new Date(0);
    date.setUTCFullYear(y, m - 1, d);
    return date.getTime();
  };
  return Math.round((utc(b) - utc(a)) / MS_PER_DAY);
}

/** True when `key` is a day before `today`. Past days are read-only. */
export function isPast(key: DateKey, today: DateKey): boolean {
  return compareKeys(key, today) < 0;
}

/** Page heading such as "Sunday, October 25". */
export function formatHeading(key: DateKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseKey(key));
}

/** Local time of day for an ISO timestamp, such as "14:32" or "2:32 PM" depending on locale. */
export function formatTime(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** How long ago a page is, relative to today: "Yesterday", "3 days ago", "2 weeks ago". */
export function formatRelative(key: DateKey, today: DateKey): string {
  const days = daysBetween(key, today);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  if (days < 0) return `In ${-days} days`;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.floor(days / 7), 'week');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

/** Day of the week for a key: 0 = Sunday … 6 = Saturday. */
export function weekday(key: DateKey): number {
  return parseKey(key).getDay();
}

type WeekInfoLocale = Intl.Locale & {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
};

/**
 * First day of the week for a locale as 0–6 (0 = Sunday), read from `Intl.Locale`'s
 * `getWeekInfo()` or the older `weekInfo` property. Monday (1) when neither is available.
 */
export function weekStart(locale?: string): number {
  try {
    const tag = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
    const info = new Intl.Locale(tag as string) as WeekInfoLocale;
    const first = (typeof info.getWeekInfo === 'function' ? info.getWeekInfo() : info.weekInfo)
      ?.firstDay;
    // Intl numbers days 1 (Monday) to 7 (Sunday).
    if (typeof first === 'number' && first >= 1 && first <= 7) return first % 7;
  } catch {
    // Unknown or missing locale: fall through to Monday.
  }
  return 1;
}

/** The first day of the week containing `key`, for a week that starts on `weekStart` (0–6). */
export function startOfWeek(key: DateKey, weekStart: number): DateKey {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7));
}

/** "Oct 22" */
export function formatShort(key: DateKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseKey(key));
}

/** "Wed, Oct 22" */
export function formatWithWeekday(key: DateKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parseKey(key));
}

/** "Wed", "Mon", … for a weekday number 0–6. */
export function weekdayName(day: number, locale?: string, width: 'short' | 'narrow' = 'short') {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(
    parseKey(addDays('2023-01-01', day)),
  );
}
