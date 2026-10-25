import type { Page } from '@playwright/test';

/** Local midnight strings: `offset` days before 2026-10-25. */
export function keyOffset(offset: number, from = '2026-10-25'): string {
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d - offset));
  return date.toISOString().slice(0, 10);
}

/**
 * Seeds saved days before the app loads: today (25 open tasks, so it scrolls), then short pages
 * with a few tasks each, a third of them done. Missing offsets are days with no page.
 */
export async function seedDays(page: Page, offsets: number[] = [0, 1, 2, 5, 6, 7, 8, 9, 12, 13]) {
  const days = offsets.map((offset) => {
    const key = keyOffset(offset);
    const count = offset === 0 ? 25 : 3 + (offset % 4);
    const tasks = Array.from({ length: count }, (_, i) => ({
      id: `${key}-${i}`,
      text: `Task ${i + 1} of ${key}`,
      createdAt: `${key}T08:${String(i).padStart(2, '0')}:00.000Z`,
      order: i,
      ...(i % 3 === 0 &&
        offset > 0 && { doneAt: `${key}T12:${String(i).padStart(2, '0')}:00.000Z` }),
    }));
    return [key, { date: key, tasks }] as const;
  });
  const data = { version: 1, routines: [], days: Object.fromEntries(days) };
  await page.addInitScript((json) => {
    if (!localStorage.getItem('flipside:v1')) localStorage.setItem('flipside:v1', json);
  }, JSON.stringify(data));
}

/**
 * A one-finger drag. Chromium gets real touch input through the DevTools protocol (so the browser's
 * own scrolling takes part, as on Android). WebKit cannot do that, so it gets synthetic touch events.
 */
export async function touchDrag(
  page: Page,
  from: [number, number],
  to: [number, number],
  { ms = 250, steps = 10 }: { ms?: number; steps?: number } = {},
) {
  const isChromium = page.context().browser()?.browserType().name() === 'chromium';
  if (isChromium) {
    const cdp = await page.context().newCDPSession(page);
    const point = (x: number, y: number) => ({ x, y, id: 1 });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(...from)],
    });
    for (let i = 1; i <= steps; i++) {
      await page.waitForTimeout(ms / steps);
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x, y)] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.evaluate(
    async ({ from, to, ms, steps }) => {
      const target = document.elementFromPoint(from[0], from[1])!;
      // WebKit only has the legacy factory; the Touch constructor throws.
      const touch = (x: number, y: number) =>
        (document as unknown as { createTouch: (...a: unknown[]) => Touch }).createTouch(
          window,
          target,
          1,
          x,
          y,
          x,
          y,
        );
      const doc = document as unknown as { createTouchList: (...t: Touch[]) => TouchList };
      const fire = (type: string, x: number, y: number) => {
        const active =
          type === 'touchend' ? doc.createTouchList() : doc.createTouchList(touch(x, y));
        target.dispatchEvent(
          new TouchEvent(type, {
            touches: active as unknown as Touch[],
            targetTouches: active as unknown as Touch[],
            changedTouches: doc.createTouchList(touch(x, y)) as unknown as Touch[],
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      // A real finger also produces pointer events, which the flip listens to.
      const pointer = (type: string, x: number, y: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      pointer('pointerdown', from[0], from[1]);
      fire('touchstart', from[0], from[1]);
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, ms / steps));
        const x = from[0] + ((to[0] - from[0]) * i) / steps;
        const y = from[1] + ((to[1] - from[1]) * i) / steps;
        pointer('pointermove', x, y);
        fire('touchmove', x, y);
      }
      pointer('pointerup', to[0], to[1]);
      fire('touchend', to[0], to[1]);
    },
    { from, to, ms, steps },
  );
}

/**
 * Seeds `count` days of history before today (2026-10-25) for the stats view: a page on most days
 * (every fifth day is missed), a varying number of tasks and one routine.
 */
export async function seedHistory(page: Page, count = 120) {
  const days: Record<string, unknown> = {};
  for (let offset = 0; offset < count; offset++) {
    if (offset > 0 && offset % 5 === 4) continue; // a missed day
    const key = keyOffset(offset);
    const total = 3 + ((offset * 7) % 6);
    const done = offset === 0 ? 2 : (offset * 3) % (total + 1);
    const tasks = Array.from({ length: total }, (_, i) => ({
      id: `${key}-${i}`,
      text: `Task ${i + 1} of ${key}`,
      createdAt: `${key}T08:${String(i).padStart(2, '0')}:00.000Z`,
      order: i,
      ...(i < done && { doneAt: `${key}T12:${String(i).padStart(2, '0')}:00.000Z` }),
    }));
    tasks.push({
      id: `${key}-routine`,
      text: 'Stretch',
      createdAt: `${key}T08:30:00.000Z`,
      order: 99,
      routineId: 'r1',
      ...(offset % 3 !== 0 && { doneAt: `${key}T09:00:00.000Z` }),
    } as (typeof tasks)[number]);
    days[key] = { date: key, tasks };
  }
  const routines = [{ id: 'r1', text: 'Stretch', active: true, createdAt: '2026-01-01T00:00:00Z' }];
  await page.addInitScript(
    (json) => {
      if (!localStorage.getItem('flipside:v1')) localStorage.setItem('flipside:v1', json);
    },
    JSON.stringify({ version: 1, routines, days }),
  );
}
