import { findTask, getDay, putDay } from '$lib/model/tasks';
import type { AppData, DateKey, Routine, Task } from '$lib/model/types';

/**
 * Creates the day the first time it is opened, with one fresh undone task per active routine.
 * An existing day is returned untouched, so a routine task deleted today stays deleted, and
 * missed days are never filled in.
 */
export function ensureDay(data: AppData, key: DateKey, now: Date): AppData {
  if (data.days[key]) return data;
  const tasks: Task[] = data.routines
    .filter((r) => r.active)
    .map((r, order) => ({
      id: crypto.randomUUID(),
      text: r.text,
      routineId: r.id,
      createdAt: now.toISOString(),
      order,
    }));
  return putDay(data, { date: key, tasks });
}

function updateRoutine(data: AppData, id: string, update: (r: Routine) => Routine): AppData {
  if (!data.routines.some((r) => r.id === id)) throw new Error(`Routine not found: ${id}`);
  return { ...data, routines: data.routines.map((r) => (r.id === id ? update(r) : r)) };
}

/**
 * Turns a task into a routine and links it with `routineId`. A task that already belongs to a
 * routine just reactivates it, so there is never a second routine for the same task.
 */
export function makeRoutine(data: AppData, key: DateKey, taskId: string, now: Date): AppData {
  const day = getDay(data, key);
  const task = findTask(day, taskId);
  if (task.routineId !== undefined) {
    return updateRoutine(data, task.routineId, (r) => ({ ...r, active: true }));
  }
  const routine: Routine = {
    id: crypto.randomUUID(),
    text: task.text,
    active: true,
    createdAt: now.toISOString(),
  };
  const linked = {
    ...day,
    tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, routineId: routine.id } : t)),
  };
  return putDay({ ...data, routines: [...data.routines, routine] }, linked);
}

/** Past instances keep their `routineId`; only future days are affected. */
export function stopRoutine(data: AppData, routineId: string): AppData {
  return updateRoutine(data, routineId, (r) => ({ ...r, active: false }));
}

/** Future days get the new text. Existing tasks, past or present, keep theirs. */
export function renameRoutine(data: AppData, routineId: string, text: string): AppData {
  return updateRoutine(data, routineId, (r) => ({ ...r, text }));
}
