import { describe, expect, it } from 'vitest';
import { ReadOnlyDayError, assertCanCheck, assertEditable } from './guard';

describe('assertEditable', () => {
  it('throws for any day before today', () => {
    expect(() => assertEditable('2026-10-24', '2026-10-25')).toThrow(ReadOnlyDayError);
    expect(() => assertEditable('2020-01-01', '2026-10-25')).toThrow(/past day/);
  });

  it('carries the date on the error', () => {
    try {
      assertEditable('2026-10-24', '2026-10-25');
    } catch (e) {
      expect((e as ReadOnlyDayError).date).toBe('2026-10-24');
      expect((e as Error).name).toBe('ReadOnlyDayError');
    }
  });

  it('allows today and later', () => {
    expect(() => assertEditable('2026-10-25', '2026-10-25')).not.toThrow();
    expect(() => assertEditable('2026-10-26', '2026-10-25')).not.toThrow();
  });
});

describe('assertCanCheck', () => {
  it('allows today and yesterday, but not older days', () => {
    expect(() => assertCanCheck('2026-10-25', '2026-10-25')).not.toThrow();
    expect(() => assertCanCheck('2026-10-24', '2026-10-25')).not.toThrow();
    expect(() => assertCanCheck('2026-10-23', '2026-10-25')).toThrow(ReadOnlyDayError);
  });
});
