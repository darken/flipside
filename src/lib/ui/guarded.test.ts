import { afterEach, describe, expect, it } from 'vitest';
import { ReadOnlyDayError } from '$lib/store/guard';
import { NEW_DAY_MESSAGE, guarded } from './guarded';
import { toasts } from './toast.svelte';

describe('guarded', () => {
  afterEach(() => toasts.clear());

  it('returns the result of the change', () => {
    expect(guarded(() => 42)).toBe(42);
    expect(toasts.items).toHaveLength(0);
  });

  it('turns a read-only error into a toast', () => {
    const result = guarded(() => {
      throw new ReadOnlyDayError('2026-10-25');
    });
    expect(result).toBeUndefined();
    expect(toasts.items.map((t) => t.message)).toEqual([NEW_DAY_MESSAGE]);
  });

  it('rethrows other errors', () => {
    expect(() =>
      guarded(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});
