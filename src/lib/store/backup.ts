import { daysBetween, formatShort, parseKey, todayKey } from '$lib/model/dates';
import { CURRENT_VERSION } from '$lib/model/types';
import type { AppData, DateKey } from '$lib/model/types';
import { parseSettings, portable, type PortableSettings, type Settings } from '$lib/settings/types';
import { migrate } from './persist';
import { parseAppData } from './validate';

export const BACKUP_APP = 'flipside';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export type Backup = {
  app: typeof BACKUP_APP;
  backupVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  data: AppData;
  settings: PortableSettings;
};

/** Wraps the data and the portable settings. Device-only fields (backup stamps) are left out. */
export function makeBackup(data: AppData, settings: Settings, now: Date = new Date()): Backup {
  return {
    app: BACKUP_APP,
    backupVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
    settings: portable(settings),
  };
}

/** `flipside-backup-2026-10-25.json`, with the local date. */
export function backupFilename(today: DateKey | Date = new Date()): string {
  const key = typeof today === 'string' ? today : todayKey(today);
  return `flipside-backup-${key}.json`;
}

export type ReadResult =
  | { ok: true; data: AppData; settings: PortableSettings | null; dropped: number }
  | { ok: false; error: string };

const NOT_BACKUP = 'Not a Flipside backup';
const NEWER = 'This backup is from a newer version of Flipside';
const DAMAGED = 'The file is damaged';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks a backup file's text. Also accepts a bare AppData object. Never throws. */
export function readBackup(text: string): ReadResult {
  if (text.length > MAX_BACKUP_BYTES)
    return { ok: false, error: 'The file is too large (over 10 MB)' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: DAMAGED };
  }
  if (!isRecord(raw)) return { ok: false, error: NOT_BACKUP };

  let dataRaw: unknown;
  let settingsRaw: unknown;
  if (raw.app === BACKUP_APP) {
    if (typeof raw.backupVersion === 'number' && raw.backupVersion > BACKUP_VERSION) {
      return { ok: false, error: NEWER };
    }
    if (raw.backupVersion !== BACKUP_VERSION) return { ok: false, error: DAMAGED };
    dataRaw = raw.data;
    settingsRaw = raw.settings;
  } else if ('days' in raw && 'routines' in raw && 'version' in raw) {
    dataRaw = raw;
  } else {
    return { ok: false, error: NOT_BACKUP };
  }

  if (
    isRecord(dataRaw) &&
    typeof dataRaw.version === 'number' &&
    dataRaw.version > CURRENT_VERSION
  ) {
    return { ok: false, error: NEWER };
  }
  const parsed = parseAppData(migrate(dataRaw));
  if (!parsed.ok) return { ok: false, error: DAMAGED };

  const parsedSettings = parseSettings(settingsRaw);
  return {
    ok: true,
    data: parsed.data,
    settings: parsedSettings ? portable(parsedSettings) : null,
    dropped: parsed.dropped,
  };
}

export type BackupPreview = {
  from: DateKey | null;
  to: DateKey | null;
  days: number;
  done: number;
  routines: number;
};

/** The figures shown before an import replaces anything. */
export function previewBackup(data: AppData): BackupPreview {
  const keys = Object.keys(data.days).sort();
  let done = 0;
  for (const day of Object.values(data.days)) done += day.tasks.filter((t) => t.doneAt).length;
  return {
    from: keys[0] ?? null,
    to: keys.at(-1) ?? null,
    days: keys.length,
    done,
    routines: data.routines.length,
  };
}

/** "Oct 1 – Oct 25, 2026 · 22 days · 187 tasks done · 4 routines" */
export function describePreview(preview: BackupPreview, locale?: string): string {
  if (!preview.from || !preview.to) return 'Nothing yet';
  const fmt = (key: DateKey, year: boolean) =>
    year
      ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
          parseKey(key),
        )
      : formatShort(key, locale);
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [
    `${fmt(preview.from, false)} – ${fmt(preview.to, true)}`,
    n(preview.days, 'day'),
    `${n(preview.done, 'task')} done`,
    n(preview.routines, 'routine'),
  ].join(' · ');
}

// ---- Reminder -------------------------------------------------------------------------------

export const NUDGE_MIN_DAYS_OF_PAGES = 7;
export const NUDGE_AFTER_DAYS = 30;

export type Nudge = { due: false } | { due: true; days: number };

const localKey = (iso: string) => todayKey(new Date(iso));

/**
 * Whether a backup is overdue: at least 7 days of pages, and either the last backup is 30 or more
 * days old, or there never was one and the first page is 30 or more days old. `days` is how long
 * it has been.
 */
export function backupNudge(
  settings: Pick<Settings, 'lastBackupAt'>,
  data: AppData,
  now: Date,
): Nudge {
  const keys = Object.keys(data.days).sort();
  if (keys.length < NUDGE_MIN_DAYS_OF_PAGES) return { due: false };
  const since = settings.lastBackupAt ? localKey(settings.lastBackupAt) : keys[0]!;
  const days = daysBetween(since, todayKey(now));
  return days >= NUDGE_AFTER_DAYS ? { due: true, days } : { due: false };
}

/** The note on today's page: due, and not shown in the last 30 days. */
export function shouldShowNudge(
  settings: Pick<Settings, 'lastBackupAt' | 'backupNudgeShownAt'>,
  data: AppData,
  now: Date,
): boolean {
  if (!backupNudge(settings, data, now).due) return false;
  if (!settings.backupNudgeShownAt) return true;
  return daysBetween(localKey(settings.backupNudgeShownAt), todayKey(now)) >= NUDGE_AFTER_DAYS;
}

// ---- Download or share ----------------------------------------------------------------------

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Hands the backup to the share sheet where it accepts files (mostly phones), otherwise downloads
 * it. Closing the share sheet without choosing returns 'cancelled'; any other share failure falls
 * back to a download.
 */
export async function exportBackup(
  data: AppData,
  settings: Settings,
  now: Date = new Date(),
): Promise<ExportOutcome> {
  const json = JSON.stringify(makeBackup(data, settings, now), null, 2);
  const file = new File([json], backupFilename(now), { type: 'application/json' });
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Flipside backup' });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Not allowed or not supported after all: fall through to a download.
    }
  }
  download(file);
  return 'downloaded';
}
