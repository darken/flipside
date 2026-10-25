import { describe, expect, it } from 'vitest';
import { parseAppData } from '$lib/store/validate';
import { seedData, seedFromLocation } from './seed';

const TODAY = '2026-10-25';

describe('seedData', () => {
  it('is valid app data covering the range, ending today', () => {
    const data = seedData({ days: 365, today: TODAY });
    expect(parseAppData(data).ok).toBe(true);
    expect(data.days[TODAY]).toBeDefined();
    expect(Object.keys(data.days).length).toBeGreaterThan(300);
    expect(Object.keys(data.days).length).toBeLessThan(365);
    expect(Object.keys(data.days).sort()[0]! >= '2025-10-26').toBe(true);
  });

  it('is repeatable', () => {
    expect(seedData({ days: 60, today: TODAY })).toEqual(seedData({ days: 60, today: TODAY }));
  });

  it('has routines, done and open tasks, long text and emoji', () => {
    const tasks = Object.values(seedData({ days: 365, today: TODAY }).days).flatMap((d) => d.tasks);
    expect(tasks.some((t) => t.routineId)).toBe(true);
    expect(tasks.some((t) => t.doneAt)).toBe(true);
    expect(tasks.some((t) => !t.doneAt)).toBe(true);
    expect(tasks.some((t) => t.text.length > 80)).toBe(true);
    expect(tasks.some((t) => /\p{Extended_Pictographic}/u.test(t.text))).toBe(true);
  });

  it('gives three years about ten thousand tasks', () => {
    const data = seedData({ days: 1100, today: TODAY });
    const total = Object.values(data.days).reduce((n, d) => n + d.tasks.length, 0);
    expect(total).toBeGreaterThan(8000);
    expect(total).toBeLessThan(14000);
  });

  it('puts today half done with open tasks', () => {
    const today = seedData({ days: 30, today: TODAY }).days[TODAY]!;
    expect(today.tasks.some((t) => t.doneAt)).toBe(true);
    expect(today.tasks.filter((t) => !t.doneAt).length).toBeGreaterThan(2);
  });
});

describe('seedFromLocation', () => {
  it('writes nothing without ?seed', () => {
    const store: Record<string, string> = {};
    const setItem = (k: string, v: string) => void (store[k] = v);
    expect(seedFromLocation('?x=1', { setItem }, TODAY)).toBe(false);
    expect(store).toEqual({});
  });

  it('seeds the requested number of days, defaulting to a year', () => {
    const store: Record<string, string> = {};
    const setItem = (k: string, v: string) => void (store[k] = v);
    expect(seedFromLocation('?seed=30', { setItem }, TODAY)).toBe(true);
    expect(Object.keys(JSON.parse(store['flipside:v1']!).days).length).toBeLessThanOrEqual(30);
    seedFromLocation('?seed', { setItem }, TODAY);
    expect(Object.keys(JSON.parse(store['flipside:v1']!).days).length).toBeGreaterThan(300);
  });
});
