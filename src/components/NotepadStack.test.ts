import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '$lib/store/app.svelte';
import { STORAGE_KEY } from '$lib/store/persist';
import { busy } from '$lib/ui/busy.svelte';
import { toasts } from '$lib/ui/toast.svelte';
import NotepadStack from './NotepadStack.svelte';

/** Days with a page, as offsets before 2026-10-25. Offsets 3 and 4 are missed days. */
const OFFSETS = [0, 1, 2, 5, 6, 7];
const keyOf = (offset: number) =>
  new Date(Date.UTC(2026, 9, 25 - offset)).toISOString().slice(0, 10);

function seed() {
  const days = Object.fromEntries(
    OFFSETS.map((offset) => {
      const key = keyOf(offset);
      const tasks = [
        { id: `${key}-a`, text: `open ${key}`, createdAt: `${key}T08:00:00.000Z`, order: 0 },
        {
          id: `${key}-b`,
          text: `finished ${key}`,
          createdAt: `${key}T08:01:00.000Z`,
          order: 1,
          doneAt: `${key}T09:00:00.000Z`,
        },
      ];
      return [key, { date: key, tasks }];
    }),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, routines: [], days }));
}

let dispose: () => void;
let stack: ReturnType<typeof render<typeof NotepadStack>>;

const settle = async () => {
  for (let i = 0; i < 12; i++) await tick();
};
const heading = () => screen.getByRole('heading', { level: 1 });
const sheets = () => [...document.querySelectorAll<HTMLElement>('.sheet')];
const current = () => document.querySelector<HTMLElement>('.sheet[data-role="current"]')!;
const older = () => screen.getByRole('button', { name: 'Older ›' });
const newer = () => screen.getByRole('button', { name: '‹ Newer' });
const flipButton = () => screen.getByRole('button', { name: /^Show (done|to-do) list$/ });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
  seed();
  dispose = app.init();
  stack = render(NotepadStack);
});

afterEach(() => {
  toasts.clear();
  busy.reset();
  dispose();
  vi.useRealTimers();
});

describe('the pages that exist', () => {
  it('starts on today with the older page waiting underneath, as a labelled region', () => {
    expect(screen.getByRole('region', { name: 'Notepad' })).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Sunday, October 25');
    expect(sheets().map((s) => [s.dataset.key, s.dataset.role])).toEqual([
      ['2026-10-25', 'current'],
      ['2026-10-24', 'older'],
    ]);
  });

  it('never renders more than three pages, however many days there are', async () => {
    for (let i = 0; i < OFFSETS.length - 1; i++) {
      await fireEvent.click(older());
      await settle();
      expect(sheets().length).toBeLessThanOrEqual(3);
    }
    expect(heading()).toHaveTextContent('Sunday, October 18');
    expect(sheets()).toHaveLength(2); // the oldest page has nothing under it
  });

  it('keeps pages that are not on top out of reach', async () => {
    await fireEvent.click(older());
    await settle();
    expect(sheets()).toHaveLength(3);
    for (const sheet of sheets()) {
      const onTop = sheet.dataset.role === 'current';
      expect(sheet.hasAttribute('inert')).toBe(!onTop);
      expect(sheet.getAttribute('aria-hidden')).toBe(onTop ? null : 'true');
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('turning pages', () => {
  it('turns with the Older and Newer buttons', async () => {
    expect(newer()).toBeDisabled();
    await fireEvent.click(older());
    await settle();
    expect(heading()).toHaveTextContent('Saturday, October 24');
    expect(newer()).toBeEnabled();
    await fireEvent.click(newer());
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('turns with Alt+ArrowDown (older) and Alt+ArrowUp (newer)', async () => {
    await fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true });
    await settle();
    expect(heading()).toHaveTextContent('Saturday, October 24');
    await fireEvent.keyDown(document.body, { key: 'ArrowUp', altKey: true });
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('ignores the arrow keys without Alt, and Alt combined with other modifiers', async () => {
    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true, ctrlKey: true });
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('does not turn while something holds the page (a drag, an edit, a menu)', async () => {
    const release = busy.hold();
    await fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true });
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
    release();
  });

  it('announces the new page and moves focus to its heading', async () => {
    await fireEvent.click(older());
    await settle();
    expect(screen.getByText('Saturday, October 24 · Yesterday · read-only')).toBeInTheDocument();
    expect(heading()).toHaveFocus();
  });

  it('adds how many days were skipped to the announcement', async () => {
    for (let i = 0; i < 3; i++) {
      await fireEvent.click(older());
      await settle();
    }
    expect(heading()).toHaveTextContent('Tuesday, October 20');
    expect(
      screen.getByText('Tuesday, October 20 · 5 days ago · read-only, 2 days skipped'),
    ).toBeInTheDocument();
  });
});

describe('past pages', () => {
  beforeEach(async () => {
    await fireEvent.click(older());
    await settle();
  });

  it('are read-only: no new-task field, no handles, no menu, disabled checkboxes', () => {
    const page = within(current());
    expect(page.queryByLabelText('New task')).not.toBeInTheDocument();
    expect(page.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
    expect(page.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(page.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true);
    expect(page.getByRole('img', { name: 'Read-only' })).toBeInTheDocument();
  });

  it('say how long ago they are', () => {
    expect(within(current()).getAllByText(/Yesterday/).length).toBeGreaterThan(0);
  });

  it('offer Copy to today on unfinished tasks, and copying adds a task to today', async () => {
    const copy = within(current()).getByRole('button', { name: 'Copy to today' });
    await fireEvent.click(copy);
    const todayTexts = app.todayDay.tasks.map((t) => t.text);
    expect(todayTexts).toEqual(['open 2026-10-25', 'finished 2026-10-25', 'open 2026-10-24']);
    expect(app.day('2026-10-24')!.tasks).toHaveLength(2);
  });

  it('show a Today button, which returns to today and goes away', async () => {
    await fireEvent.click(within(current()).getByRole('button', { name: 'Today' }));
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });
});

describe('missed days', () => {
  it('are skipped, with a note on the page below the gap', async () => {
    await fireEvent.click(older()); // 24
    await settle();
    await fireEvent.click(older()); // 23
    await settle();
    expect(within(current()).queryByText(/skipped/)).not.toBeInTheDocument();
    await fireEvent.click(older()); // 20: the 21st and 22nd have no page
    await settle();
    expect(heading()).toHaveTextContent('Tuesday, October 20');
    expect(within(current()).getAllByText('2 days skipped').length).toBeGreaterThan(0);
  });
});

describe('each page remembers its side', () => {
  it('while it is off screen and again when it is back', async () => {
    await fireEvent.click(older());
    await settle();
    await fireEvent.click(flipButton());
    await settle();
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(newer());
    await settle();
    expect(flipButton()).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(older());
    await settle();
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('even after the page was removed from the screen entirely', async () => {
    await fireEvent.click(older());
    await settle();
    await fireEvent.click(flipButton());
    await settle();
    for (let i = 0; i < 3; i++) {
      await fireEvent.click(older());
      await settle();
    }
    for (let i = 0; i < 3; i++) {
      await fireEvent.click(newer());
      await settle();
    }
    expect(heading()).toHaveTextContent('Saturday, October 24');
    expect(flipButton()).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('goTo', () => {
  it('jumps to a page that is not next door, and back to today', async () => {
    await stack.component.goTo('2026-10-18');
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 18');
    await stack.component.goTo('2026-10-25');
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });

  it('turns to an adjacent page like the buttons do', async () => {
    await stack.component.goTo('2026-10-24');
    await settle();
    expect(heading()).toHaveTextContent('Saturday, October 24');
  });

  it('lands on the nearest page when the day has none', async () => {
    await stack.component.goTo('2026-10-22'); // a missed day: 23rd is one away, 20th is two
    await settle();
    expect(heading()).toHaveTextContent('Friday, October 23');
  });

  it('does nothing for the page it is already on', async () => {
    await stack.component.goTo('2026-10-25');
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });
});

describe('a new day while the app is open', () => {
  const midnight = async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 0, 0, 30));
    app.tick();
    await settle();
  };

  it('on today: lays the new day on top and says so, and yesterday becomes read-only', async () => {
    await midnight();
    expect(toasts.items.map((t) => t.message)).toContain("It's a new day");
    expect(heading()).toHaveTextContent('Monday, October 26');
    expect(within(current()).getByLabelText('New task')).toBeInTheDocument();

    await fireEvent.click(older());
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
    expect(within(current()).queryByLabelText('New task')).not.toBeInTheDocument();
  });

  it('on a past page: stays where you are, and Today leads to the new day', async () => {
    await fireEvent.click(older());
    await settle();
    await midnight();
    expect(heading()).toHaveTextContent('Saturday, October 24');
    expect(toasts.items.map((t) => t.message)).not.toContain("It's a new day");

    await fireEvent.click(within(current()).getByRole('button', { name: 'Today' }));
    await settle();
    expect(heading()).toHaveTextContent('Monday, October 26');
  });
});

describe('the Back button', () => {
  it('adds one history entry for any number of peels, and removes it on return', async () => {
    const before = history.length;
    await fireEvent.click(older());
    await settle();
    await fireEvent.click(older());
    await settle();
    expect(history.length).toBe(before + 1);
    expect(history.state).toEqual({ flipside: 'past' });
    await fireEvent.click(within(current()).getByRole('button', { name: 'Today' }));
    await settle();
    expect(heading()).toHaveTextContent('Sunday, October 25');
  });
});
