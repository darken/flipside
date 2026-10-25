import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../../tests/memory-storage';
import { doneTasks, todoTasks } from '$lib/model/tasks';
import { AppStore } from './app.svelte';
import { ReadOnlyDayError } from './guard';
import { STORAGE_KEY, type StorageLike } from './persist';

let clock: Date;
let storage: MemoryStorage;
let disposers: (() => void)[];

const T1 = '2026-10-25';
const T2 = '2026-10-26';

function open(opts: { storage?: StorageLike | null } = {}) {
  const store = new AppStore({ now: () => new Date(clock), storage: opts.storage ?? storage });
  disposers.push(store.init());
  return store;
}

/** Closes the app (flushing its save) and opens a fresh one on the same storage. */
function reopen(store: AppStore) {
  disposers.pop()!();
  void store;
  return open();
}

const texts = (store: AppStore, key: string) => todoTasks(store.day(key)!).map((t) => t.text);

beforeEach(() => {
  vi.useFakeTimers();
  clock = new Date(2026, 9, 25, 12, 0, 0);
  vi.setSystemTime(clock);
  storage = new MemoryStorage();
  disposers = [];
});

afterEach(() => {
  disposers.forEach((d) => d());
  vi.useRealTimers();
});

describe('opening', () => {
  it('starts with an empty page for today', () => {
    const store = open();
    expect(store.today).toBe(T1);
    expect(store.loadStatus).toBe('empty');
    expect(store.dayKeys).toEqual([T1]);
    expect(store.todayDay).toEqual({ date: T1, tasks: [] });
  });

  it('exposes an empty today before init', () => {
    const store = new AppStore();
    expect(store.todayDay.tasks).toEqual([]);
    expect(store.dayKeys).toEqual([]);
  });

  it('saves the new day without waiting for a change', () => {
    open();
    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).days[T1]).toBeDefined();
  });
});

describe('saving and reloading', () => {
  it('gives back the same data after a reload', () => {
    const store = open();
    store.add(T1, 'buy milk\nand eggs');
    const second = store.add(T1, 'call mum')!;
    store.toggleDone(T1, second.id);
    vi.advanceTimersByTime(300);
    const before = $state.snapshot(store.data);

    const again = reopen(store);
    expect(again.loadStatus).toBe('ok');
    expect($state.snapshot(again.data)).toEqual(before);
    expect(texts(again, T1)).toEqual(['buy milk\nand eggs']);
    expect(doneTasks(again.day(T1)!).map((t) => t.text)).toEqual(['call mum']);
  });

  it('debounces and saves 300 ms after the last change', () => {
    const store = open();
    vi.advanceTimersByTime(300);
    const setItem = vi.spyOn(storage, 'setItem');
    store.add(T1, 'a');
    vi.advanceTimersByTime(200);
    store.add(T1, 'b');
    vi.advanceTimersByTime(299);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('flushes a waiting save when the app is closed', () => {
    const store = open();
    store.add(T1, 'last-second change');
    disposers.pop()!();
    expect(storage.getItem(STORAGE_KEY)).toContain('last-second change');
  });

  it('flushes when the page is hidden', () => {
    const store = open();
    store.add(T1, 'x');
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(STORAGE_KEY)).toContain('"x"');
  });
});

describe('editing today', () => {
  it('adds, edits, moves, checks and removes tasks', () => {
    const store = open();
    const a = store.add(T1, '  first ')!;
    const b = store.add(T1, 'second')!;
    const c = store.add(T1, 'third')!;
    expect(store.add(T1, ' \n ')).toBeNull();

    expect(store.edit(T1, a.id, 'first (edited)')).toBe(true);
    expect(store.edit(T1, a.id, '  ')).toBe(false);
    store.move(T1, c.id, 0);
    expect(texts(store, T1)).toEqual(['third', 'first (edited)', 'second']);

    store.toggleDone(T1, b.id);
    expect(texts(store, T1)).toEqual(['third', 'first (edited)']);
    expect(doneTasks(store.todayDay).map((t) => t.id)).toEqual([b.id]);
    store.toggleDone(T1, b.id);
    expect(texts(store, T1)).toEqual(['third', 'first (edited)', 'second']);

    store.remove(T1, a.id);
    expect(texts(store, T1)).toEqual(['third', 'second']);
  });

  it('does not change data (or save) when nothing changed', () => {
    const store = open();
    vi.advanceTimersByTime(300);
    const setItem = vi.spyOn(storage, 'setItem');
    store.setRoutine(T1, store.add(T1, 'plain')!.id, false);
    vi.advanceTimersByTime(300);
    expect(setItem).toHaveBeenCalledTimes(1); // only for the add
  });
});

describe('remove and restore', () => {
  it('undoes a delete with the same id and position', () => {
    const store = open();
    const a = store.add(T1, 'a')!;
    const b = store.add(T1, 'b')!;
    store.add(T1, 'c');
    const copy = $state.snapshot(b);
    store.remove(T1, b.id);
    expect(texts(store, T1)).toEqual(['a', 'c']);
    store.restore(T1, copy);
    expect(texts(store, T1)).toEqual(['a', 'b', 'c']);
    expect(store.day(T1)!.tasks.map((t) => t.id)).toContain(a.id);
    expect(store.day(T1)!.tasks.find((t) => t.text === 'b')!.id).toBe(b.id);
  });

  it('is rejected on a past day', () => {
    const store = open();
    const t = store.add(T1, 'a')!;
    const copy = $state.snapshot(t);
    store.remove(T1, t.id);
    clock = new Date(2026, 9, 26, 0, 0, 5);
    expect(() => store.restore(T1, copy)).toThrow(ReadOnlyDayError);
    expect(texts(store, T1)).toEqual([]);
  });
});

describe('isRoutine', () => {
  it('is true only while the routine is active', () => {
    const store = open();
    const t = store.add(T1, 'Stretch')!;
    expect(store.isRoutine(t)).toBe(false);
    store.setRoutine(T1, t.id, true);
    const linked = store.day(T1)!.tasks[0]!;
    expect(store.isRoutine(linked)).toBe(true);
    store.setRoutine(T1, t.id, false);
    expect(store.isRoutine(linked)).toBe(false);
  });
});

describe('routines across midnight', () => {
  it('creates the new day with its routine tasks and no carry-over', () => {
    const store = open();
    const stretch = store.add(T1, 'Stretch')!;
    store.setRoutine(T1, stretch.id, true);
    store.add(T1, 'one-off, unfinished');

    clock = new Date(2026, 9, 26, 0, 0, 30);
    vi.advanceTimersByTime(60_000);

    expect(store.today).toBe(T2);
    expect(store.dayKeys).toEqual([T2, T1]);
    expect(texts(store, T2)).toEqual(['Stretch']);
    expect(store.todayDay.tasks[0]!.routineId).toBe(
      stretch.routineId ?? store.data.routines[0]!.id,
    );
    expect(texts(store, T1)).toEqual(['Stretch', 'one-off, unfinished']);
  });

  it('does not backfill days the app was closed for', () => {
    const store = open();
    store.setRoutine(T1, store.add(T1, 'Stretch')!.id, true);
    vi.advanceTimersByTime(300);
    disposers.pop()!();

    clock = new Date(2026, 9, 29, 9, 0, 0);
    const later = open();
    expect(later.dayKeys).toEqual(['2026-10-29', T1]);
    expect(texts(later, '2026-10-29')).toEqual(['Stretch']);
  });

  it('turns the routine off for future days only', () => {
    const store = open();
    const task = store.add(T1, 'Stretch')!;
    store.setRoutine(T1, task.id, true);
    store.setRoutine(T1, task.id, false);
    clock = new Date(2026, 9, 26, 8, 0, 0);
    store.tick();
    expect(store.todayDay.tasks).toEqual([]);
    expect(store.day(T1)!.tasks[0]!.routineId).toBeDefined();
  });

  it('turning the flag back on reuses the routine', () => {
    const store = open();
    const task = store.add(T1, 'Stretch')!;
    store.setRoutine(T1, task.id, true);
    store.setRoutine(T1, task.id, false);
    store.setRoutine(T1, task.id, true);
    expect(store.data.routines).toHaveLength(1);
    expect(store.data.routines[0]!.active).toBe(true);
  });

  it('picks up a date change when the tab becomes visible again', () => {
    const store = open();
    clock = new Date(2026, 9, 26, 7, 0, 0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.today).toBe(T2);
    vi.restoreAllMocks();
  });

  it('ignores the visibility event while hidden', () => {
    const store = open();
    clock = new Date(2026, 9, 26, 7, 0, 0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.today).toBe(T1);
    vi.restoreAllMocks();
  });
});

describe('renaming a routine task', () => {
  it('gives the next day the new text and leaves yesterday alone', () => {
    const store = open();
    const task = store.add(T1, 'Stretch')!;
    store.setRoutine(T1, task.id, true);
    store.edit(T1, task.id, 'Stretch 10 min');
    expect(store.data.routines[0]!.text).toBe('Stretch 10 min');

    clock = new Date(2026, 9, 26, 9, 0, 0);
    store.tick();
    expect(texts(store, T2)).toEqual(['Stretch 10 min']);
    store.edit(T2, store.todayDay.tasks[0]!.id, 'Stretch 15 min');

    expect(texts(store, T1)).toEqual(['Stretch 10 min']);
    expect(store.data.routines[0]!.text).toBe('Stretch 15 min');
  });

  it('does not rename any routine when a plain task is edited', () => {
    const store = open();
    store.setRoutine(T1, store.add(T1, 'Stretch')!.id, true);
    store.edit(T1, store.add(T1, 'plain')!.id, 'plain 2');
    expect(store.data.routines[0]!.text).toBe('Stretch');
  });
});

describe('read-only past days', () => {
  function afterMidnight() {
    const store = open();
    const routine = store.add(T1, 'Stretch')!;
    store.setRoutine(T1, routine.id, true);
    const plain = store.add(T1, 'unfinished one-off')!;
    clock = new Date(2026, 9, 26, 0, 0, 5);
    return { store, routine, plain };
  }

  it('rejects every change to yesterday, even before the minute timer has fired', () => {
    const { store, plain, routine } = afterMidnight();
    const before = JSON.stringify($state.snapshot(store.data.days[T1]));
    const attempts = [
      () => store.add(T1, 'new'),
      () => store.edit(T1, plain.id, 'changed'),
      () => store.remove(T1, plain.id),
      () => store.toggleDone(T1, plain.id),
      () => store.move(T1, plain.id, 0),
      () => store.setRoutine(T1, routine.id, false),
      () => store.setRoutine(T1, plain.id, true),
    ];
    for (const attempt of attempts) expect(attempt).toThrow(ReadOnlyDayError);
    expect(JSON.stringify($state.snapshot(store.data.days[T1]))).toBe(before);
    expect(store.data.routines[0]!.active).toBe(true);
    expect(store.today).toBe(T2);
  });

  it('reports editability by date', () => {
    const { store } = afterMidnight();
    store.tick();
    expect(store.isEditable(T1)).toBe(false);
    expect(store.isEditable(T2)).toBe(true);
    expect(store.isEditable('2026-10-27')).toBe(true);
  });

  it('does not carry unfinished tasks over, but copy to today works', () => {
    const { store, plain } = afterMidnight();
    store.tick();
    expect(texts(store, T2)).toEqual(['Stretch']);

    const copy = store.copyToToday(T1, plain.id);
    expect(copy.text).toBe('unfinished one-off');
    expect(copy.id).not.toBe(plain.id);
    expect(texts(store, T2)).toEqual(['Stretch', 'unfinished one-off']);
    expect(texts(store, T1)).toEqual(['Stretch', 'unfinished one-off']);
  });

  it('lets today be edited normally', () => {
    const { store } = afterMidnight();
    expect(store.add(T2, 'new day task')).not.toBeNull();
  });
});

describe('storage trouble', () => {
  it('backs up corrupt data and starts empty', () => {
    storage.setItem(STORAGE_KEY, '{"version":1,"days":');
    const store = open();
    expect(store.loadStatus).toBe('recovered');
    expect(store.dayKeys).toEqual([T1]);
    expect(storage.getItem(`${STORAGE_KEY}:corrupt-${clock.getTime()}`)).toBe(
      '{"version":1,"days":',
    );
    store.add(T1, 'fresh start');
    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).days[T1].tasks).toHaveLength(1);
  });

  it('keeps working in memory when every write throws', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    const store = open({ storage: failing });
    expect(store.storageOk).toBe(true);
    store.add(T1, 'still here');
    vi.advanceTimersByTime(300);
    expect(store.storageOk).toBe(false);
    expect(texts(store, T1)).toEqual(['still here']);
    store.add(T1, 'and more');
    expect(texts(store, T1)).toEqual(['still here', 'and more']);
  });

  it('keeps working when storage is unavailable altogether', () => {
    const store = new AppStore({ now: () => new Date(clock), storage: null });
    disposers.push(store.init());
    expect(store.loadStatus).toBe('unavailable');
    expect(store.storageOk).toBe(false);
    store.add(T1, 'in memory');
    vi.advanceTimersByTime(300);
    expect(texts(store, T1)).toEqual(['in memory']);
  });

  it('recovers the flag once a write succeeds again', () => {
    let failing = true;
    const flaky = new MemoryStorage();
    const real = flaky.setItem.bind(flaky);
    flaky.setItem = (k, v) => {
      if (failing) throw new Error('full');
      real(k, v);
    };
    const store = open({ storage: flaky });
    vi.advanceTimersByTime(300);
    expect(store.storageOk).toBe(false);
    failing = false;
    store.add(T1, 'x');
    vi.advanceTimersByTime(300);
    expect(store.storageOk).toBe(true);
  });

  it('defaults to localStorage', () => {
    const store = new AppStore({ now: () => new Date(clock) });
    disposers.push(store.init());
    store.add(T1, 'in local storage');
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('in local storage');
  });
});

describe('another tab', () => {
  it('reloads when another tab saved', () => {
    const store = open();
    store.add(T1, 'mine');
    vi.advanceTimersByTime(300);

    const other = open();
    other.add(T1, 'from the other tab');
    other.add(T1, 'second');
    vi.advanceTimersByTime(300);

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(texts(store, T1)).toEqual(['mine', 'from the other tab', 'second']);
  });

  it('does not save over the other tab with its own stale changes', () => {
    const store = open();
    vi.advanceTimersByTime(300);
    store.add(T1, 'unsaved here');
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, days: {}, routines: [] }));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    vi.advanceTimersByTime(300);
    expect(texts(store, T1)).toEqual([]);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).days).toEqual({});
  });

  it('ignores unrelated keys and other storage areas', () => {
    const store = open();
    store.add(T1, 'mine');
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, storageArea: window.sessionStorage }),
    );
    expect(texts(store, T1)).toEqual(['mine']);
  });

  it('reloads when storage is cleared', () => {
    const store = open();
    store.add(T1, 'mine');
    vi.advanceTimersByTime(300);
    storage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(texts(store, T1)).toEqual([]);
  });
});

describe('dispose', () => {
  it('stops the clock and the listeners', () => {
    const store = open();
    disposers.pop()!();
    clock = new Date(2026, 9, 26, 12);
    vi.advanceTimersByTime(120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.today).toBe(T1);
  });
});

describe('replaceAll', () => {
  const imported = (date: string) =>
    ({
      version: 1,
      routines: [
        { id: 'r1', text: 'Stretch', active: true, createdAt: '2026-09-01T00:00:00.000Z' },
      ],
      days: {
        [date]: {
          date,
          tasks: [{ id: 'old', text: 'old task', createdAt: `${date}T08:00:00.000Z`, order: 0 }],
        },
      },
    }) as const;

  it('replaces everything, past days included, and saves straight away', () => {
    const store = open();
    store.add(T1, 'mine');
    store.replaceAll(structuredClone(imported('2026-09-01')) as never);
    expect(Object.keys(store.data.days).sort()).toEqual(['2026-09-01', T1]);
    // No debounce: the new data is already in storage.
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(Object.keys(saved.days).sort()).toEqual(['2026-09-01', T1]);
  });

  it('cancels a pending save, so the old data is not written over the import', () => {
    const store = open();
    store.add(T1, 'unsaved');
    store.replaceAll(structuredClone(imported('2026-09-01')) as never);
    vi.advanceTimersByTime(1000);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(JSON.stringify(saved)).not.toContain('unsaved');
  });

  it("gives today's page its routine tasks", () => {
    const store = open();
    store.replaceAll(structuredClone(imported('2026-09-01')) as never);
    expect(texts(store, T1)).toEqual(['Stretch']);
    expect(store.data.days[T1]!.tasks[0]!.routineId).toBe('r1');
  });

  it('bumps the epoch so the notepad goes back to today', () => {
    const store = open();
    const before = store.epoch;
    store.replaceAll(structuredClone(imported('2026-09-01')) as never);
    expect(store.epoch).toBe(before + 1);
  });

  it('keeps the previous data in a safety copy, and only the latest one', () => {
    const store = open();
    store.add(T1, 'first');
    const key1 = store.replaceAll(structuredClone(imported('2026-09-01')) as never)!;
    expect(key1).toMatch(/^flipside:v1:before-import-\d+$/);
    expect(storage.getItem(key1)).toContain('first');

    clock = new Date(2026, 9, 25, 12, 5, 0);
    vi.setSystemTime(clock);
    const key2 = store.replaceAll(structuredClone(imported('2026-08-01')) as never)!;
    expect(key2).not.toBe(key1);
    expect(storage.getItem(key1)).toBeNull();
    expect(storage.getItem(key2)).toContain('old task');
  });

  it('undo puts the safety copy back and removes it', () => {
    const store = open();
    store.add(T1, 'precious');
    const key = store.replaceAll(structuredClone(imported('2026-09-01')) as never)!;
    expect(texts(store, T1)).not.toContain('precious');
    expect(store.restoreSafetyCopy(key)).toBe(true);
    expect(texts(store, T1)).toContain('precious');
    expect(storage.getItem(key)).toBeNull();
    expect(JSON.stringify(JSON.parse(storage.getItem(STORAGE_KEY)!))).toContain('precious');
  });

  it('undo reports failure when the safety copy is gone or unreadable', () => {
    const store = open();
    expect(store.restoreSafetyCopy('flipside:v1:before-import-1')).toBe(false);
    storage.setItem('flipside:v1:before-import-2', '{broken');
    expect(store.restoreSafetyCopy('flipside:v1:before-import-2')).toBe(false);
  });

  it('still replaces when the safety copy cannot be written', () => {
    const store = open();
    const realSet = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key.includes('before-import')) throw new Error('full');
      realSet(key, value);
    };
    expect(store.replaceAll(structuredClone(imported('2026-09-01')) as never)).toBeNull();
    expect(store.data.days['2026-09-01']).toBeDefined();
  });

  it('works without storage and reports that nothing is saved', () => {
    const store = new AppStore({ now: () => new Date(clock), storage: null });
    disposers.push(store.init());
    expect(store.replaceAll(structuredClone(imported('2026-09-01')) as never)).toBeNull();
    expect(store.storageOk).toBe(false);
  });

  it('is picked up by another tab through the storage event', () => {
    const a = open();
    const b = open();
    a.replaceAll(structuredClone(imported('2026-09-01')) as never);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(b.data.days['2026-09-01']).toBeDefined();
  });
});

describe('eraseEverything', () => {
  it('removes data, settings and every safety or corrupt copy, and nothing else', () => {
    const store = open();
    store.add(T1, 'bye');
    vi.advanceTimersByTime(1000);
    storage.setItem('flipside:settings:v1', '{}');
    storage.setItem('flipside:v1:before-import-5', '{}');
    storage.setItem('flipside:v1:corrupt-5', 'x');
    storage.setItem('other-app', 'keep');
    store.eraseEverything();
    expect(storage.length).toBe(1);
    expect(storage.getItem('other-app')).toBe('keep');
    // Nothing writes it back afterwards.
    vi.advanceTimersByTime(1000);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('asking for persistent storage', () => {
  afterEach(() => {
    delete (navigator as { storage?: unknown }).storage;
  });

  it('asks once, after the first task is added', async () => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: async () => false },
      configurable: true,
    });
    const store = open();
    expect(persist).not.toHaveBeenCalled();
    store.add(T1, 'one');
    store.add(T1, 'two');
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
