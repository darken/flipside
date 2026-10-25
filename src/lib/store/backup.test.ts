import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataWith, day, task } from '../../../tests/fixtures';
import { defaultSettings } from '$lib/settings/types';
import {
  MAX_BACKUP_BYTES,
  backupFilename,
  backupNudge,
  describePreview,
  exportBackup,
  makeBackup,
  previewBackup,
  readBackup,
  shouldShowNudge,
} from './backup';

const NOW = new Date(2026, 9, 25, 12, 0, 0);
const done = (date: string) => task({ doneAt: `${date}T10:00:00.000Z` });

const sample = () =>
  dataWith(
    [
      day('2026-10-01', [done('2026-10-01'), task()]),
      day('2026-10-25', [done('2026-10-25'), done('2026-10-25')]),
    ],
    [{ id: 'r1', text: 'Stretch', active: true, createdAt: '2026-09-01T00:00:00.000Z' }],
  );

describe('makeBackup / readBackup', () => {
  it('round-trips the data and the portable settings, leaving out device-only fields', () => {
    const settings = {
      ...defaultSettings(),
      theme: 'dark' as const,
      autoFlip: false,
      lastBackupAt: '2026-10-01T10:00:00.000Z',
      backupNudgeShownAt: '2026-10-02T10:00:00.000Z',
    };
    const data = sample();
    const backup = makeBackup(data, settings, NOW);
    expect(backup).toMatchObject({ app: 'flipside', backupVersion: 1 });
    expect(backup.exportedAt).toBe(NOW.toISOString());
    expect(backup.settings).toEqual({ version: 1, theme: 'dark', autoFlip: false });

    const result = readBackup(JSON.stringify(backup));
    expect(result).toEqual({
      ok: true,
      data,
      settings: { version: 1, theme: 'dark', autoFlip: false },
      dropped: 0,
    });
  });

  it('accepts a bare AppData object, without settings', () => {
    const result = readBackup(JSON.stringify(sample()));
    expect(result).toMatchObject({ ok: true, settings: null });
  });

  it('ignores a missing or invalid settings part', () => {
    const base = makeBackup(sample(), defaultSettings(), NOW);
    for (const settings of [undefined, 'x', { version: 9 }, null]) {
      const result = readBackup(JSON.stringify({ ...base, settings }));
      expect(result).toMatchObject({ ok: true, settings: null });
    }
  });

  it('counts dropped items instead of failing', () => {
    const base = makeBackup(sample(), defaultSettings(), NOW);
    const text = JSON.stringify({
      ...base,
      data: { ...base.data, routines: [...base.data.routines, { nope: true }] },
    });
    expect(readBackup(text)).toMatchObject({ ok: true, dropped: 1 });
  });

  it.each([
    ['broken JSON', '{"app": ', 'The file is damaged'],
    ['a list', '[1,2]', 'Not a Flipside backup'],
    ['a number', '5', 'Not a Flipside backup'],
    ['some other app', JSON.stringify({ app: 'other', data: {} }), 'Not a Flipside backup'],
    ['unrelated JSON', JSON.stringify({ hello: 1 }), 'Not a Flipside backup'],
    [
      'a newer backup format',
      JSON.stringify({ app: 'flipside', backupVersion: 2, data: {} }),
      'This backup is from a newer version of Flipside',
    ],
    [
      'newer data',
      JSON.stringify({
        app: 'flipside',
        backupVersion: 1,
        data: { version: 2, days: {}, routines: [] },
      }),
      'This backup is from a newer version of Flipside',
    ],
    [
      'a bare newer AppData',
      JSON.stringify({ version: 2, days: {}, routines: [] }),
      'This backup is from a newer version of Flipside',
    ],
    [
      'a missing backup version',
      JSON.stringify({ app: 'flipside', data: {} }),
      'The file is damaged',
    ],
    [
      'unusable data',
      JSON.stringify({
        app: 'flipside',
        backupVersion: 1,
        data: { version: 1, days: 3, routines: [] },
      }),
      'The file is damaged',
    ],
  ])('rejects %s', (_name, text, error) => {
    expect(readBackup(text)).toEqual({ ok: false, error });
  });

  it('rejects files over 10 MB', () => {
    const result = readBackup(' '.repeat(MAX_BACKUP_BYTES + 1));
    expect(result).toEqual({ ok: false, error: 'The file is too large (over 10 MB)' });
  });
});

describe('backupFilename', () => {
  it('uses the given day', () => {
    expect(backupFilename('2026-10-25')).toBe('flipside-backup-2026-10-25.json');
  });

  it('uses the local date, not UTC, near midnight', () => {
    // 23:30 in New York on Oct 25 is already Oct 26 in UTC.
    expect(backupFilename(new Date(2026, 9, 25, 23, 30))).toBe('flipside-backup-2026-10-25.json');
    expect(backupFilename(new Date(2026, 9, 26, 0, 5))).toBe('flipside-backup-2026-10-26.json');
  });
});

describe('previewBackup', () => {
  it('summarises the date range, days, done tasks and routines', () => {
    expect(previewBackup(sample())).toEqual({
      from: '2026-10-01',
      to: '2026-10-25',
      days: 2,
      done: 3,
      routines: 1,
    });
    expect(describePreview(previewBackup(sample()), 'en-US')).toBe(
      'Oct 1 – Oct 25, 2026 · 2 days · 3 tasks done · 1 routine',
    );
  });

  it('copes with an empty notebook', () => {
    const preview = previewBackup(dataWith([]));
    expect(preview).toEqual({ from: null, to: null, days: 0, done: 0, routines: 0 });
    expect(describePreview(preview)).toBe('Nothing yet');
  });
});

describe('backupNudge', () => {
  /** `count` consecutive pages ending today (2026-10-25), the oldest `oldest` days ago. */
  const pages = (count: number, oldest: number) =>
    dataWith(
      Array.from({ length: count }, (_, i) => {
        const date = new Date(2026, 9, 25 - Math.round((oldest * (count - 1 - i)) / (count - 1)));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return day(key);
      }),
    );
  const ago = (days: number) => new Date(2026, 9, 25 - days, 9).toISOString();

  it('is not due with fewer than 7 days of pages, however old', () => {
    expect(backupNudge({}, pages(6, 100), NOW)).toEqual({ due: false });
    expect(backupNudge({}, pages(7, 100), NOW)).toEqual({ due: true, days: 100 });
  });

  it('is due 30 days after the last backup, but not 29', () => {
    const data = pages(10, 100);
    expect(backupNudge({ lastBackupAt: ago(29) }, data, NOW)).toEqual({ due: false });
    expect(backupNudge({ lastBackupAt: ago(30) }, data, NOW)).toEqual({ due: true, days: 30 });
    expect(backupNudge({ lastBackupAt: ago(34) }, data, NOW)).toEqual({ due: true, days: 34 });
  });

  it('with no backup ever, counts from the first page', () => {
    expect(backupNudge({}, pages(10, 29), NOW)).toEqual({ due: false });
    expect(backupNudge({}, pages(10, 30), NOW)).toEqual({ due: true, days: 30 });
  });

  it('shows the note on today at most once every 30 days', () => {
    const data = pages(10, 100);
    const due = { lastBackupAt: ago(40) };
    expect(shouldShowNudge(due, data, NOW)).toBe(true);
    expect(shouldShowNudge({ ...due, backupNudgeShownAt: ago(29) }, data, NOW)).toBe(false);
    expect(shouldShowNudge({ ...due, backupNudgeShownAt: ago(30) }, data, NOW)).toBe(true);
    expect(shouldShowNudge({ lastBackupAt: ago(5) }, data, NOW)).toBe(false);
  });
});

describe('exportBackup', () => {
  const data = sample();
  const settings = defaultSettings();
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
  });

  const stubShare = (share: () => Promise<void>, canShare = true) => {
    Object.assign(navigator, { share: vi.fn(share), canShare: vi.fn(() => canShare) });
    return navigator.share as ReturnType<typeof vi.fn>;
  };

  it('opens the share sheet with the file where files can be shared', async () => {
    const share = stubShare(async () => {});
    expect(await exportBackup(data, settings, NOW)).toBe('shared');
    const { files } = share.mock.calls[0]![0] as { files: File[] };
    expect(files[0]!.name).toBe('flipside-backup-2026-10-25.json');
    expect(files[0]!.type).toBe('application/json');
    expect(clicked).toHaveLength(0);
  });

  it('records nothing when the share sheet is closed without choosing', async () => {
    stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await exportBackup(data, settings, NOW)).toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('falls back to a download when sharing fails another way', async () => {
    stubShare(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    expect(await exportBackup(data, settings, NOW)).toBe('downloaded');
    expect(clicked[0]!.download).toBe('flipside-backup-2026-10-25.json');
  });

  it('downloads when the share sheet does not take files, or does not exist', async () => {
    const share = stubShare(async () => {}, false);
    expect(await exportBackup(data, settings, NOW)).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    delete (navigator as { share?: unknown }).share;
    expect(await exportBackup(data, settings, NOW)).toBe('downloaded');
    expect(clicked).toHaveLength(2);
    expect(clicked[0]!.href).toBe('blob:fake');
  });
});
