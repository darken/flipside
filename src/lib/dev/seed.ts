import { addDays, parseKey, todayKey } from '$lib/model/dates';
import type { AppData, DateKey, Day, Routine, Task } from '$lib/model/types';

/**
 * Realistic sample data for trying the app with a year (or three) of history: `?seed=365` in the
 * dev server, and the screenshots and performance checks. Deterministic, so runs compare.
 */

const ROUTINES = ['Stretch', 'Read for 20 minutes', 'Water the plants', 'Review the week'];

const ONE_OFFS = [
  'Reply to Sam about the schedule',
  'Buy oat milk and bread',
  'Book the dentist',
  'Pay the electricity bill',
  'Call Mom',
  'Finish the draft of the proposal and send it round for comments before the end of the day',
  'Renew the library books',
  'Plan Saturday dinner 🍝',
  'Fix the squeaky door',
  'Back up the photos',
  'Order a birthday gift 🎁',
  'Clean the kitchen',
  'Email the landlord about the heating',
  'Go for a run 🏃',
  'Sort the receipts',
  'Pick up the parcel',
  'Write the thank-you notes',
  'Update the budget sheet',
  'Take out the recycling',
  'Prepare slides for Thursday',
];

/** A small seeded random generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A local time on a day, as the ISO timestamp the app stores. */
function at(key: DateKey, hour: number, minute: number): string {
  const day = parseKey(key);
  day.setHours(hour, minute, 0, 0);
  return day.toISOString();
}

export type SeedOptions = {
  /** Days of history, counting today. */
  days: number;
  today?: DateKey;
  seed?: number;
};

export function seedData({ days: count, today = todayKey(), seed = 1 }: SeedOptions): AppData {
  const rand = random(seed);

  const routines: Routine[] = ROUTINES.map((text, i) => ({
    id: `routine-${i + 1}`,
    text,
    active: i !== 3 || count < 200, // one routine has been stopped in a long history
    createdAt: at(addDays(today, -(count - 1)), 8, 0),
  }));

  const result: Record<DateKey, Day> = {};
  for (let back = count - 1; back >= 0; back--) {
    const key = addDays(today, -back);
    const isToday = back === 0;
    // Roughly one day in ten is missed (but never today).
    if (!isToday && rand() < 0.1) continue;

    const tasks: Task[] = [];
    const add = (text: string, extra: Partial<Task> = {}) =>
      tasks.push({
        id: `${key}-${tasks.length}`,
        text,
        createdAt: at(key, 7, tasks.length % 60),
        order: tasks.length,
        ...extra,
      });

    // The stopped routine only existed for the first part of the history.
    const stoppedAfter = Math.floor(count * 0.6);
    routines.forEach((routine, i) => {
      if (i === 3 && count >= 200 && back < count - stoppedAfter) return;
      const done = !isToday && rand() < 0.8;
      add(routine.text, {
        routineId: routine.id,
        ...(done && { doneAt: at(key, 8 + (i % 3), 10 * i) }),
      });
    });

    const oneOffs = 3 + Math.floor(rand() * 7) + (isToday ? 3 : 0);
    // A different handful each day, never the same task twice on one page.
    const pool = [...ONE_OFFS];
    for (let i = 0; i < oneOffs; i++) {
      const text = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
      // Past days finished about three quarters of what they had; today is half way through.
      const finished = isToday ? i % 2 === 0 : rand() < 0.75;
      add(text, finished ? { doneAt: at(key, 9 + Math.floor(rand() * 9), i * 7) } : {});
    }
    result[key] = { date: key, tasks };
  }
  return { version: 1, days: result, routines };
}

/** Dev only: `?seed=365` fills storage with sample data before the app starts. */
export function seedFromLocation(
  search: string,
  storage: Pick<Storage, 'setItem'>,
  today: DateKey = todayKey(),
): boolean {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null) return false;
  const days = Math.min(5000, Math.max(1, Number.parseInt(raw, 10) || 365));
  storage.setItem('flipside:v1', JSON.stringify(seedData({ days, today })));
  console.info(`Flipside: seeded ${days} days of sample data (dev only)`);
  return true;
}
