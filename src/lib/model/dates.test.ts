import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  compareKeys,
  daysBetween,
  formatHeading,
  formatRelative,
  formatTime,
  isPast,
  isValidKey,
  parseKey,
  todayKey,
} from './dates';

describe('test environment', () => {
  it('runs in a fixed time zone with daylight saving', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });
});

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

describe('isValidKey', () => {
  it.each(['2026-01-01', '2024-02-29', '2026-12-31'])('accepts %s', (key) => {
    expect(isValidKey(key)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-1',
    '26-01-01',
    '2026-01-01T00:00',
    ' 2026-01-01',
    '',
  ])('rejects %j', (key) => {
    expect(isValidKey(key)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidKey(20260101)).toBe(false);
    expect(isValidKey(null)).toBe(false);
  });
});

describe('parseKey', () => {
  it('returns local midnight', () => {
    const date = parseKey('2026-10-25');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 25]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });

  it('throws on an invalid key', () => {
    expect(() => parseKey('2026-02-30')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-12-31', 0)).toBe('2024-12-31');
  });

  it('steps one day through the spring-forward change', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('steps one day through the fall-back change', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('rejects fractional days and invalid keys', () => {
    expect(() => addDays('2026-01-01', 0.5)).toThrow(RangeError);
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });
});

describe('compareKeys', () => {
  it('orders keys', () => {
    expect(compareKeys('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareKeys('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareKeys('2026-01-01', '2026-01-01')).toBe(0);
    expect(compareKeys('2025-12-31', '2026-01-01')).toBe(-1);
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('counts across a leap day and a year', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('counts whole days over the 23-hour and 25-hour days', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('throws on an invalid key', () => {
    expect(() => daysBetween('2026-01-01', 'bad')).toThrow(RangeError);
    expect(() => daysBetween('bad', '2026-01-01')).toThrow(RangeError);
  });
});

describe('isPast', () => {
  it('is true only for earlier days', () => {
    expect(isPast('2026-10-24', '2026-10-25')).toBe(true);
    expect(isPast('2026-10-25', '2026-10-25')).toBe(false);
    expect(isPast('2026-10-26', '2026-10-25')).toBe(false);
  });
});

describe('formatHeading', () => {
  it('formats weekday, month and day', () => {
    expect(formatHeading('2026-10-25', 'en-US')).toBe('Sunday, October 25');
    expect(formatHeading('2024-02-29', 'en-US')).toBe('Thursday, February 29');
  });

  it('defaults to the runtime locale', () => {
    expect(formatHeading('2026-10-25')).toContain('25');
  });
});

describe('formatTime', () => {
  it('shows the local time, not UTC', () => {
    // 18:32 UTC is 14:32 in New York during daylight saving time.
    expect(formatTime('2026-10-25T18:32:00.000Z', 'en-GB')).toBe('14:32');
    expect(formatTime('2026-10-25T18:32:00.000Z', 'en-US')).toMatch(/2:32\sPM/);
  });

  it('defaults to the runtime locale', () => {
    expect(formatTime('2026-10-25T18:32:00.000Z')).toContain('32');
  });
});

describe('formatRelative', () => {
  const today = '2026-10-25';

  it('names today, yesterday and tomorrow', () => {
    expect(formatRelative('2026-10-25', today)).toBe('Today');
    expect(formatRelative('2026-10-24', today)).toBe('Yesterday');
    expect(formatRelative('2026-10-26', today)).toBe('Tomorrow');
  });

  it('counts days, then weeks, months and years', () => {
    expect(formatRelative('2026-10-22', today)).toBe('3 days ago');
    expect(formatRelative('2026-10-12', today)).toBe('13 days ago');
    expect(formatRelative('2026-10-11', today)).toBe('2 weeks ago');
    expect(formatRelative('2026-09-27', today)).toBe('4 weeks ago');
    expect(formatRelative('2026-08-25', today)).toBe('2 months ago');
    expect(formatRelative('2025-10-25', today)).toBe('1 year ago');
    expect(formatRelative('2023-10-25', today)).toBe('3 years ago');
  });

  it('copes with a date in the future', () => {
    expect(formatRelative('2026-10-30', today)).toBe('In 5 days');
  });

  it('uses calendar days across a month and a leap day', () => {
    expect(formatRelative('2026-09-30', '2026-10-02')).toBe('2 days ago');
    expect(formatRelative('2024-02-28', '2024-03-01')).toBe('2 days ago');
  });
});
