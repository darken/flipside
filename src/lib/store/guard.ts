import { dayAccess, isPast } from '$lib/model/dates';
import type { DateKey } from '$lib/model/types';

export class ReadOnlyDayError extends Error {
  readonly date: DateKey;
  constructor(date: DateKey) {
    super(`${date} is a past day and cannot be changed`);
    this.name = 'ReadOnlyDayError';
    this.date = date;
  }
}

/** Every change except checking is for today only. Throws for any date before `today`. */
export function assertEditable(key: DateKey, today: DateKey): void {
  if (isPast(key, today)) throw new ReadOnlyDayError(key);
}

/** Checking tasks off and on is allowed on today and yesterday. Throws for anything older. */
export function assertCanCheck(key: DateKey, today: DateKey): void {
  if (dayAccess(key, today) === 'read-only') throw new ReadOnlyDayError(key);
}
