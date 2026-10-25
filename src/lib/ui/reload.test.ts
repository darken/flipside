import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, UPDATE_FALLBACK_MS } from './reload';

describe('applyUpdate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the waiting worker to take over, and reloads when it has', () => {
    const skip = vi.fn();
    const reload = vi.fn();
    let change = () => {};
    const host = { addEventListener: (_: string, fn: () => void) => void (change = fn) };
    applyUpdate(skip, host as never, reload);
    expect(skip).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    change();
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS);
    expect(reload).toHaveBeenCalledTimes(1); // the fallback does not reload twice
  });

  it('reloads after a short wait when the browser never says', () => {
    const reload = vi.fn();
    applyUpdate(vi.fn(), { addEventListener: () => {} } as never, reload);
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('works without service worker support', () => {
    const reload = vi.fn();
    applyUpdate(vi.fn(), undefined, reload);
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
