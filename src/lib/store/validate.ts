import { isValidKey } from '$lib/model/dates';
import { normalizeText } from '$lib/model/tasks';
import { CURRENT_VERSION } from '$lib/model/types';
import type { AppData, Day, Routine, Task } from '$lib/model/types';

export type ParseResult =
  { ok: true; data: AppData; dropped: number } | { ok: false; error: string };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isTimestamp = (v: unknown): v is string =>
  typeof v === 'string' && TIMESTAMP.test(v) && !Number.isNaN(Date.parse(v));

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

function parseTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;
  const { id, text, createdAt, order, doneAt, routineId } = raw;
  if (!isId(id) || typeof text !== 'string' || normalizeText(text) === null) return null;
  if (!isTimestamp(createdAt)) return null;
  if (typeof order !== 'number' || !Number.isFinite(order)) return null;
  if (doneAt !== undefined && !isTimestamp(doneAt)) return null;
  if (routineId !== undefined && !isId(routineId)) return null;
  return {
    id,
    text,
    createdAt,
    order,
    ...(doneAt !== undefined && { doneAt }),
    ...(routineId !== undefined && { routineId }),
  };
}

function parseRoutine(raw: unknown): Routine | null {
  if (!isRecord(raw)) return null;
  const { id, text, active, createdAt } = raw;
  if (!isId(id) || typeof text !== 'string' || normalizeText(text) === null) return null;
  if (typeof active !== 'boolean' || !isTimestamp(createdAt)) return null;
  return { id, text, active, createdAt };
}

/**
 * Checks an unknown value (parsed JSON from storage or an imported file) and rebuilds it as
 * AppData. Unknown fields are ignored and unrecognisable tasks, routines and days are dropped
 * (and counted). Fails only when the file as a whole is not usable.
 */
export function parseAppData(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: 'Not a Flipside data file' };
  if (raw.version !== CURRENT_VERSION) {
    return { ok: false, error: `Unsupported data version: ${String(raw.version)}` };
  }
  if (!isRecord(raw.days)) return { ok: false, error: 'Missing days' };
  if (!Array.isArray(raw.routines)) return { ok: false, error: 'Missing routines' };

  let dropped = 0;

  const routines: Routine[] = [];
  const routineIds = new Set<string>();
  for (const item of raw.routines) {
    const routine = parseRoutine(item);
    if (routine && !routineIds.has(routine.id)) {
      routineIds.add(routine.id);
      routines.push(routine);
    } else {
      dropped++;
    }
  }

  const days: Record<string, Day> = {};
  for (const [key, value] of Object.entries(raw.days)) {
    if (!isValidKey(key) || !isRecord(value) || value.date !== key || !Array.isArray(value.tasks)) {
      dropped++;
      continue;
    }
    const ids = new Set<string>();
    const tasks: Task[] = [];
    for (const item of value.tasks) {
      const task = parseTask(item);
      if (task && !ids.has(task.id)) {
        ids.add(task.id);
        tasks.push(task);
      } else {
        dropped++;
      }
    }
    days[key] = { date: key, tasks };
  }

  return { ok: true, data: { version: CURRENT_VERSION, days, routines }, dropped };
}
