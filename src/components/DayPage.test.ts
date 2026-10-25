import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doneTasks, todoTasks } from '$lib/model/tasks';
import { app } from '$lib/store/app.svelte';
import { busy } from '$lib/ui/busy.svelte';
import { NEW_DAY_MESSAGE } from '$lib/ui/guarded';
import { toasts } from '$lib/ui/toast.svelte';
import App from '../App.svelte';
import { newPageMemory } from '$lib/ui/page-memory';
import DayPage from './DayPage.svelte';

const noNav = {
  hasNewer: false,
  hasOlder: false,
  onNewer: () => {},
  onOlder: () => {},
  onToday: () => {},
};
/** Lets the notepad finish turning to a new page (animations are skipped in jsdom). */
const settleStack = async () => {
  for (let i = 0; i < 10; i++) await tick();
};
const T1 = '2026-10-25';
const T2 = '2026-10-26';
let dispose: () => void;

const todoTexts = () => todoTasks(app.todayDay).map((t) => t.text);
const field = () => screen.getByLabelText('New task') as HTMLTextAreaElement;

async function type(text: string) {
  await fireEvent.input(field(), { target: { value: text } });
}
async function addTask(text: string) {
  await type(text);
  await fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
}
async function openMenu(text: string) {
  await fireEvent.click(screen.getByRole('button', { name: `Actions for: ${text}` }));
  return screen.getByRole('dialog', { name: 'Task actions' });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
  dispose = app.init();
});

afterEach(() => {
  toasts.clear();
  busy.reset();
  dispose();
  vi.useRealTimers();
});

describe('adding tasks', () => {
  it('shows an empty page with a hint', () => {
    render(App);
    expect(screen.getByText('A fresh page. What’s first?')).toBeInTheDocument();
    expect(field()).toHaveAttribute('placeholder', 'Write a task…');
  });

  it('adds a multi-line task with the Add button and clears the field', async () => {
    render(App);
    await addTask('call mum\nabout the visit\n\n');
    expect(todoTexts()).toEqual(['call mum\nabout the visit']);
    expect(field().value).toBe('');
    expect(screen.queryByText('A fresh page. What’s first?')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('keeps focus in the field so the next task can be typed', async () => {
    render(App);
    field().focus();
    await addTask('one');
    expect(field()).toHaveFocus();
  });

  it('adds with Cmd+Enter and Ctrl+Enter, but plain Enter only makes a new line', async () => {
    render(App);
    await type('one');
    await fireEvent.keyDown(field(), { key: 'Enter' });
    expect(todoTexts()).toEqual([]);
    await fireEvent.keyDown(field(), { key: 'Enter', metaKey: true });
    await type('two');
    await fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    expect(todoTexts()).toEqual(['one', 'two']);
  });

  it('ignores blank text', async () => {
    render(App);
    await type('  \n ');
    await fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(todoTexts()).toEqual([]);
    expect(field().value).toBe('  \n ');
  });

  it('clears the field on Escape', async () => {
    render(App);
    await type('never mind');
    await fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field().value).toBe('');
    expect(todoTexts()).toEqual([]);
  });

  it('adds a routine straight away with the routine toggle', async () => {
    render(App);
    const toggle = screen.getByRole('button', { name: 'Add as routine' });
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await addTask('Stretch');
    expect(app.data.routines.map((r) => r.text)).toEqual(['Stretch']);
    expect(screen.getByRole('img', { name: 'Routine' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('editing', () => {
  async function startEdit(text: string) {
    await fireEvent.click(screen.getByRole('button', { name: text }));
    return screen.getByLabelText('Edit task') as HTMLTextAreaElement;
  }

  it('edits in place and saves with Cmd+Enter', async () => {
    app.add(T1, 'buy milk');
    render(App);
    const box = await startEdit('buy milk');
    expect(box.value).toBe('buy milk');
    await fireEvent.input(box, { target: { value: 'buy oat milk\nand bread' } });
    await fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    expect(todoTexts()).toEqual(['buy oat milk\nand bread']);
    expect(screen.queryByLabelText('Edit task')).not.toBeInTheDocument();
  });

  it('saves when the field loses focus', async () => {
    app.add(T1, 'buy milk');
    render(App);
    const box = await startEdit('buy milk');
    await fireEvent.input(box, { target: { value: 'buy tea' } });
    await fireEvent.blur(box);
    expect(todoTexts()).toEqual(['buy tea']);
  });

  it('cancels on Escape', async () => {
    app.add(T1, 'buy milk');
    render(App);
    const box = await startEdit('buy milk');
    await fireEvent.input(box, { target: { value: 'changed' } });
    await fireEvent.keyDown(box, { key: 'Escape' });
    await fireEvent.blur(box);
    expect(todoTexts()).toEqual(['buy milk']);
  });

  it('cancels when the text is blank', async () => {
    app.add(T1, 'buy milk');
    render(App);
    const box = await startEdit('buy milk');
    await fireEvent.input(box, { target: { value: '  ' } });
    await fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(todoTexts()).toEqual(['buy milk']);
  });

  it('renames the routine when a routine task is edited, with a hint', async () => {
    const task = app.add(T1, 'Stretch')!;
    app.setRoutine(T1, task.id, true);
    render(App);
    const box = await startEdit('Stretch');
    expect(screen.getByText('Also updates the routine for future days')).toBeInTheDocument();
    await fireEvent.input(box, { target: { value: 'Stretch 10 min' } });
    await fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    expect(app.data.routines[0]!.text).toBe('Stretch 10 min');
  });

  it('shows no routine hint for a one-off task', async () => {
    app.add(T1, 'buy milk');
    render(App);
    await startEdit('buy milk');
    expect(screen.queryByText(/updates the routine/)).not.toBeInTheDocument();
  });
});

describe('checking off', () => {
  it('moves a task to the done side and back', async () => {
    app.add(T1, 'buy milk');
    render(App);
    const box = screen.getByRole('checkbox', { name: 'buy milk' });
    await fireEvent.click(box);
    expect(todoTasks(app.todayDay)).toEqual([]);
    expect(doneTasks(app.todayDay).map((t) => t.text)).toEqual(['buy milk']);
    expect(screen.getByRole('button', { name: 'Show done list' })).toHaveTextContent('Done (1)');

    await fireEvent.click(screen.getByRole('button', { name: 'Show done list' }));
    expect(screen.getByText('1 done today')).toBeInTheDocument();
    const doneBox = screen.getByRole('checkbox', { name: 'buy milk' });
    expect(doneBox).toBeChecked();
    expect(screen.getByText(/\d:\d\d/)).toBeInTheDocument();

    await fireEvent.click(doneBox);
    expect(todoTexts()).toEqual(['buy milk']);
    expect(screen.getByText('Nothing done yet')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Show to-do list' }));
    expect(screen.getByRole('checkbox', { name: 'buy milk' })).not.toBeChecked();
  });

  it('says so when everything is done', async () => {
    const t = app.add(T1, 'only one')!;
    app.toggleDone(T1, t.id);
    render(App);
    expect(screen.getByText('Everything’s done. Anything else?')).toBeInTheDocument();
  });
});

describe('the task menu', () => {
  it('turns the routine flag on and off', async () => {
    app.add(T1, 'Stretch');
    render(App);
    let menu = await openMenu('Stretch');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Make routine' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.data.routines).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Routine' })).toBeInTheDocument();

    menu = await openMenu('Stretch');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Stop routine' }));
    expect(app.data.routines[0]!.active).toBe(false);
    expect(screen.queryByRole('img', { name: 'Routine' })).not.toBeInTheDocument();
  });

  it('moves a task up and down, announcing the new position', async () => {
    for (const text of ['a', 'b', 'c']) app.add(T1, text);
    render(App);
    let menu = await openMenu('a');
    expect(within(menu).getByRole('button', { name: 'Move up' })).toBeDisabled();
    await fireEvent.click(within(menu).getByRole('button', { name: 'Move down' }));
    expect(todoTexts()).toEqual(['b', 'a', 'c']);
    expect(screen.getByText('Moved to position 2 of 3')).toBeInTheDocument();

    menu = await openMenu('a');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Move up' }));
    expect(todoTexts()).toEqual(['a', 'b', 'c']);

    menu = await openMenu('c');
    expect(within(menu).getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  it('deletes with a toast, and Undo puts the task back', async () => {
    for (const text of ['a', 'b', 'c']) app.add(T1, text);
    render(App);
    const menu = await openMenu('b');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Delete' }));
    expect(todoTexts()).toEqual(['a', 'c']);
    expect(screen.getByText('Task deleted')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(todoTexts()).toEqual(['a', 'b', 'c']);
    expect(screen.queryByText('Task deleted')).not.toBeInTheDocument();
  });

  it('removes the delete toast after about 5 seconds', async () => {
    app.add(T1, 'a');
    render(App);
    const menu = await openMenu('a');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Delete' }));
    vi.advanceTimersByTime(5000);
    await tick();
    expect(screen.queryByText('Task deleted')).not.toBeInTheDocument();
    expect(todoTexts()).toEqual([]);
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    app.add(T1, 'a');
    render(App);
    const opener = screen.getByRole('button', { name: 'Actions for: a' });
    const menu = await openMenu('a');
    expect(within(menu).getByRole('button', { name: 'Make routine' })).toHaveFocus();
    await fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the menu', async () => {
    app.add(T1, 'a');
    app.add(T1, 'b');
    render(App);
    const menu = await openMenu('b');
    const buttons = within(menu).getAllByRole('button');
    const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
    enabled[enabled.length - 1]!.focus();
    await fireEvent.keyDown(menu, { key: 'Tab' });
    expect(enabled[0]).toHaveFocus();
    await fireEvent.keyDown(menu, { key: 'Tab', shiftKey: true });
    expect(enabled[enabled.length - 1]).toHaveFocus();
  });

  it('closes when the backdrop is tapped', async () => {
    app.add(T1, 'a');
    render(App);
    await openMenu('a');
    await fireEvent.click(document.querySelector('.backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('reordering with the keyboard', () => {
  const handle = (text: string) =>
    screen.getByRole('button', { name: new RegExp(`^Reorder: ${text}`) });

  it('picks up with Enter, moves with the arrows and drops with Enter', async () => {
    for (const text of ['a', 'b', 'c']) app.add(T1, text);
    render(App);
    await fireEvent.keyDown(handle('a'), { key: 'ArrowDown' });
    expect(todoTexts()).toEqual(['a', 'b', 'c']); // not picked up yet

    await fireEvent.keyDown(handle('a'), { key: 'Enter' });
    expect(handle('a')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.keyDown(handle('a'), { key: 'ArrowDown' });
    await fireEvent.keyDown(handle('a'), { key: 'ArrowDown' });
    await fireEvent.keyDown(handle('a'), { key: 'ArrowDown' }); // already last
    expect(todoTexts()).toEqual(['b', 'c', 'a']);
    expect(screen.getByText('Moved to position 3 of 3')).toBeInTheDocument();

    await fireEvent.keyDown(handle('a'), { key: 'ArrowUp' });
    expect(todoTexts()).toEqual(['b', 'a', 'c']);

    await fireEvent.keyDown(handle('a'), { key: 'Enter' });
    expect(screen.getByText('Dropped at position 2 of 3')).toBeInTheDocument();
    await fireEvent.keyDown(handle('a'), { key: 'ArrowUp' });
    expect(todoTexts()).toEqual(['b', 'a', 'c']);
  });

  it('puts the task down on Escape', async () => {
    app.add(T1, 'a');
    app.add(T1, 'b');
    render(App);
    await fireEvent.keyDown(handle('a'), { key: ' ' });
    await fireEvent.keyDown(handle('a'), { key: 'Escape' });
    expect(handle('a')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('read-only pages', () => {
  function yesterdayPage() {
    const oneOff = app.add(T1, 'unfinished one-off')!;
    const routine = app.add(T1, 'Stretch')!;
    app.setRoutine(T1, routine.id, true);
    const finished = app.add(T1, 'finished')!;
    app.toggleDone(T1, finished.id);
    vi.setSystemTime(new Date(2026, 9, 26, 8, 0, 0));
    app.tick();
    return { oneOff, routine, finished };
  }

  it('has no edit controls, and Copy to today only on unfinished one-offs', async () => {
    yesterdayPage();
    render(DayPage, { key: T1, memory: newPageMemory(), nav: noNav });
    expect(screen.queryByLabelText('New task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(
      true,
    );
    // Text is not an edit button.
    expect(screen.queryByRole('button', { name: 'unfinished one-off' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy to today' })).toHaveLength(1);
  });

  it('copies an unfinished task to today and leaves the old page alone', async () => {
    yesterdayPage();
    render(DayPage, { key: T1, memory: newPageMemory(), nav: noNav });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to today' }));
    expect(todoTexts()).toEqual(['Stretch', 'unfinished one-off']);
    expect(todoTasks(app.day(T1)!).map((t) => t.text)).toEqual(['unfinished one-off', 'Stretch']);
  });

  it('shows the done side without uncheck controls', async () => {
    yesterdayPage();
    render(DayPage, { key: T1, memory: newPageMemory(), nav: noNav });
    await fireEvent.click(screen.getByRole('button', { name: 'Show done list' }));
    expect(screen.getByText('1 done')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'finished' })).toBeDisabled();
  });
});

describe('midnight', () => {
  it('turns a change on a stale page into a notice, and the page moves to today', async () => {
    const stretch = app.add(T1, 'Stretch')!;
    app.setRoutine(T1, stretch.id, true);
    render(App);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunday, October 25');

    vi.setSystemTime(new Date(2026, 9, 26, 0, 0, 10)); // the minute timer has not fired yet
    await type('too late');
    await fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText(NEW_DAY_MESSAGE)).toBeInTheDocument();
    await settleStack();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Monday, October 26');
    expect(todoTexts()).toEqual(['Stretch']);
    expect(app.day(T1)!.tasks).toHaveLength(1);
    expect(app.today).toBe(T2);
  });
});

describe('flipping', () => {
  const face = (name: 'todo' | 'done') => document.querySelector(`[data-face="${name}"]`)!;
  const flipButton = () => screen.getByRole('button', { name: /^Show (done|to-do) list$/ });

  it('turns the page with the flip button and labels it for the other side', async () => {
    app.add(T1, 'a');
    render(App);
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');
    expect(flipButton()).toHaveAccessibleName('Show done list');
    expect(flipButton()).toHaveTextContent('Done (0)');

    await fireEvent.click(flipButton());
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
    expect(flipButton()).toHaveAccessibleName('Show to-do list');
    expect(flipButton()).toHaveTextContent('To do (1)');
    expect(face('done')).not.toHaveAttribute('inert');

    await fireEvent.click(flipButton());
    expect(flipButton()).toHaveTextContent('Done (0)');
  });

  it('hides the face that is turned away from keyboards and screen readers', async () => {
    render(App);
    expect(face('done')).toHaveAttribute('inert');
    expect(face('done')).toHaveAttribute('aria-hidden', 'true');
    expect(face('todo')).not.toHaveAttribute('inert');
    expect(face('todo')).not.toHaveAttribute('aria-hidden');

    await fireEvent.click(flipButton());
    expect(face('todo')).toHaveAttribute('inert');
    expect(face('todo')).toHaveAttribute('aria-hidden', 'true');
    expect(face('done')).not.toHaveAttribute('inert');
    expect(face('done')).not.toHaveAttribute('aria-hidden');
    // Only the visible face is in the accessibility tree.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('moves focus to the new face’s heading and announces the list', async () => {
    const task = app.add(T1, 'a')!;
    app.add(T1, 'b');
    app.toggleDone(T1, task.id);
    render(App);
    await fireEvent.click(flipButton());
    expect(face('done').querySelector('h1')).toHaveFocus();
    expect(screen.getByText('Done list, 1 task')).toBeInTheDocument();

    await fireEvent.click(flipButton());
    expect(face('todo').querySelector('h1')).toHaveFocus();
    expect(screen.getByText('To do list, 1 task')).toBeInTheDocument();
  });

  it('flips with the F key, but not while typing or with a modifier', async () => {
    render(App);
    await type('hello');
    await fireEvent.keyDown(field(), { key: 'f' });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    await fireEvent.keyDown(document.body, { key: 'f', metaKey: true });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.keyDown(document.body, { key: 'F' });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.keyDown(document.body, { key: 'f' });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not flip with F while a drag, edit or menu holds the page', async () => {
    render(App);
    const release = busy.hold();
    await fireEvent.keyDown(document.body, { key: 'f' });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');
    release();
    await fireEvent.keyDown(document.body, { key: 'f' });
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('holds the page while a task is being edited or its menu is open', async () => {
    app.add(T1, 'a');
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(busy.active).toBe(true);
    await fireEvent.keyDown(screen.getByLabelText('Edit task'), { key: 'Escape' });
    expect(busy.active).toBe(false);

    await openMenu('a');
    expect(busy.active).toBe(true);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(busy.active).toBe(false);
  });

  it('starts each new day on the front', async () => {
    render(App);
    await fireEvent.click(flipButton());
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
    vi.setSystemTime(new Date(2026, 9, 26, 8, 0, 0));
    app.tick();
    await settleStack();
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('turning over by itself', () => {
  const flipButton = () => screen.getByRole('button', { name: /^Show (done|to-do) list$/ });
  const onBack = () => flipButton().getAttribute('aria-pressed') === 'true';
  const settle = async () => {
    vi.advanceTimersByTime(400);
    await tick();
  };

  it('turns the page and stamps it when the last open task is checked off', async () => {
    app.add(T1, 'only one');
    render(App);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' }));
    expect(onBack()).toBe(false); // waits for the check-off animation
    await settle();
    expect(onBack()).toBe(true);
    expect(screen.getByText('All done ✓')).toBeInTheDocument();
  });

  it('does not turn while other tasks are open', async () => {
    app.add(T1, 'one');
    app.add(T1, 'two');
    render(App);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'one' }));
    await settle();
    expect(onBack()).toBe(false);
  });

  it('does not turn when the last task is deleted', async () => {
    app.add(T1, 'only one');
    render(App);
    const menu = await openMenu('only one');
    await fireEvent.click(within(menu).getByRole('button', { name: 'Delete' }));
    await settle();
    expect(onBack()).toBe(false);
    expect(screen.queryByText('All done ✓')).not.toBeInTheDocument();
  });

  it('does not turn if the task was unchecked again in the meantime', async () => {
    app.add(T1, 'only one');
    render(App);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' }));
    await fireEvent.click(flipButton()); // look at the back…
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' })); // …take it back…
    await fireEvent.click(flipButton()); // …and return to the list
    await settle();
    expect(onBack()).toBe(false);
  });

  it('only turns once, however often the list is finished', async () => {
    app.add(T1, 'only one');
    render(App);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' }));
    await settle();
    expect(onBack()).toBe(true);

    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' })); // uncheck on the back
    await fireEvent.click(flipButton()); // back to the front
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' })); // finish again
    await settle();
    expect(onBack()).toBe(false);
  });

  it('does not turn while something else holds the page', async () => {
    app.add(T1, 'only one');
    render(App);
    const release = busy.hold();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'only one' }));
    await settle();
    expect(onBack()).toBe(false);
    release();
  });
});
