/** Local calendar date as YYYY-MM-DD. */
export type DateKey = string;

export type Task = {
  id: string;
  text: string; // multi-line; keep newlines as-is
  routineId?: string; // set when this task comes from a Routine
  createdAt: string; // ISO timestamp
  doneAt?: string; // set = on the done list
  order: number;
};

export type Day = { date: DateKey; tasks: Task[] };

export type Routine = { id: string; text: string; active: boolean; createdAt: string };

export const CURRENT_VERSION = 1;

export type AppData = {
  version: typeof CURRENT_VERSION;
  days: Record<DateKey, Day>;
  routines: Routine[];
};

export function emptyData(): AppData {
  return { version: CURRENT_VERSION, days: {}, routines: [] };
}
