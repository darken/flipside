import type { AppData, Day, Task } from '$lib/model/types';
import { emptyData } from '$lib/model/types';

let n = 0;

export function task(overrides: Partial<Task> & { text?: string } = {}): Task {
  n++;
  return {
    id: `t${n}`,
    text: `task ${n}`,
    createdAt: `2026-10-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    order: n,
    ...overrides,
  };
}

export const day = (date: string, tasks: Task[] = []): Day => ({ date, tasks });

export function dataWith(days: Day[], routines: AppData['routines'] = []): AppData {
  return {
    ...emptyData(),
    days: Object.fromEntries(days.map((d) => [d.date, d])),
    routines,
  };
}
