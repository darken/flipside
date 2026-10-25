import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalHandlers, reportError, resetCrashThrottle } from './crash';
import { toasts } from './toast.svelte';

describe('crash reporting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetCrashThrottle();
    toasts.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    toasts.clear();
  });

  it('logs the error and shows one toast with a Reload action', () => {
    reportError(new Error('boom'), 1000);
    expect(console.error).toHaveBeenCalled();
    expect(toasts.items).toHaveLength(1);
    expect(toasts.items[0]?.message).toBe('Something went wrong');
    expect(toasts.items[0]?.action?.label).toBe('Reload');
  });

  it('shows a single toast for a burst of errors, but logs them all', () => {
    reportError('a', 1000);
    reportError('b', 2000);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(toasts.items).toHaveLength(1);
    reportError('c', 20_000);
    expect(toasts.items).toHaveLength(2);
  });

  it('catches uncaught errors and unhandled rejections', () => {
    const target = new EventTarget();
    const stop = installGlobalHandlers(target as Window);
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }));
    expect(toasts.items).toHaveLength(1);
    stop();
    resetCrashThrottle();
    toasts.clear();
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('y'), message: 'y' }));
    expect(toasts.items).toHaveLength(0);
  });
});
