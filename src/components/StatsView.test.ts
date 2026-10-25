import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { addDays } from '$lib/model/dates';
import { app } from '$lib/store/app.svelte';
import { STORAGE_KEY } from '$lib/store/persist';
import { busy } from '$lib/ui/busy.svelte';
import { toasts } from '$lib/ui/toast.svelte';
import StatsView from './StatsView.svelte';

const TODAY = '2026-10-25'; // a Sunday; the test locale is en-US, so weeks start on Sunday
const ago = (n: number) => addDays(TODAY, -n);

type Spec = Record<number, [done: number, open: number]>;

/** Pages at the given offsets from today, each with `done` finished and `open` open tasks. */
function seed(spec: Spec | null, routines: unknown[] = []) {
  const days: Record<string, unknown> = {};
  for (const [offset, [done, open]] of Object.entries(spec ?? {})) {
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, routines, days }));
}

const SPEC: Spec = { 0: [2, 1], 1: [3, 0], 2: [1, 1], 10: [4, 0], 40: [6, 0] };

let dispose: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
});

afterEach(() => {
  toasts.clear();
  busy.reset();
  dispose?.();
  vi.useRealTimers();
});

function start(spec: Spec | null = SPEC, routines: unknown[] = []) {
  seed(spec, routines);
  dispose = app.init();
}

const dialog = () => screen.queryByRole('dialog', { name: 'Stats' });
const stats = () => screen.getByRole('button', { name: 'Stats' });
const tile = (name: string) => screen.getByText(name, { selector: 'dt' }).closest('div')!;
const heading = () => document.querySelector<HTMLElement>('.sheet[data-role="current"] h1')!;

describe('opening and closing the stats view', () => {
  beforeEach(() => start());

  it('opens from the Stats button, focuses its heading and makes the notepad inert', async () => {
    render(App);
    expect(dialog()).toBeNull();
    await fireEvent.click(stats());
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stats', level: 1 })).toHaveFocus();
    expect(document.querySelector('.notepad')).toHaveAttribute('inert');
    expect(document.querySelector('.notepad')).toHaveAttribute('aria-hidden', 'true');
  });

  it('closes with the × button and gives the notepad back', async () => {
    render(App);
    await fireEvent.click(stats());
    await fireEvent.click(screen.getByRole('button', { name: 'Close stats' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.querySelector('.notepad')).not.toHaveAttribute('inert');
  });

  it('closes with Escape', async () => {
    render(App);
    await fireEvent.click(stats());
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('closes with the browser Back button, which leaves the page where it was', async () => {
    render(App);
    await fireEvent.click(stats());
    expect(history.state).toEqual({ flipside: 'stats' });
    history.back();
    await waitFor(() => expect(dialog()).toBeNull());
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('removes its history entry when closed with ×', async () => {
    render(App);
    await fireEvent.click(stats());
    expect(history.state).toEqual({ flipside: 'stats' });
    await fireEvent.click(screen.getByRole('button', { name: 'Close stats' }));
    await waitFor(() => expect(history.state).toBeNull());
  });

  it('opened from a past page stacks on the past layer: Back returns to that page', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Older ›' }));
    await waitFor(() => expect(heading()).toHaveTextContent('Saturday, October 24'));
    await fireEvent.click(screen.getAllByRole('button', { name: 'Stats' })[0]!);
    expect(dialog()).toBeInTheDocument();
    history.back();
    await waitFor(() => expect(dialog()).toBeNull());
    expect(heading()).toHaveTextContent('Saturday, October 24');
    expect(history.state).toEqual({ flipside: 'past' });
  });

  it('closes on a swipe down from the top of the sheet, but not on a short or sideways one', async () => {
    render(App);
    await fireEvent.click(stats());
    const sheet = dialog()!;
    const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

    await fireEvent.touchStart(sheet, touch(100, 100));
    await fireEvent.touchMove(sheet, touch(100, 130));
    vi.setSystemTime(Date.now() + 1000); // slow, so not a fling
    await fireEvent.touchEnd(sheet, { touches: [] });
    expect(dialog()).toBeInTheDocument();

    await fireEvent.touchStart(sheet, touch(100, 100));
    await fireEvent.touchMove(sheet, touch(260, 140));
    await fireEvent.touchEnd(sheet, { touches: [] });
    expect(dialog()).toBeInTheDocument();

    await fireEvent.touchStart(sheet, touch(100, 100));
    await fireEvent.touchMove(sheet, touch(100, 300));
    await fireEvent.touchEnd(sheet, { touches: [] });
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('does not close on a swipe down when the sheet was scrolled down', async () => {
    render(App);
    await fireEvent.click(stats());
    const scroller = dialog()!.querySelector<HTMLElement>('.scroll')!;
    scroller.scrollTop = 200;
    const sheet = dialog()!;
    await fireEvent.touchStart(sheet, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchMove(sheet, { touches: [{ clientX: 100, clientY: 400 }] });
    await fireEvent.touchEnd(sheet, { touches: [] });
    expect(dialog()).toBeInTheDocument();
  });
});

describe('the figures', () => {
  beforeEach(() => start());

  it('shows tiles as a description list, with today included as it stands', () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    expect(tile('Done')).toHaveTextContent('10');
    expect(tile('Done')).toHaveTextContent('+67% vs previous 30 days');
    expect(tile('Current streak')).toHaveTextContent('3');
    expect(tile('Longest streak')).toHaveTextContent('3 days, to Oct 25');
    expect(tile('Average per day')).toHaveTextContent('2.5');
    expect(tile('Average per day')).toHaveTextContent('over 4 active days');
    expect(document.querySelector('dl')).toBeInTheDocument();
  });

  it('the range switch is a radio group that updates the tiles and the bars', async () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    const group = screen.getByRole('group', { name: 'Time range' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked();
    expect(document.querySelectorAll('.hit')).toHaveLength(30);

    await fireEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(tile('Done')).toHaveTextContent('6');
    expect(tile('Done')).toHaveTextContent('+50% vs previous 7 days');
    expect(document.querySelectorAll('.hit')).toHaveLength(7);

    await fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(tile('Done')).toHaveTextContent('16');
    expect(tile('Done')).toHaveTextContent('No earlier data to compare');
    expect(document.querySelectorAll('.hit')).toHaveLength(90);
  });

  it('describes each chart to screen readers, with a table of the data', () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    const chart = screen.getByRole('img', { name: /^Last 30 days: 10 tasks done/ });
    expect(chart).toHaveAccessibleName('Last 30 days: 10 tasks done, best day Oct 15 with 4');
    const table = screen.getByRole('table', { name: /^Last 30 days/ });
    expect(within(table).getAllByRole('row')).toHaveLength(31);
    expect(screen.getByRole('img', { name: /Average tasks done per weekday/ })).toBeInTheDocument();
  });

  it('shows the tapped bar, and a second tap opens that page', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    const hits = document.querySelectorAll('.hit');
    await fireEvent.click(hits[29]!); // today
    expect(screen.getByText('Sun, Oct 25 · 2 of 3 done')).toBeInTheDocument();
    expect(onopen).not.toHaveBeenCalled();
    await fireEvent.click(hits[29]!);
    expect(onopen).toHaveBeenCalledWith(TODAY);
  });

  it('offers "Open page" for a bar, and nothing to open for a day without a page', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    const hits = document.querySelectorAll('.hit');
    await fireEvent.click(hits[27]!); // 2 days ago
    await fireEvent.click(screen.getByRole('button', { name: 'Open page' }));
    expect(onopen).toHaveBeenCalledWith(ago(2));
    await fireEvent.click(hits[25]!); // 4 days ago: no page
    expect(screen.getByText('Wed, Oct 21 · no page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open page' })).toBeNull();
  });

  it('moves between bars with the arrow keys and opens with Enter', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    const frame = screen.getByRole('group', { name: /Bars by day/ });
    await fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    expect(screen.getByText('Sun, Oct 25 · 2 of 3 done')).toBeInTheDocument();
    await fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    expect(screen.getByText('Sat, Oct 24 · 3 of 3 done')).toBeInTheDocument();
    await fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onopen).toHaveBeenCalledWith(ago(1));
  });

  it('updates live when the day changes while it is open', async () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    expect(document.querySelectorAll('.hit')[29]).toBeTruthy();
    vi.setSystemTime(new Date(2026, 9, 26, 0, 1, 0));
    app.tick();
    // The new day has nothing done yet, so the streak still ends yesterday.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /Last 30 days: 10 tasks/ })).toBeTruthy(),
    );
    expect(tile('Current streak')).toHaveTextContent('3');
    expect(tile('Done')).toHaveTextContent('10');
    const labels = document.querySelectorAll('.chart text.axis');
    expect([...labels].at(-1)).toHaveTextContent('Oct 26');
  });
});

describe('the heatmap', () => {
  beforeEach(() => start());

  const cell = (key: string) => document.querySelector<HTMLElement>(`button[data-date="${key}"]`)!;

  it('draws weeks as columns with rows from the week start, and outlines today', () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    const rows = screen.getAllByRole('row');
    // Rows of the heatmap only (the chart tables have rows too).
    const gridRows = rows.filter((r) => r.classList.contains('week-row'));
    expect(gridRows).toHaveLength(7);
    // en-US: weeks start on Sunday, and today is a Sunday: the first row of the last column.
    expect(within(gridRows[0]!).getAllByRole('button').at(-1)).toBe(cell(TODAY));
    expect(cell(TODAY)).toHaveClass('today');
    expect(cell(TODAY)).toHaveAccessibleName('Sun, Oct 25: 2 done');
    expect(cell(ago(4))).toHaveAccessibleName('Wed, Oct 21: no page');
    expect(cell(ago(1)).dataset.level).not.toBe('0');
  });

  it('shows the day when a cell is tapped, and "Open page" opens it', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    await fireEvent.click(cell(ago(10)));
    expect(screen.getByText('Oct 15 · 4 done · 29 days skipped before')).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Open page' })[0]!);
    expect(onopen).toHaveBeenCalledWith(ago(10));
  });

  it('says so when a day has no page, and offers nothing to open', async () => {
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    await fireEvent.click(cell(ago(5)));
    expect(screen.getByText('Oct 20 · no page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open page' })).toBeNull();
  });

  it('has one tab stop, and arrow keys move between days; Enter opens the page', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    const stops = () => document.querySelectorAll('button.cell[tabindex="0"]');
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(cell(TODAY));

    cell(TODAY).focus();
    await fireEvent.keyDown(cell(TODAY), { key: 'ArrowLeft' }); // a week back
    await waitFor(() => expect(cell(ago(7))).toHaveFocus());
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(cell(ago(7)));

    await fireEvent.keyDown(cell(ago(7)), { key: 'ArrowDown' }); // the next day
    await waitFor(() => expect(cell(ago(6))).toHaveFocus());
    await fireEvent.keyDown(cell(ago(6)), { key: 'ArrowUp' });
    await waitFor(() => expect(cell(ago(7))).toHaveFocus());

    await fireEvent.keyDown(cell(ago(7)), { key: 'ArrowRight' }); // back to today's column
    await waitFor(() => expect(cell(TODAY)).toHaveFocus());
    await fireEvent.keyDown(cell(TODAY), { key: 'ArrowRight' }); // nothing after today
    expect(cell(TODAY)).toHaveFocus();

    await fireEvent.keyDown(cell(TODAY), { key: 'Enter' });
    expect(onopen).toHaveBeenCalledWith(TODAY);
  });

  it('does not open a day without a page with Enter', async () => {
    const onopen = vi.fn();
    render(StatsView, { onclose: vi.fn(), onopen });
    await fireEvent.keyDown(cell(ago(5)), { key: 'Enter' });
    expect(onopen).not.toHaveBeenCalled();
  });

  it('closes the sheet and shows the day from the notepad, so Back goes on to today', async () => {
    render(App);
    await fireEvent.click(stats());
    await fireEvent.click(cell(ago(10)));
    await fireEvent.click(screen.getAllByRole('button', { name: 'Open page' })[0]!);
    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(heading()).toHaveTextContent('Thursday, October 15'));
    expect(history.state).toEqual({ flipside: 'past' });
    history.back();
    await waitFor(() => expect(heading()).toHaveTextContent('Sunday, October 25'));
  });
});

describe('routines and weekdays', () => {
  const routine = (id: string, text: string, active: boolean) => ({
    id,
    text,
    active,
    createdAt: '2026-09-01T00:00:00.000Z',
  });

  it('lists active routines with their percentages and folds stopped ones away', () => {
    start(SPEC, [routine('r1', 'Stretch', true), routine('r2', 'Cold shower', false)]);
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    for (const [offset, id, done] of [
      [1, 'r1', true],
      [2, 'r1', false],
      [10, 'r2', true],
    ] as const) {
      data.days[ago(offset)].tasks.push({
        id: `${id}-${offset}`,
        text: id,
        routineId: id,
        createdAt: '2026-10-01T00:00:00.000Z',
        order: 50,
        ...(done && { doneAt: '2026-10-01T10:00:00.000Z' }),
      });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    dispose();
    dispose = app.init();

    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    const active = document.querySelector<HTMLElement>('.routines > .routine')!;
    expect(active).toHaveTextContent('Stretch');
    expect(active).toHaveTextContent('50%');
    expect(active).toHaveTextContent('1 of 2 done');
    expect(
      within(active).getByRole('img', { name: /Last 14 days: 1 done, 1 missed/ }),
    ).toBeTruthy();
    const folded = screen.getByText('Stopped (1)').closest('details')!;
    expect(folded).not.toHaveAttribute('open');
    expect(folded).toHaveTextContent('Cold shower');
    expect(folded).toHaveTextContent('100%');
  });

  it('draws the weekdays from the week start', () => {
    start();
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    const table = screen.getByRole('table', { name: 'Average tasks done per weekday' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('th')!.textContent);
    expect(names).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});

describe('the empty state', () => {
  it('invites you to check off a task, and shows the charts as faint outlines', () => {
    start({ 0: [0, 2] });
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    expect(screen.getByText('Check off a task and your stats will start here')).toBeInTheDocument();
    expect(document.querySelector('.content')).toHaveClass('ghost');
    expect(tile('Done')).toHaveTextContent('0');
  });

  it('is not shown once something has been done', () => {
    start();
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    expect(screen.queryByText(/stats will start here/)).toBeNull();
    expect(document.querySelector('.content')).not.toHaveClass('ghost');
  });

  it('works with no data at all', () => {
    start(null);
    render(StatsView, { onclose: vi.fn(), onopen: vi.fn() });
    expect(tile('Longest streak')).toHaveTextContent('0');
  });
});
