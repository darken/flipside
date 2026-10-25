import { emptyData } from '$lib/model/types';
import type { AppData } from '$lib/model/types';
import { parseAppData } from './validate';

export const STORAGE_KEY = 'flipside:v1';
export const SAVE_DELAY_MS = 300;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult =
  | { status: 'ok'; data: AppData; dropped: number }
  | { status: 'empty'; data: AppData }
  | { status: 'recovered'; data: AppData; backupKey: string | null }
  | { status: 'unavailable'; data: AppData };

/** `localStorage` itself can throw on access (blocked cookies, private modes). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Brings stored data up to the current shape. Version 1 is current, so nothing to do yet. */
export function migrate(raw: unknown): unknown {
  return raw;
}

function backUpCorrupt(storage: StorageLike, text: string, now: Date): string | null {
  const key = `${STORAGE_KEY}:corrupt-${now.getTime()}`;
  try {
    storage.setItem(key, text);
    return key;
  } catch {
    return null;
  }
}

/** Never throws. Corrupt data is copied aside and the app starts empty. */
export function load(storage: StorageLike | null, now: Date = new Date()): LoadResult {
  if (!storage) return { status: 'unavailable', data: emptyData() };

  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', data: emptyData() };
  }
  if (text === null) return { status: 'empty', data: emptyData() };

  try {
    const result = parseAppData(migrate(JSON.parse(text)));
    if (result.ok) return { status: 'ok', data: result.data, dropped: result.dropped };
  } catch {
    // Not valid JSON: fall through to recovery.
  }
  return { status: 'recovered', data: emptyData(), backupKey: backUpCorrupt(storage, text, now) };
}

/** Returns false when the write failed (storage full or unavailable). */
export function save(data: AppData, storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export type Saver = {
  /** Debounced: runs `write` once, `delay` ms after the last call. */
  schedule(): void;
  /** Runs `write` now if a save is waiting. */
  flush(): void;
  /** Drops a waiting save. */
  cancel(): void;
  /** Flushes, then stops listening for the page being hidden. */
  dispose(): void;
};

/** Debounced saving that also flushes when the page is hidden or closed. */
export function createSaver(delay: number, write: () => void): Saver {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const flush = () => {
    clear();
    if (!pending) return;
    pending = false;
    write();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  globalThis.addEventListener?.('pagehide', flush);
  globalThis.document?.addEventListener('visibilitychange', onVisibility);

  return {
    schedule() {
      pending = true;
      clear();
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      clear();
      pending = false;
    },
    dispose() {
      flush();
      globalThis.removeEventListener?.('pagehide', flush);
      globalThis.document?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
