import { describe, expect, it } from 'vitest';
import { addDays } from '$lib/model/dates';
import type { AppData, Routine, Task } from '$lib/model/types';
import { emptyData } from '$lib/model/types';
import {
  dailyCounts,
  heatmap,
  heatmapCuts,
  lastDays,
  rangeLength,
  routineStats,
  skippedBefore,
  streaks,
  summary,
  weekdayAverages,
} from './compute';

const TODAY = '2026-10-25'; // a Sunday
const ago = (n: number) => addDays(TODAY, -n);

let id = 0;
const mk = (date: string, done: boolean, extra: Partial<Task> = {}): Task => ({
  id: `t${++id}`,
  text: 'x',
  createdAt: `${date}T08:00:00.000Z`,
  order: id,
  ...(done && { doneAt: `${date}T10:00:00.000Z` }),
  ...extra,
});

/** `spec` maps a date to [done, open] counts. */
function build(spec: Record<string, [number, number]>, routines: Routine[] = []): AppData {
  const data = emptyData();
  data.routines = routines;
  for (const [date, [done, open]] of Object.entries(spec)) {
    data.days[date] = {
      date,
      tasks: [
        ...Array.from({ length: done }, () => mk(date, true)),
        ...Array.from({ length: open }, () => mk(date, false)),
      ],
    };
  }
  return data;
}

describe('dailyCounts', () => {
  it('has one entry for every calendar day, including ones without a page', () => {
    const data = build({ [ago(2)]: [2, 1], [ago(0)]: [1, 0] });
    expect(dailyCounts(data, ago(2), ago(0))).toEqual([
      { date: ago(2), done: 2, total: 3, hasPage: true },
      { date: ago(1), done: 0, total: 0, hasPage: false },
      { date: ago(0), done: 1, total: 1, hasPage: true },
    ]);
  });

  it('is empty for a backwards range and one day for a single date', () => {
    expect(dailyCounts(emptyData(), ago(0), ago(1))).toEqual([]);
    expect(dailyCounts(emptyData(), ago(0), ago(0))).toHaveLength(1);
  });

  it('counts a daylight-saving week day by day (clocks go back 2026-11-01)', () => {
    const counts = dailyCounts(emptyData(), '2026-10-28', '2026-11-04');
    expect(counts.map((c) => c.date)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
  });

  it('crosses month and year boundaries', () => {
    const keys = dailyCounts(emptyData(), '2025-12-30', '2026-01-02').map((c) => c.date);
    expect(keys).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
});

describe('lastDays', () => {
  it('ends today and is that many days long', () => {
    expect(lastDays(7, TODAY)).toEqual({ from: ago(6), to: TODAY });
    expect(rangeLength(lastDays(30, TODAY))).toBe(30);
  });
});

describe('streaks', () => {
  it('counts back from today when today has something done', () => {
    const data = build({ [ago(2)]: [1, 0], [ago(1)]: [2, 0], [ago(0)]: [1, 3] });
    expect(streaks(data, TODAY)).toEqual({ current: 3, longest: 3, longestEnd: TODAY });
  });

  it('is not broken by a day still in progress: it ends yesterday', () => {
    const data = build({ [ago(2)]: [1, 0], [ago(1)]: [2, 0], [ago(0)]: [0, 4] });
    expect(streaks(data, TODAY).current).toBe(2);
    expect(streaks(build({ [ago(2)]: [1, 0], [ago(1)]: [2, 0] }), TODAY).current).toBe(2);
  });

  it('is broken by a missed day', () => {
    const data = build({ [ago(3)]: [1, 0], [ago(1)]: [1, 0], [ago(0)]: [1, 0] });
    const result = streaks(data, TODAY);
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  it('is broken by a day with a page but nothing done', () => {
    const data = build({ [ago(3)]: [1, 0], [ago(2)]: [0, 2], [ago(1)]: [1, 0] });
    expect(streaks(data, TODAY)).toEqual({ current: 1, longest: 1, longestEnd: ago(1) });
  });

  it('is zero when the last day with something done was two days ago', () => {
    expect(streaks(build({ [ago(2)]: [1, 0] }), TODAY).current).toBe(0);
  });

  it('reports the longest streak and when it ended, preferring the most recent tie', () => {
    const data = build({
      [ago(20)]: [1, 0],
      [ago(19)]: [1, 0],
      [ago(18)]: [1, 0],
      [ago(10)]: [1, 0],
      [ago(9)]: [1, 0],
      [ago(8)]: [1, 0],
      [ago(0)]: [1, 0],
    });
    expect(streaks(data, TODAY)).toEqual({ current: 1, longest: 3, longestEnd: ago(8) });
  });

  it('is all zero with no data', () => {
    expect(streaks(emptyData(), TODAY)).toEqual({ current: 0, longest: 0, longestEnd: null });
  });

  it('continues across a month and a year boundary', () => {
    const data = build({ '2025-12-31': [1, 0], '2026-01-01': [1, 0], '2026-01-02': [1, 0] });
    expect(streaks(data, '2026-01-02').current).toBe(3);
  });
});

describe('summary', () => {
  const data = build({
    [ago(40)]: [4, 0],
    [ago(35)]: [4, 0],
    [ago(5)]: [6, 2],
    [ago(3)]: [2, 0],
    [ago(0)]: [1, 3], // part-way through the day
  });

  it('totals the range, counting today as it stands', () => {
    const s = summary(data, lastDays(30, TODAY), TODAY);
    expect(s.done).toBe(9);
    expect(s.activeDays).toBe(3);
    expect(s.average).toBe(3);
    expect(s.completionRate).toBeCloseTo(9 / 14);
    expect(s.bestDay).toEqual({ date: ago(5), done: 6 });
  });

  it('compares with the previous period of the same length', () => {
    const s = summary(data, lastDays(30, TODAY), TODAY);
    expect(s.previousDone).toBe(8);
    expect(s.change).toBeCloseTo(0.125);
  });

  it('has no change when the previous period has no data', () => {
    const s = summary(data, lastDays(7, TODAY), TODAY);
    expect(s.previousDone).toBe(0);
    expect(s.change).toBeNull();
  });

  it('is all zero with no data', () => {
    expect(summary(emptyData(), lastDays(30, TODAY), TODAY)).toEqual({
      done: 0,
      activeDays: 0,
      average: 0,
      completionRate: 0,
      bestDay: null,
      previousDone: 0,
      change: null,
    });
  });

  it('does not look past today', () => {
    const s = summary(data, { from: ago(30), to: addDays(TODAY, 10) }, TODAY);
    expect(s.done).toBe(9);
  });
});

describe('routineStats', () => {
  const routine = (id: string, text: string, active = true): Routine => ({
    id,
    text,
    active,
    createdAt: '2026-09-01T00:00:00.000Z',
  });

  function withRoutines() {
    const data = build({}, [routine('r1', 'Stretch'), routine('r2', 'Old habit', false)]);
    const put = (n: number, tasks: Task[]) => {
      data.days[ago(n)] = { date: ago(n), tasks };
    };
    put(5, [mk(ago(5), true, { routineId: 'r1', text: 'Stretch (old name)' })]);
    put(4, [mk(ago(4), false, { routineId: 'r1' })]);
    // Day 3 has no page. Day 2: a page, but the routine was not added.
    put(2, [mk(ago(2), true)]);
    put(1, [mk(ago(1), true, { routineId: 'r1' }), mk(ago(1), true, { routineId: 'r2' })]);
    put(0, [mk(ago(0), false, { routineId: 'r1' })]);
    put(60, [mk(ago(60), true, { routineId: 'r2' })]);
    return data;
  }

  it('keeps one routine across a rename and computes done / instances', () => {
    const stats = routineStats(withRoutines(), lastDays(30, TODAY));
    const r1 = stats.find((s) => s.id === 'r1')!;
    expect(r1.text).toBe('Stretch');
    expect([r1.done, r1.instances]).toEqual([2, 4]);
    expect(r1.rate).toBe(0.5);
    expect(r1.active).toBe(true);
  });

  it('builds a 14-day strip of done, missed and none, ending at the range end', () => {
    const r1 = routineStats(withRoutines(), lastDays(30, TODAY)).find((s) => s.id === 'r1')!;
    expect(r1.strip).toHaveLength(14);
    expect(r1.strip.at(-1)).toEqual({ date: TODAY, state: 'missed' });
    const states = Object.fromEntries(r1.strip.map((x) => [x.date, x.state]));
    expect(states[ago(5)]).toBe('done');
    expect(states[ago(4)]).toBe('missed');
    expect(states[ago(3)]).toBe('none'); // no page
    expect(states[ago(2)]).toBe('none'); // page, but the routine was not added
    expect(states[ago(1)]).toBe('done');
    expect(r1.strip[0]!.date).toBe(ago(13));
  });

  it('keeps a stopped routine that had instances in range, and drops one that had none', () => {
    const data = withRoutines();
    const stopped = routineStats(data, lastDays(30, TODAY)).find((s) => s.id === 'r2')!;
    expect(stopped.active).toBe(false);
    expect([stopped.done, stopped.instances]).toEqual([1, 1]);
    const narrow = routineStats(data, { from: ago(0), to: TODAY });
    expect(narrow.map((s) => s.id)).toEqual(['r1']);
  });

  it('shows an active routine with no instances as having no rate', () => {
    const data = build({}, [routine('r9', 'New')]);
    const [only] = routineStats(data, lastDays(30, TODAY));
    expect(only!.rate).toBeNull();
    expect(only!.strip.every((x) => x.state === 'none')).toBe(true);
  });
});

describe('weekdayAverages', () => {
  // Mondays are 2026-10-19 and 2026-10-12; Sunday is 2026-10-25.
  const data = build({
    '2026-10-12': [4, 0],
    '2026-10-19': [2, 0],
    '2026-10-20': [3, 0], // Tuesday
    '2026-10-25': [5, 1], // Sunday
  });
  const range = { from: '2026-10-12', to: TODAY };

  it('averages over the days that have a page, in week-start order (Monday)', () => {
    const result = weekdayAverages(data, range, 1);
    expect(result.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(result[0]).toEqual({ weekday: 1, average: 3, days: 2 });
    expect(result[1]).toEqual({ weekday: 2, average: 3, days: 1 });
    expect(result[2]).toEqual({ weekday: 3, average: 0, days: 0 });
    expect(result[6]).toEqual({ weekday: 0, average: 5, days: 1 });
  });

  it('starts from Sunday for a Sunday week start', () => {
    const result = weekdayAverages(data, range, 0);
    expect(result.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result[0]!.average).toBe(5);
  });
});

describe('heatmapCuts', () => {
  it('uses fixed thresholds below 8 days with something done', () => {
    expect(heatmapCuts([])).toEqual([1, 3, 5]);
    expect(heatmapCuts([1, 2, 3, 4, 5, 6, 7, 0, 0, 0])).toEqual([1, 3, 5]);
  });

  it('splits 8 or more active days into quarters', () => {
    expect(heatmapCuts([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2, 4, 6]);
    expect(heatmapCuts([8, 7, 6, 5, 4, 3, 2, 1, 0])).toEqual([2, 4, 6]);
    expect(heatmapCuts([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])).toEqual([30, 60, 90]);
  });
});

describe('heatmap', () => {
  const spec: Record<string, [number, number]> = {};
  // 10 days with 1…10 done, then nothing on the days between.
  for (let i = 0; i < 10; i++) spec[ago(i * 2)] = [10 - i, 0];
  const data = build(spec);

  it('has weeks as columns of 7 days, ending in the week of today', () => {
    const map = heatmap(data, TODAY, 26, 1);
    expect(map.weeks).toHaveLength(26);
    expect(map.weeks.every((w) => w.length === 7)).toBe(true);
    const lastWeek = map.weeks.at(-1)!;
    // Monday start: today (Sunday) is the last row.
    expect(lastWeek[6]!.date).toBe(TODAY);
    expect(lastWeek[0]!.date).toBe('2026-10-19');
    expect(map.weeks[0]![0]!.date).toBe(addDays('2026-10-19', -25 * 7));
  });

  it('starts rows from Sunday for a Sunday week start and marks days after today', () => {
    const map = heatmap(data, TODAY, 4, 0);
    const lastWeek = map.weeks.at(-1)!;
    expect(lastWeek[0]!.date).toBe(TODAY);
    expect(lastWeek[0]!.future).toBe(false);
    expect(lastWeek[1]!.future).toBe(true);
    expect(lastWeek[1]!.level).toBe(0);
  });

  it('gives level 0 for nothing done and quarter levels for the rest', () => {
    const map = heatmap(data, TODAY, 4, 1);
    expect(map.cuts).toEqual([3, 5, 8]);
    const level = (date: string) => map.weeks.flat().find((c) => c.date === date)!.level;
    expect(level(ago(1))).toBe(0); // no page
    expect(level(ago(0))).toBe(4); // 10 done
    expect(level(ago(18))).toBe(1); // 1 done
    expect(level(ago(8))).toBe(3); // 6 done: above 5, up to 8
  });

  it('uses the fixed thresholds when there are fewer than 8 active days', () => {
    const few = build({ [ago(0)]: [1, 0], [ago(1)]: [3, 0], [ago(2)]: [5, 0], [ago(3)]: [9, 0] });
    const map = heatmap(few, TODAY, 2, 1);
    expect(map.cuts).toEqual([1, 3, 5]);
    const levels = map.weeks
      .flat()
      .filter((c) => c.done > 0)
      .map((c) => [c.done, c.level]);
    expect(levels).toEqual(
      expect.arrayContaining([
        [1, 1],
        [3, 2],
        [5, 3],
        [9, 4],
      ]),
    );
  });

  it('puts month labels over the columns that hold the 1st', () => {
    const map = heatmap(emptyData(), TODAY, 26, 1);
    const months = map.months.map((m) => m.month);
    expect(months.at(-1)).toBe(9); // October
    expect(new Set(months).size).toBe(months.length);
    for (let i = 1; i < map.months.length; i++) {
      expect(map.months[i]!.col - map.months[i - 1]!.col).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('skippedBefore', () => {
  it('counts the days without a page right before a date, back to the previous page', () => {
    const data = build({ [ago(5)]: [1, 0], [ago(1)]: [1, 0], [ago(0)]: [1, 0] });
    expect(skippedBefore(data, ago(1))).toBe(3);
    expect(skippedBefore(data, ago(0))).toBe(0);
  });

  it('is 0 for the oldest page', () => {
    const data = build({ [ago(5)]: [1, 0] });
    expect(skippedBefore(data, ago(5))).toBe(0);
  });
});
