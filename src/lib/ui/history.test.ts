import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerHistory, type HistoryHost } from './history';

/** A tiny fake of the browser's session history: entries, state and popstate. */
function fakeHost(initialState: unknown = null) {
  const entries: unknown[] = [initialState];
  let index = 0;
  const listeners = new Set<() => void>();
  const host: HistoryHost & { entries: unknown[]; index: () => number; goBack: () => void } = {
    history: {
      get state() {
        return entries[index];
      },
      pushState: vi.fn((state: unknown) => {
        entries.splice(index + 1);
        entries.push(state);
        index++;
      }),
      replaceState: vi.fn((state: unknown) => {
        entries[index] = state;
      }),
      back: vi.fn(() => {
        if (index > 0) {
          index--;
          listeners.forEach((l) => l()); // popstate (async in a real browser)
        }
      }),
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    entries,
    index: () => index,
    // The user pressing the browser's Back button.
    goBack: () => host.history.back(),
  };
  return host;
}

describe('LayerHistory', () => {
  let host: ReturnType<typeof fakeHost>;
  let layers: LayerHistory;
  let stop: () => void;

  beforeEach(() => {
    host = fakeHost();
    layers = new LayerHistory(host);
    stop = layers.init();
  });

  it('adds exactly one history entry when a layer opens, however often it is opened', () => {
    const onBack = vi.fn();
    layers.open('past', onBack);
    layers.open('past', onBack);
    layers.open('past', onBack);
    expect(host.history.pushState).toHaveBeenCalledTimes(1);
    expect(host.index()).toBe(1);
    expect(layers.depth).toBe(1);
  });

  it('closes the top layer when Back is pressed, without another history step', () => {
    const onBack = vi.fn();
    layers.open('past', onBack);
    host.goBack();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(layers.has('past')).toBe(false);
    expect(host.history.back).toHaveBeenCalledTimes(1);
    expect(host.index()).toBe(0);
  });

  it('removes the entry when the app closes the layer itself, without running onBack', () => {
    const onBack = vi.fn();
    layers.open('past', onBack);
    layers.close('past');
    expect(onBack).not.toHaveBeenCalled();
    expect(host.history.back).toHaveBeenCalledTimes(1);
    expect(host.index()).toBe(0);
    // The popstate from our own back() is swallowed: a later layer is unaffected.
    const next = vi.fn();
    layers.open('stats', next);
    host.goBack();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does nothing when closing a layer that is not open', () => {
    layers.close('nope');
    expect(host.history.back).not.toHaveBeenCalled();
  });

  it('stacks layers: Back closes the top one first', () => {
    const past = vi.fn();
    const stats = vi.fn();
    layers.open('past', past);
    layers.open('stats', stats);
    expect(layers.depth).toBe(2);
    host.goBack();
    expect(stats).toHaveBeenCalledTimes(1);
    expect(past).not.toHaveBeenCalled();
    host.goBack();
    expect(past).toHaveBeenCalledTimes(1);
    expect(layers.depth).toBe(0);
  });

  it('keeps the page where it is when a layer below the top closes', () => {
    layers.open('past', vi.fn());
    layers.open('stats', vi.fn());
    layers.close('past');
    expect(host.history.back).not.toHaveBeenCalled();
    expect(layers.has('stats')).toBe(true);
  });

  it('replaces the callback when an open layer is opened again', () => {
    const first = vi.fn();
    const second = vi.fn();
    layers.open('past', first);
    layers.open('past', second);
    host.goBack();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets Back leave the app when no layer is open (nothing to close)', () => {
    host.goBack(); // already at the first entry: the browser would leave the app
    expect(host.index()).toBe(0);
    expect(layers.depth).toBe(0);
  });

  it('stops listening after cleanup', () => {
    const onBack = vi.fn();
    layers.open('past', onBack);
    stop();
    host.goBack();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('LayerHistory after a reload', () => {
  it('clears a leftover entry from the previous visit', () => {
    const host = fakeHost({ flipside: 'past' });
    const layers = new LayerHistory(host);
    layers.init();
    expect(host.history.replaceState).toHaveBeenCalledWith(null, '');
    expect(host.history.state).toBeNull();
    expect(layers.depth).toBe(0);
  });

  it('leaves unrelated history state alone', () => {
    const host = fakeHost({ somethingElse: true });
    new LayerHistory(host).init();
    expect(host.history.replaceState).not.toHaveBeenCalled();
  });

  it('works against the real window.history', () => {
    const layers = new LayerHistory();
    const stop = layers.init();
    layers.open('past', () => {});
    expect(window.history.state).toEqual({ flipside: 'past' });
    stop();
  });

  it('resolves close() once the browser has gone back', async () => {
    const host = fakeHost();
    const layers = new LayerHistory(host);
    layers.init();
    layers.open('stats', vi.fn());
    await expect(layers.close('stats')).resolves.toBeUndefined();
    await expect(layers.close('stats')).resolves.toBeUndefined(); // already closed
    expect(host.index()).toBe(0);
  });
});
