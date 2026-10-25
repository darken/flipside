import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '$lib/model/dates';
import type { AppData } from '$lib/model/types';
import { settings, SETTINGS_KEY } from '$lib/settings/settings.svelte';
import { app } from '$lib/store/app.svelte';
import { makeBackup } from '$lib/store/backup';
import { STORAGE_KEY } from '$lib/store/persist';
import { busy } from '$lib/ui/busy.svelte';
import { reloadApp } from '$lib/ui/reload';
import { toasts } from '$lib/ui/toast.svelte';
import App from '../App.svelte';

vi.mock('$lib/ui/reload', () => ({ reloadApp: vi.fn() }));

const TODAY = '2026-10-25';
const ago = (n: number) => addDays(TODAY, -n);

type Spec = Record<number, [done: number, open: number]>;

function dataFor(spec: Spec): AppData {
  const days: AppData['days'] = {};
  for (const [offset, [done, open]] of Object.entries(spec)) {
    const key = ago(Number(offset));
    const task = (i: number, doneAt?: string) => ({
      id: `${key}-${i}`,
      text: `task ${i} ${key}`,
      createdAt: `${key}T08:00:00.000Z`,
      order: i,
      ...(doneAt && { doneAt }),
    });
    days[key] = {
      date: key,
      tasks: [
        ...Array.from({ length: done }, (_, i) => task(i, `${key}T10:00:00.000Z`)),
        ...Array.from({ length: open }, (_, i) => task(done + i)),
      ],
    };
  }
  return { version: 1, routines: [], days };
}

const SMALL: Spec = { 0: [0, 1], 1: [2, 0], 2: [1, 1] };
/** Ten pages going back 54 days, with the first one old enough to make a backup overdue. */
const OLD: Spec = {
  0: [0, 1],
  1: [1, 0],
  2: [1, 0],
  3: [1, 0],
  4: [1, 0],
  5: [1, 0],
  6: [1, 0],
  54: [1, 0],
};

let dispose: () => void;
let stopSettings: () => void;

function start(spec: Spec = SMALL) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataFor(spec)));
  stopSettings = settings.init(localStorage);
  dispose = app.init();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
  vi.mocked(reloadApp).mockClear();
});

afterEach(() => {
  toasts.clear();
  busy.reset();
  dispose?.();
  stopSettings?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

const settingsButton = () => screen.getAllByRole('button', { name: 'Settings' })[0]!;
const dialog = () => screen.queryByRole('dialog', { name: 'Settings' });
const heading = () => document.querySelector<HTMLElement>('.sheet[data-role="current"] h1')!;
const button = (name: string | RegExp) => screen.getByRole('button', { name });

async function openSettings() {
  render(App);
  await fireEvent.click(settingsButton());
  expect(dialog()).toBeInTheDocument();
}

describe('opening and closing', () => {
  beforeEach(() => start());

  it('opens from the header button, focuses its heading and makes the notepad inert', async () => {
    await openSettings();
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toHaveFocus();
    expect(document.querySelector('.notepad')).toHaveAttribute('inert');
  });

  it('closes with the × button and with Escape', async () => {
    await openSettings();
    await fireEvent.click(button('Close settings'));
    await waitFor(() => expect(dialog()).toBeNull());
    await fireEvent.click(settingsButton());
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('closes with the browser Back button', async () => {
    await openSettings();
    expect(history.state).toEqual({ flipside: 'settings' });
    history.back();
    await waitFor(() => expect(dialog()).toBeNull());
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('closes on a swipe down from the top', async () => {
    await openSettings();
    const sheet = dialog()!;
    await fireEvent.touchStart(sheet, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchMove(sheet, { touches: [{ clientX: 100, clientY: 300 }] });
    await fireEvent.touchEnd(sheet, { touches: [] });
    await waitFor(() => expect(dialog()).toBeNull());
  });
});

describe('appearance and behaviour', () => {
  beforeEach(() => start());

  it('the theme switch sets data-theme and saves the choice', async () => {
    await openSettings();
    const html = document.documentElement;
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(html.getAttribute('data-theme')).toBe('dark'));
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).theme).toBe('dark');
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(html.getAttribute('data-theme')).toBe('light'));
    await fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    await waitFor(() => expect(html.hasAttribute('data-theme')).toBe(false));
  });

  it('the auto-flip toggle changes the setting and is saved', async () => {
    await openSettings();
    const toggle = screen.getByRole('switch', { name: /Auto-flip when done/ });
    expect(toggle).toBeChecked();
    await fireEvent.click(toggle);
    expect(settings.autoFlip).toBe(false);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).autoFlip).toBe(false);
  });

  async function checkOffLastTask() {
    await fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    await new Promise((r) => setTimeout(r, 700));
  }

  it('with auto-flip on, finishing the last task turns the page', async () => {
    render(App);
    await checkOffLastTask();
    expect(screen.getByRole('button', { name: 'Show to-do list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('with auto-flip off, the page stays where it is', async () => {
    settings.update({ autoFlip: false });
    render(App);
    await checkOffLastTask();
    expect(screen.getByRole('button', { name: 'Show done list' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('downloading a backup', () => {
  beforeEach(() => {
    start();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  });

  const stubShare = (share: () => Promise<void>) => {
    Object.assign(navigator, { share: vi.fn(share), canShare: () => true });
    return navigator.share as ReturnType<typeof vi.fn>;
  };

  it('with a share sheet, shares the file and records the time', async () => {
    const share = stubShare(async () => {});
    await openSettings();
    expect(screen.getByText('No backup yet')).toBeInTheDocument();
    await fireEvent.click(button('Download backup'));
    await waitFor(() => expect(settings.lastBackupAt).toBeDefined());
    const { files } = share.mock.calls[0]![0] as { files: File[] };
    expect(files[0]!.name).toBe('flipside-backup-2026-10-25.json');
    expect(screen.getByText('Last backup: Today')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).lastBackupAt).toBeDefined();
  });

  it('records nothing when the share sheet is closed without choosing', async () => {
    const share = stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    await openSettings();
    await fireEvent.click(button('Download backup'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(settings.lastBackupAt).toBeUndefined();
    expect(screen.getByText('No backup yet')).toBeInTheDocument();
  });

  it('without a share sheet, clicks a download link', async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    await openSettings();
    await fireEvent.click(button('Download backup'));
    await waitFor(() => expect(settings.lastBackupAt).toBeDefined());
    expect(clicks).toEqual(['flipside-backup-2026-10-25.json']);
  });
});

describe('importing a backup', () => {
  beforeEach(() => start());

  const fileFor = (text: string, name = 'flipside-backup-2026-09-01.json') =>
    new File([text], name, { type: 'application/json' });
  const pick = async (file: File) => {
    const input = screen.getByLabelText('Backup file') as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });
  };
  const incoming = () =>
    makeBackup(dataFor({ 20: [3, 1], 21: [2, 0] }), {
      version: 1,
      theme: 'dark',
      autoFlip: false,
    });

  it('shows a preview next to the current figures, and replaces nothing until confirmed', async () => {
    await openSettings();
    await pick(fileFor(JSON.stringify(incoming())));
    await screen.findByRole('heading', { name: 'Import backup' });
    expect(
      screen.getByText(/Oct 4 – Oct 5, 2026 · 2 days · 5 tasks done · 0 routines/),
    ).toBeTruthy();
    expect(screen.getByText(/On this device now/)).toBeInTheDocument();
    expect(screen.getByText(/This replaces everything on this device/)).toBeInTheDocument();
    expect(Object.keys(app.data.days)).toContain(TODAY);
    expect(Object.keys(app.data.days)).not.toContain(ago(20));
  });

  it('replaces everything on confirm, applies the settings and offers Undo', async () => {
    await openSettings();
    await pick(fileFor(JSON.stringify(incoming())));
    await fireEvent.click(await screen.findByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(Object.keys(app.data.days).sort()).toEqual([ago(21), ago(20), TODAY].sort());
    expect(settings.theme).toBe('dark');
    expect(settings.autoFlip).toBe(false);
    expect(screen.getByText('Backup imported')).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Sunday, October 25');

    await fireEvent.click(button('Undo'));
    expect(Object.keys(app.data.days).sort()).toEqual([ago(2), ago(1), TODAY].sort());
    expect(settings.theme).toBe('system');
    expect(settings.autoFlip).toBe(true);
    expect(screen.getByText('Import undone')).toBeInTheDocument();
  });

  it('puts the notepad back on today after an import', async () => {
    render(App);
    await fireEvent.click(button('Older ›'));
    await waitFor(() => expect(heading()).toHaveTextContent('Saturday, October 24'));
    await fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    await pick(fileFor(JSON.stringify(incoming())));
    await fireEvent.click(await screen.findByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(heading()).toHaveTextContent('Sunday, October 25'));
  });

  it('cancelling leaves everything as it was', async () => {
    await openSettings();
    await pick(fileFor(JSON.stringify(incoming())));
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(Object.keys(app.data.days)).not.toContain(ago(20));
  });

  it.each([
    ['not a backup', JSON.stringify({ hello: 1 }), 'Not a Flipside backup'],
    ['broken', '{"app":', 'The file is damaged'],
    [
      'newer',
      JSON.stringify({ app: 'flipside', backupVersion: 5, data: {} }),
      'This backup is from a newer version of Flipside',
    ],
  ])('shows a clear error for a file that is %s, and changes nothing', async (_n, text, error) => {
    await openSettings();
    await pick(fileFor(text));
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.queryByRole('heading', { name: 'Import backup' })).toBeNull();
    expect(Object.keys(app.data.days)).toContain(ago(1));
  });

  it('rejects a file over 10 MB without reading it', async () => {
    await openSettings();
    const big = fileFor('x');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await pick(big);
    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
  });
});

describe('erasing everything', () => {
  beforeEach(() => start());

  it('needs two confirmations, the second by typing "erase"', async () => {
    await openSettings();
    await fireEvent.click(button('Erase all data'));
    expect(screen.getByRole('heading', { name: 'Erase everything?' })).toBeInTheDocument();
    expect(screen.getByText(/There is no undo/)).toBeInTheDocument();
    expect(button('Download a backup first')).toBeInTheDocument();
    await fireEvent.click(button('Erase everything'));

    const confirm = screen.getByRole('button', { name: 'Erase everything' });
    expect(confirm).toBeDisabled();
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'eras' } });
    expect(confirm).toBeDisabled();
    await fireEvent.input(input, { target: { value: 'Erase' } });
    expect(confirm).toBeEnabled();
    expect(reloadApp).not.toHaveBeenCalled();
    await fireEvent.click(confirm);

    expect(reloadApp).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });

  it('can be cancelled at either step', async () => {
    await openSettings();
    await fireEvent.click(button('Erase all data'));
    await fireEvent.click(button('Cancel'));
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeInTheDocument();
    await fireEvent.click(button('Erase all data'));
    await fireEvent.click(button('Erase everything'));
    await fireEvent.click(button('Cancel'));
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(reloadApp).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('data safety information', () => {
  beforeEach(() => start());

  it('shows the data size, protection status and a failed-save warning', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: async () => ({ usage: 2048, quota: 5 * 1024 * 1024 }),
        persisted: async () => true,
      },
      configurable: true,
    });
    await openSettings();
    expect(await screen.findByText('Protected from automatic clearing')).toBeInTheDocument();
    expect(
      screen.getByText(/KB of notes · 2 KB used of 5.0 MB browser storage/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    app.storageOk = false;
    expect(
      await screen.findByText("Changes aren't being saved on this device"),
    ).toBeInTheDocument();
    delete (navigator as { storage?: unknown }).storage;
  });

  it('suggests the Home Screen in a normal Safari tab', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    );
    await openSettings();
    expect(screen.getByText(/Add Flipside to your Home Screen/)).toBeInTheDocument();
  });

  it('shows the version', async () => {
    await openSettings();
    expect(screen.getByText(/^Flipside .+ · built /)).toBeInTheDocument();
  });
});

describe('the backup reminder', () => {
  const note = () => screen.queryByText("It's been a while since your last backup");

  it('shows on today when a backup is overdue, and dismissing hides it', async () => {
    start(OLD);
    render(App);
    expect(note()).toBeInTheDocument();
    expect(settings.backupNudgeShownAt).toBeDefined();
    await fireEvent.click(button('Dismiss reminder'));
    expect(note()).toBeNull();
  });

  it('"Back up" opens Settings at Your data and hides the note', async () => {
    start(OLD);
    render(App);
    await fireEvent.click(button('Back up'));
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your data' })).toHaveFocus();
    expect(screen.getByText(/No backup for 54 days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download now' })).toBeInTheDocument();
  });

  it('does not show on a past page, while a sheet is open, or within 30 days of last showing', async () => {
    start(OLD);
    render(App);
    await fireEvent.click(settingsButton());
    expect(note()).toBeNull();
    await fireEvent.click(button('Close settings'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(note()).toBeInTheDocument();
    await fireEvent.click(button('Older ›'));
    await waitFor(() => expect(heading()).toHaveTextContent('Saturday, October 24'));
    // Today's page is still mounted (inert, waiting above); the page in front has no note.
    const current = document.querySelector('.sheet[data-role="current"]')!;
    expect(current).not.toHaveTextContent('since your last backup');
  });

  it('stays away when it showed recently, or when there is nothing overdue', () => {
    start(OLD);
    settings.update({ backupNudgeShownAt: new Date(2026, 9, 10).toISOString() });
    render(App);
    expect(note()).toBeNull();
  });

  it('stays away with a recent backup or few pages', () => {
    start(SMALL);
    render(App);
    expect(note()).toBeNull();
  });

  it('stays away for a recent backup, even with old pages', () => {
    start(OLD);
    settings.update({ lastBackupAt: new Date(2026, 9, 20).toISOString() });
    render(App);
    expect(note()).toBeNull();
  });
});
