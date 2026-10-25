import { describe, expect, it } from 'vitest';
import { makeBackup, readBackup } from '$lib/store/backup';
import { load, save, STORAGE_KEY } from '$lib/store/persist';
import { parseAppData } from '$lib/store/validate';
import {
  dailyCounts,
  heatmap,
  lastDays,
  routineStats,
  streaks,
  summary,
  weekdayAverages,
} from '$lib/stats/compute';
import { MemoryStorage } from '../../../tests/memory-storage';
import { seedData } from './seed';

const TODAY = '2026-10-25';
const data = seedData({ days: 1100, today: TODAY });
const tasks = Object.values(data.days).reduce((n, d) => n + d.tasks.length, 0);

/** Median of a few runs, in ms. */
function time(run: () => void, runs = 7): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

// Three years of use (about 10,000 tasks) must feel instant. The target is 50 ms on a desktop; the
// limits here are three times that, so a slow CI machine does not fail the build, but a real
// slowdown (something quadratic) does.
const LIMIT_MS = 150;

describe(`three years of data (${tasks} tasks)`, () => {
  const storage = new MemoryStorage();
  const json = JSON.stringify(data);

  it('is about ten thousand tasks', () => {
    expect(tasks).toBeGreaterThan(8000);
  });

  it('starts: reading and validating the saved data', () => {
    storage.setItem(STORAGE_KEY, json);
    const ms = time(() => expect(load(storage).status).toBe('ok'));
    console.info(`load ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('saves: serialising and writing', () => {
    const ms = time(() => save(data, storage));
    console.info(`save ${ms.toFixed(1)} ms (${(json.length / 1024).toFixed(0)} KB)`);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('opens Stats: every figure and the heatmap', () => {
    const ms = time(() => {
      const range = lastDays(90, TODAY);
      dailyCounts(data, range.from, range.to);
      summary(data, range, TODAY);
      streaks(data, TODAY);
      routineStats(data, range);
      weekdayAverages(data, range, 1);
      heatmap(data, TODAY, 53, 1);
    });
    console.info(`stats ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('imports: reading, migrating and validating a backup file', () => {
    const file = JSON.stringify(makeBackup(data, { version: 1, theme: 'system', autoFlip: true }));
    const ms = time(() => expect(readBackup(file).ok).toBe(true));
    console.info(`import ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(LIMIT_MS);
    expect(parseAppData(data).ok).toBe(true);
  });
});
