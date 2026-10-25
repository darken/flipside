import { emptyData } from '$lib/model/types';
import type { AppData } from '$lib/model/types';
import { parseAppData } from './validate';

export const STORAGE_KEY = 'flipside:v1';
export const SAVE_DELAY_MS = 300;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> &
  Partial<Pick<Storage, 'key' | 'length'>>;

export const SAFETY_PREFIX = `${STORAGE_KEY}:before-import-`;

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

/** Every key this app has written (data, settings, corrupt and safety copies). */
export function appKeys(storage: StorageLike | null): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const key = storage?.key?.(i);
      if (key?.startsWith('flipside:')) keys.push(key);
    }
  } catch {
    // Storage went away: nothing to list.
  }
  return keys;
}

/**
 * Saves the current data aside before an import replaces it, keeping only the latest copy.
 * Returns the key, or null when the copy could not be written.
 */
export function saveSafetyCopy(
  data: AppData,
  storage: StorageLike | null,
  now: Date,
): string | null {
  if (!storage) return null;
  const key = `${SAFETY_PREFIX}${now.getTime()}`;
  try {
    storage.setItem(key, JSON.stringify(data));
  } catch {
    return null;
  }
  for (const old of appKeys(storage)) {
    if (old.startsWith(SAFETY_PREFIX) && old !== key) {
      try {
        storage.removeItem(old);
      } catch {
        // Leave it: an extra copy is harmless.
      }
    }
  }
  return key;
}

/** Reads a safety copy back, or null if it is gone or unusable. */
export function loadSafetyCopy(key: string, storage: StorageLike | null): AppData | null {
  try {
    const text = storage?.getItem(key);
    if (!text) return null;
    const result = parseAppData(migrate(JSON.parse(text)));
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/** Removes everything this app stores: data, settings, corrupt and safety copies. */
export function eraseAll(storage: StorageLike | null): void {
  for (const key of appKeys(storage)) {
    try {
      storage?.removeItem(key);
    } catch {
      // Keep going: remove what can be removed.
    }
  }
}

export type StorageInfo = {
  /** Bytes of task data in localStorage (approximate: UTF-16 characters x 2). */
  dataBytes: number;
  usage: number | null;
  quota: number | null;
  /** True when the browser promised not to clear the data automatically; null when unknown. */
  persisted: boolean | null;
};

export async function storageInfo(storage: StorageLike | null): Promise<StorageInfo> {
  let dataBytes = 0;
  try {
    dataBytes = (storage?.getItem(STORAGE_KEY)?.length ?? 0) * 2;
  } catch {
    // Unreadable: report nothing.
  }
  const manager = typeof navigator === 'undefined' ? undefined : navigator.storage;
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    const estimate = await manager?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // No estimate available.
  }
  try {
    persisted = (await manager?.persisted?.()) ?? null;
  } catch {
    // Unknown.
  }
  return { dataBytes, usage, quota, persisted };
}

/** Asks the browser not to clear our data automatically. True when it agreed. */
export async function requestPersistence(): Promise<boolean> {
  try {
    const manager = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!manager?.persist) return false;
    return (await manager.persisted?.()) || (await manager.persist());
  } catch {
    return false;
  }
}

/** True in a normal Safari tab (not an installed Home Screen app), where data may be cleared. */
export function isSafariTab(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return safari && !standalone;
}
