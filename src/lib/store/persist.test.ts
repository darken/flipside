import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../../tests/memory-storage';
import { emptyData } from '$lib/model/types';
import {
  STORAGE_KEY,
  appKeys,
  browserStorage,
  createSaver,
  isSafariTab,
  load,
  migrate,
  requestPersistence,
  save,
  storageInfo,
  type StorageLike,
} from './persist';

const NOW = new Date('2026-10-25T15:00:00.000Z');
const TS = '2026-10-25T10:00:00.000Z';
const sample = () => ({
  ...emptyData(),
  days: {
    '2026-10-25': { date: '2026-10-25', tasks: [{ id: 'a', text: 'x', createdAt: TS, order: 0 }] },
  },
});

const broken = (over: Partial<StorageLike>): StorageLike => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  ...over,
});

describe('load', () => {
  it('starts empty when nothing is stored', () => {
    const result = load(new MemoryStorage(), NOW);
    expect(result.status).toBe('empty');
    expect(result.data).toEqual(emptyData());
  });

  it('round-trips what save wrote', () => {
    const storage = new MemoryStorage();
    expect(save(sample(), storage)).toBe(true);
    expect(load(storage, NOW)).toEqual({ status: 'ok', data: sample(), dropped: 0 });
  });

  it('reports how many unrecognised items were dropped', () => {
    const storage = new MemoryStorage();
    const data = sample();
    data.days['2026-10-25']!.tasks.push({ id: '' } as never);
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    expect(load(storage, NOW)).toMatchObject({ status: 'ok', dropped: 1 });
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['the wrong shape', '[1,2]'],
    ['an unsupported version', JSON.stringify({ ...emptyData(), version: 99 })],
  ])('backs up %s and starts empty', (_name, text) => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, text);
    const result = load(storage, NOW);
    expect(result).toMatchObject({
      status: 'recovered',
      backupKey: `flipside:v1:corrupt-${NOW.getTime()}`,
    });
    expect(result.data).toEqual(emptyData());
    expect(storage.getItem(`flipside:v1:corrupt-${NOW.getTime()}`)).toBe(text);
  });

  it('still recovers when the backup cannot be written', () => {
    const result = load(
      broken({
        getItem: () => '{nope',
        setItem: () => {
          throw new Error('quota');
        },
      }),
      NOW,
    );
    expect(result).toEqual({ status: 'recovered', data: emptyData(), backupKey: null });
  });

  it('works in memory when storage is missing or throws', () => {
    expect(load(null).status).toBe('unavailable');
    const throwing = broken({
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(load(throwing).status).toBe('unavailable');
  });

  it('passes data through migrate', () => {
    expect(migrate({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('save', () => {
  it('returns false when storage is missing or throws', () => {
    expect(save(emptyData(), null)).toBe(false);
    const full = broken({
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(save(emptyData(), full)).toBe(false);
  });
});

describe('browserStorage', () => {
  it('returns localStorage', () => {
    expect(browserStorage()).toBe(globalThis.localStorage);
  });

  it('returns null when reading localStorage throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(browserStorage()).toBeNull();
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(browserStorage()).toBeNull();
    spy.mockRestore();
  });
});

describe('createSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes once, 300 ms after the last change', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    saver.schedule();
    vi.advanceTimersByTime(200);
    saver.schedule();
    vi.advanceTimersByTime(200);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
    saver.dispose();
  });

  it('flush writes immediately, only when something is waiting', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    saver.flush();
    expect(write).not.toHaveBeenCalled();
    saver.schedule();
    saver.flush();
    saver.flush();
    expect(write).toHaveBeenCalledTimes(1);
    saver.dispose();
  });

  it('cancel drops a waiting save', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    saver.schedule();
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(write).not.toHaveBeenCalled();
    saver.dispose();
  });

  it('flushes on pagehide', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    saver.schedule();
    window.dispatchEvent(new Event('pagehide'));
    expect(write).toHaveBeenCalledTimes(1);
    saver.dispose();
  });

  it('flushes when the page becomes hidden, but not when visible', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    saver.schedule();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(write).not.toHaveBeenCalled();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(write).toHaveBeenCalledTimes(1);
    saver.dispose();
  });

  it('dispose flushes and stops listening', () => {
    const write = vi.fn();
    const saver = createSaver(300, write);
    saver.schedule();
    saver.dispose();
    expect(write).toHaveBeenCalledTimes(1);
    saver.schedule();
    window.dispatchEvent(new Event('pagehide'));
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('storage helpers', () => {
  afterEach(() => {
    delete (navigator as { storage?: unknown }).storage;
  });

  it('lists only this app’s keys', () => {
    const s = new MemoryStorage();
    s.setItem('flipside:v1', '1');
    s.setItem('flipside:settings:v1', '2');
    s.setItem('other', '3');
    expect(appKeys(s).sort()).toEqual(['flipside:settings:v1', 'flipside:v1']);
    expect(appKeys(null)).toEqual([]);
  });

  it('measures the data and reads the browser estimate', async () => {
    const s = new MemoryStorage();
    s.setItem('flipside:v1', 'x'.repeat(50));
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 10, quota: 100 }), persisted: async () => true },
      configurable: true,
    });
    expect(await storageInfo(s)).toEqual({
      dataBytes: 100,
      usage: 10,
      quota: 100,
      persisted: true,
    });
  });

  it('reports unknowns when the browser has no storage manager', async () => {
    expect(await storageInfo(null)).toEqual({
      dataBytes: 0,
      usage: null,
      quota: null,
      persisted: null,
    });
  });

  it('requests persistence only where it exists, and reuses an existing grant', async () => {
    expect(await requestPersistence()).toBe(false);
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: async () => true },
      configurable: true,
    });
    expect(await requestPersistence()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'storage', {
      value: { persist: async () => false, persisted: async () => false },
      configurable: true,
    });
    expect(await requestPersistence()).toBe(false);
  });

  it('knows a Safari tab from an installed app and other browsers', () => {
    const ua = (value: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
    ua(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(isSafariTab()).toBe(true);
    (navigator as { standalone?: boolean }).standalone = true;
    expect(isSafariTab()).toBe(false);
    delete (navigator as { standalone?: boolean }).standalone;
    ua('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');
    expect(isSafariTab()).toBe(false);
  });
});
