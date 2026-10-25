import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayKey } from './dates';

describe('todayKey', () => {
  afterEach(() => vi.useRealTimers());

  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(todayKey(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('uses the local date late in the evening, not the UTC date', () => {
    expect(todayKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('uses the local date just after midnight', () => {
    expect(todayKey(new Date(2026, 2, 1, 0, 0, 1))).toBe('2026-03-01');
  });

  it('defaults to the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    expect(todayKey()).toBe('2026-06-15');
  });
});
