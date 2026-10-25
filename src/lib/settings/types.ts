export type Theme = 'system' | 'light' | 'dark';

export const SETTINGS_VERSION = 1;

export type Settings = {
  version: typeof SETTINGS_VERSION;
  theme: Theme;
  autoFlip: boolean;
  /** ISO timestamp; set when a backup is downloaded or shared. Belongs to this device. */
  lastBackupAt?: string;
  /** ISO timestamp of when the backup reminder last appeared on today's page. Device-only. */
  backupNudgeShownAt?: string;
};

/** The part of the settings that travels in a backup file. */
export type PortableSettings = Pick<Settings, 'version' | 'theme' | 'autoFlip'>;

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export function defaultSettings(): Settings {
  return { version: SETTINGS_VERSION, theme: 'system', autoFlip: true };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isTimestamp = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Rebuilds settings from an unknown value, field by field: anything invalid falls back to its
 * default. Returns null when the value is not a settings object at all.
 */
export function parseSettings(raw: unknown): Settings | null {
  if (!isRecord(raw) || raw.version !== SETTINGS_VERSION) return null;
  const base = defaultSettings();
  return {
    ...base,
    ...(THEMES.includes(raw.theme as Theme) && { theme: raw.theme as Theme }),
    ...(typeof raw.autoFlip === 'boolean' && { autoFlip: raw.autoFlip }),
    ...(isTimestamp(raw.lastBackupAt) && { lastBackupAt: raw.lastBackupAt }),
    ...(isTimestamp(raw.backupNudgeShownAt) && { backupNudgeShownAt: raw.backupNudgeShownAt }),
  };
}

/** Settings that travel in a backup: no device-only fields. */
export function portable(settings: Settings): PortableSettings {
  return { version: settings.version, theme: settings.theme, autoFlip: settings.autoFlip };
}
