import { addDays, compareKeys, daysBetween, startOfWeek, weekday } from '$lib/model/dates';
import type { AppData, DateKey, Task } from '$lib/model/types';

/*
 * Definitions (also in CLAUDE.md):
 * - A done task has `doneAt` set and counts on its page's date.
 * - An active day has a saved page; a missed day is a calendar day without one.
 * - A streak is consecutive calendar days with at least one task done. It ends today or yesterday,
 *   so a day still in progress does not show it as broken.
 * - Routine completion is done instances / instances that existed (days where it was added).
 * - Today is included in every figure as it stands.
 */

export type Range = { from: DateKey; to: DateKey };

export type DayCount = { date: DateKey; done: number; total: number; hasPage: boolean };

const isDone = (task: Task) => task.doneAt !== undefined;

/** The last `days` days up to and including `today`. */
export function lastDays(days: number, today: DateKey): Range {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Whole days in a range, both ends included. */
export const rangeLength = (range: Range) => Math.max(0, daysBetween(range.from, range.to) + 1);

/** One entry per calendar day in the range, including days without a page. */
export function dailyCounts(data: AppData, from: DateKey, to: DateKey): DayCount[] {
  const counts: DayCount[] = [];
  for (let date = from; compareKeys(date, to) <= 0; date = addDays(date, 1)) {
    const day = data.days[date];
    counts.push({
      date,
      done: day ? day.tasks.filter(isDone).length : 0,
      total: day ? day.tasks.length : 0,
      hasPage: day !== undefined,
    });
  }
  return counts;
}

export type Streaks = { current: number; longest: number; longestEnd: DateKey | null };

export function streaks(data: AppData, today: DateKey): Streaks {
  const doneDays = Object.values(data.days)
    .filter((day) => day.tasks.some(isDone))
    .map((day) => day.date)
    .sort();
  const has = new Set(doneDays);

  let longest = 0;
  let longestEnd: DateKey | null = null;
  let run = 0;
  let previous: DateKey | null = null;
  for (const date of doneDays) {
    run = previous !== null && daysBetween(previous, date) === 1 ? run + 1 : 1;
    // `>=`: of equally long streaks, report the most recent.
    if (run >= longest) {
      longest = run;
      longestEnd = date;
    }
    previous = date;
  }

  // The current streak may end today, or yesterday while today is still empty.
  let end: DateKey | null = null;
  if (has.has(today)) end = today;
  else if (has.has(addDays(today, -1))) end = addDays(today, -1);
  let current = 0;
  for (let date = end; date !== null && has.has(date); date = addDays(date, -1)) current++;

  return { current, longest, longestEnd };
}

export type Summary = {
  done: number;
  activeDays: number;
  /** Tasks done per active day. */
  average: number;
  /** Done tasks / all tasks on the pages in the range, 0–1. */
  completionRate: number;
  bestDay: { date: DateKey; done: number } | null;
  previousDone: number;
  /** Change against the previous period of the same length, or null when it has no data. */
  change: number | null;
};

/** Ranges never reach past today: future days are not supported. */
function clamp(range: Range, today: DateKey): Range {
  return compareKeys(range.to, today) > 0 ? { from: range.from, to: today } : range;
}

export function summary(data: AppData, range: Range, today: DateKey): Summary {
  const { from, to } = clamp(range, today);
  const counts = dailyCounts(data, from, to);
  const done = counts.reduce((sum, c) => sum + c.done, 0);
  const total = counts.reduce((sum, c) => sum + c.total, 0);
  const activeDays = counts.filter((c) => c.hasPage).length;

  let bestDay: Summary['bestDay'] = null;
  for (const c of counts) {
    if (c.done > 0 && (bestDay === null || c.done > bestDay.done)) {
      bestDay = { date: c.date, done: c.done };
    }
  }

  const length = counts.length;
  const previous = dailyCounts(data, addDays(from, -length), addDays(from, -1));
  const previousDone = previous.reduce((sum, c) => sum + c.done, 0);

  return {
    done,
    activeDays,
    average: activeDays > 0 ? done / activeDays : 0,
    completionRate: total > 0 ? done / total : 0,
    bestDay,
    previousDone,
    change: previousDone > 0 ? (done - previousDone) / previousDone : null,
  };
}

export type StripState = 'done' | 'missed' | 'none';

export type RoutineStat = {
  id: string;
  text: string;
  active: boolean;
  done: number;
  instances: number;
  /** 0–1, or null when it had no instances in the range. */
  rate: number | null;
  /** The 14 days ending at the end of the range, oldest first. */
  strip: { date: DateKey; state: StripState }[];
};

export const STRIP_DAYS = 14;

/**
 * Per-routine completion over a range. Routines are matched by `routineId`, so a renamed routine
 * keeps its history. Stopped routines with nothing in the range are left out.
 */
export function routineStats(data: AppData, range: Range): RoutineStat[] {
  const stripFrom = addDays(range.to, -(STRIP_DAYS - 1));
  const stats: RoutineStat[] = [];
  for (const routine of data.routines) {
    let done = 0;
    let instances = 0;
    for (const day of Object.values(data.days)) {
      if (day.date < range.from || day.date > range.to) continue;
      for (const task of day.tasks) {
        if (task.routineId !== routine.id) continue;
        instances++;
        if (isDone(task)) done++;
      }
    }
    if (!routine.active && instances === 0) continue;

    const strip = dailyKeys(stripFrom, range.to).map((date) => {
      const tasks = data.days[date]?.tasks.filter((t) => t.routineId === routine.id) ?? [];
      const state: StripState =
        tasks.length === 0 ? 'none' : tasks.some(isDone) ? 'done' : 'missed';
      return { date, state };
    });

    stats.push({
      id: routine.id,
      text: routine.text,
      active: routine.active,
      done,
      instances,
      rate: instances > 0 ? done / instances : null,
      strip,
    });
  }
  return stats;
}

function dailyKeys(from: DateKey, to: DateKey): DateKey[] {
  return dailyCounts({ version: 1, days: {}, routines: [] }, from, to).map((c) => c.date);
}

export type WeekdayAverage = { weekday: number; average: number; days: number };

/** Average tasks done on each weekday (over days with a page), starting from the week start. */
export function weekdayAverages(data: AppData, range: Range, weekStart: number): WeekdayAverage[] {
  const sums = Array.from({ length: 7 }, () => ({ done: 0, days: 0 }));
  for (const c of dailyCounts(data, range.from, range.to)) {
    if (!c.hasPage) continue;
    const slot = sums[weekday(c.date)]!;
    slot.done += c.done;
    slot.days++;
  }
  return Array.from({ length: 7 }, (_, i) => {
    const day = (weekStart + i) % 7;
    const { done, days } = sums[day]!;
    return { weekday: day, average: days > 0 ? done / days : 0, days };
  });
}

export type HeatCell = DayCount & {
  /** 0 = nothing done, 1–4 = quarters of your active days. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today, so not a real day yet. */
  future: boolean;
};

export type Heatmap = {
  /** Columns are weeks, oldest first; each has 7 cells starting from the week start. */
  weeks: HeatCell[][];
  /** Where a month starts: the column and the month number (0–11). */
  months: { col: number; month: number }[];
  /** Upper bound of levels 1–3; anything above is level 4. */
  cuts: [number, number, number];
};

/** Fewer active days with something done than this and fixed thresholds are used. */
export const MIN_DAYS_FOR_QUARTILES = 8;
const FIXED_CUTS: [number, number, number] = [1, 3, 5];

export function heatmapCuts(doneCounts: number[]): [number, number, number] {
  const counts = doneCounts.filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length < MIN_DAYS_FOR_QUARTILES) return FIXED_CUTS;
  // Nearest-rank quartiles.
  const at = (q: number) => counts[Math.ceil((q * counts.length) / 4) - 1]!;
  return [at(1), at(2), at(3)];
}

const levelFor = (done: number, cuts: Heatmap['cuts']): HeatCell['level'] =>
  done <= 0 ? 0 : done <= cuts[0] ? 1 : done <= cuts[1] ? 2 : done <= cuts[2] ? 3 : 4;

export function heatmap(data: AppData, today: DateKey, weeks = 26, weekStart = 1): Heatmap {
  const first = addDays(startOfWeek(today, weekStart), -(weeks - 1) * 7);
  const last = addDays(first, weeks * 7 - 1);
  const counts = dailyCounts(data, first, last);
  const cuts = heatmapCuts(counts.filter((c) => c.date <= today).map((c) => c.done));

  const columns: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(
      counts.slice(w * 7, w * 7 + 7).map((c) => {
        const future = c.date > today;
        return { ...c, future, level: future ? 0 : levelFor(c.done, cuts) };
      }),
    );
  }

  const months: Heatmap['months'] = [];
  columns.forEach((column, col) => {
    // A label goes over the column holding the 1st of a month, and over the first column.
    const first = column.find((c) => c.date.endsWith('-01')) ?? (col === 0 ? column[0] : undefined);
    if (first) months.push({ col, month: Number(first.date.slice(5, 7)) - 1 });
  });
  // A first label squeezed against the second would overlap it.
  if (months.length > 1 && months[1]!.col - months[0]!.col < 3) months.shift();

  return { weeks: columns, months, cuts };
}

/** Calendar days without a page directly before `key`, back to the previous page (0 if none). */
export function skippedBefore(data: AppData, key: DateKey): number {
  const earlier = Object.keys(data.days).filter((k) => k < key);
  if (earlier.length === 0) return 0;
  const previous = earlier.reduce((a, b) => (a > b ? a : b));
  return daysBetween(previous, key) - 1;
}
