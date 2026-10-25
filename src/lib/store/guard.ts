import { isPast } from '$lib/model/dates';
import type { DateKey } from '$lib/model/types';

export class ReadOnlyDayError extends Error {
  readonly date: DateKey;
  constructor(date: DateKey) {
    super(`${date} is a past day and cannot be changed`);
    this.name = 'ReadOnlyDayError';
    this.date = date;
  }
}

/** Past days are read-only. Throws for any date before `today`. */
export function assertEditable(key: DateKey, today: DateKey): void {
  if (isPast(key, today)) throw new ReadOnlyDayError(key);
}
