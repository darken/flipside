import type { AppData, DateKey, Day, Task } from './types';

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = 'TaskNotFoundError';
  }
}

export class EmptyTextError extends Error {
  constructor() {
    super('Task text is empty');
    this.name = 'EmptyTextError';
  }
}

/**
 * Keeps newlines as-is, but drops blank lines at the start and end and trailing whitespace.
 * Returns null when nothing is left.
 */
export function normalizeText(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  const result = lines.join('\n').trimEnd();
  return result === '' ? null : result;
}

export function getDay(data: AppData, key: DateKey): Day {
  return data.days[key] ?? { date: key, tasks: [] };
}

export function putDay(data: AppData, day: Day): AppData {
  return { ...data, days: { ...data.days, [day.date]: day } };
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Undone tasks, in the order the user arranged them. */
export function todoTasks(day: Day): Task[] {
  return day.tasks.filter((t) => !t.doneAt).sort(byOrder);
}

/** Done tasks, most recently finished first. */
export function doneTasks(day: Day): Task[] {
  return day.tasks
    .filter((t) => t.doneAt)
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!) || byOrder(a, b));
}

export function findTask(day: Day, id: string): Task {
  const task = day.tasks.find((t) => t.id === id);
  if (!task) throw new TaskNotFoundError(id);
  return task;
}

function nextTodoOrder(day: Day): number {
  const todo = todoTasks(day);
  return todo.length === 0 ? 0 : todo[todo.length - 1]!.order + 1;
}

function replaceTask(day: Day, id: string, update: (task: Task) => Task): Day {
  findTask(day, id);
  return { ...day, tasks: day.tasks.map((t) => (t.id === id ? update(t) : t)) };
}

/** Adds an undone task at the end of the todo list. Throws EmptyTextError for blank text. */
export function addTask(
  day: Day,
  text: string,
  now: Date,
  routineId?: string,
): { day: Day; task: Task } {
  const clean = normalizeText(text);
  if (clean === null) throw new EmptyTextError();
  const task: Task = {
    id: crypto.randomUUID(),
    text: clean,
    createdAt: now.toISOString(),
    order: nextTodoOrder(day),
    ...(routineId !== undefined && { routineId }),
  };
  return { day: { ...day, tasks: [...day.tasks, task] }, task };
}

export function editTask(day: Day, id: string, text: string): Day {
  const clean = normalizeText(text);
  if (clean === null) throw new EmptyTextError();
  return replaceTask(day, id, (t) => ({ ...t, text: clean }));
}

export function deleteTask(day: Day, id: string): Day {
  findTask(day, id);
  return { ...day, tasks: day.tasks.filter((t) => t.id !== id) };
}

/** Checking sets `doneAt`. Unchecking clears it and puts the task at the end of the todo list. */
export function setDone(day: Day, id: string, done: boolean, now: Date): Day {
  return replaceTask(day, id, (task) => {
    if (done) return task.doneAt ? task : { ...task, doneAt: now.toISOString() };
    if (!task.doneAt) return task;
    const next = { ...task, order: nextTodoOrder(day) };
    delete next.doneAt;
    return next;
  });
}

/**
 * Moves a task to `toIndex` within its own list (todo or done), then renumbers `order` for
 * that list. The index is clamped. The done list is displayed by `doneAt`, so moving there
 * does not change what is shown.
 */
export function moveTask(day: Day, id: string, toIndex: number): Day {
  const task = findTask(day, id);
  const list = task.doneAt ? doneTasks(day) : todoTasks(day);
  const from = list.findIndex((t) => t.id === id);
  const to = Math.max(0, Math.min(list.length - 1, Math.trunc(toIndex)));
  list.splice(to, 0, ...list.splice(from, 1));
  const orders = new Map(list.map((t, i) => [t.id, i]));
  return {
    ...day,
    tasks: day.tasks.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id)! } : t)),
  };
}

/**
 * Adds a new one-off copy of a task to today's page. The source day is left unchanged and the
 * copy is not linked to any routine.
 */
export function copyToToday(
  data: AppData,
  fromKey: DateKey,
  taskId: string,
  today: DateKey,
  now: Date,
): { data: AppData; task: Task } {
  const source = findTask(getDay(data, fromKey), taskId);
  const { day, task } = addTask(getDay(data, today), source.text, now);
  return { data: putDay(data, day), task };
}
