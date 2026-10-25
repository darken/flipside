import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastQueue } from './toast.svelte';

describe('ToastQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast for about 5 seconds', () => {
    const q = new ToastQueue();
    q.show('Hello');
    expect(q.items.map((t) => t.message)).toEqual(['Hello']);
    vi.advanceTimersByTime(4999);
    expect(q.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(q.items).toHaveLength(0);
  });

  it('honours a custom duration and keeps several toasts apart', () => {
    const q = new ToastQueue();
    q.show('short', { duration: 1000 });
    q.show('long');
    vi.advanceTimersByTime(1000);
    expect(q.items.map((t) => t.message)).toEqual(['long']);
  });

  it('runs the action once and closes the toast', () => {
    const q = new ToastQueue();
    const run = vi.fn();
    const id = q.show('Task deleted', { action: { label: 'Undo', run } });
    q.act(id);
    q.act(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(q.items).toHaveLength(0);
  });

  it('acting on a toast without an action just closes it', () => {
    const q = new ToastQueue();
    const id = q.show('Plain');
    q.act(id);
    expect(q.items).toHaveLength(0);
  });

  it('clear removes everything and stops the timers', () => {
    const q = new ToastQueue();
    q.show('a');
    q.show('b');
    q.clear();
    expect(q.items).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(q.items).toHaveLength(0);
  });
});
