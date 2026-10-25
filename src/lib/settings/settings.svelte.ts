import { browserStorage, type StorageLike } from '$lib/store/persist';
import { THEMES, defaultSettings, isTimestamp, parseSettings, type Settings } from './types';

export const SETTINGS_KEY = 'flipside:settings:v1';

/** App settings, saved under their own key so they never touch the task data. */
export class SettingsStore {
  #state = $state<Settings>(defaultSettings());
  #storage: StorageLike | null = null;

  get theme() {
    return this.#state.theme;
  }
  get autoFlip() {
    return this.#state.autoFlip;
  }
  get lastBackupAt() {
    return this.#state.lastBackupAt;
  }
  get backupNudgeShownAt() {
    return this.#state.backupNudgeShownAt;
  }

  /** A plain copy of every field. */
  get value(): Settings {
    return { ...this.#state };
  }

  /** Reads the saved settings (defaults when missing or invalid) and listens for other tabs. */
  init(storage: StorageLike | null = browserStorage()): () => void {
    this.#storage = storage;
    this.load();
    const onStorage = (e: StorageEvent) => {
      const ours = e.storageArea === null || e.storageArea === this.#storage;
      if (ours && (e.key === null || e.key === SETTINGS_KEY)) this.load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  load(): void {
    let parsed: Settings | null = null;
    try {
      const text = this.#storage?.getItem(SETTINGS_KEY);
      if (text) parsed = parseSettings(JSON.parse(text));
    } catch {
      // Unreadable: use the defaults.
    }
    this.#state = parsed ?? defaultSettings();
  }

  /** Merges a change, ignores invalid values and saves straight away. `undefined` clears a stamp. */
  update(patch: Partial<Omit<Settings, 'version'>>): void {
    const next: Settings = { ...this.#state };
    if (patch.theme !== undefined && THEMES.includes(patch.theme)) next.theme = patch.theme;
    if (typeof patch.autoFlip === 'boolean') next.autoFlip = patch.autoFlip;
    for (const key of ['lastBackupAt', 'backupNudgeShownAt'] as const) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) delete next[key];
      else if (isTimestamp(value)) next[key] = value;
    }
    this.#state = next;
    try {
      this.#storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the setting still applies for this session.
    }
  }

  /** Back to the defaults, in memory only (used after erasing everything). */
  reset(): void {
    this.#state = defaultSettings();
  }
}

export const settings = new SettingsStore();
