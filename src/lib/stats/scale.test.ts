import { describe, expect, it } from 'vitest';
import { niceTicks } from './scale';

describe('niceTicks', () => {
  it.each([
    [0, [0, 1]],
    [-3, [0, 1]],
    [Number.NaN, [0, 1]],
    [1, [0, 1]],
    [2, [0, 1, 2]],
    [3, [0, 1, 2, 3]],
    [4, [0, 2, 4]],
    [6, [0, 2, 4, 6]],
    [7, [0, 5, 10]],
    [11, [0, 5, 10, 15]],
    [15, [0, 5, 10, 15]],
    [29, [0, 10, 20, 30]],
    [142, [0, 50, 100, 150]],
  ])('%s → %j', (max, expected) => {
    expect(niceTicks(max)).toEqual(expected);
  });

  it('always starts at 0, covers the maximum and uses whole numbers', () => {
    for (let max = 1; max <= 500; max++) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});
