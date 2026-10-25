import { isPast, todayKey } from '$lib/model/dates';
import {
  addTask,
  copyToToday,
  deleteTask,
  editTask,
  findTask,
  getDay,
  moveTask,
  normalizeText,
  putDay,
  restoreTask,
  setDone,
} from '$lib/model/tasks';
import { emptyData } from '$lib/model/types';
import type { AppData, DateKey, Day, Task } from '$lib/model/types';
import { assertEditable } from './guard';
import {
  SAVE_DELAY_MS,
  STORAGE_KEY,
  browserStorage,
  createSaver,
  load,
  save,
  type LoadResult,
  type Saver,
  type StorageLike,
} from './persist';
import { ensureDay, makeRoutine, renameRoutine, stopRoutine } from './routines';

const ROLLOVER_CHECK_MS = 60_000;

export type AppStoreOptions = {
  /** Where to save. Defaults to `localStorage` (or none, if the browser blocks it). */
  storage?: StorageLike | null;
  /** The clock. Tests pass a fake one. */
  now?: () => Date;
  saveDelay?: number;
};

export class AppStore {
  data = $state<AppData>(emptyData());
  today = $state<DateKey>(todayKey());
  /** False once a save has failed; the app keeps working from memory. */
  storageOk = $state(true);
  loadStatus = $state<LoadResult['status']>('empty');

  todayDay = $derived<Day>(this.data.days[this.today] ?? { date: this.today, tasks: [] });
  /** Every day that has a page, newest first. */
  dayKeys = $derived(Object.keys(this.data.days).sort().reverse());

  #storage: StorageLike | null = null;
  #saver: Saver | null = null;
  #now: () => Date;
  #options: AppStoreOptions;

  constructor(options: AppStoreOptions = {}) {
    this.#options = options;
    // A plain clock read, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.#now = options.now ?? (() => new Date());
  }

  /** Loads saved data, opens today's page and starts the clock and sync listeners. */
  init(): () => void {
    this.#storage = this.#options.storage === undefined ? browserStorage() : this.#options.storage;
    this.#saver?.dispose();
    this.#saver = createSaver(this.#options.saveDelay ?? SAVE_DELAY_MS, () => this.#write());

    const now = this.#now();
    const loaded = load(this.#storage, now);
    this.loadStatus = loaded.status;
    this.storageOk = loaded.status !== 'unavailable';
    this.today = todayKey(now);
    this.#commit(ensureDay(loaded.data, this.today, now), loaded.data);

    const onVisible = () => {
      if (document.visibilityState === 'visible') this.tick();
    };
    const onStorage = (e: StorageEvent) => {
      const ours = e.storageArea === null || e.storageArea === this.#storage;
      if (ours && (e.key === null || e.key === STORAGE_KEY)) this.#reload();
    };
    const timer = setInterval(() => this.tick(), ROLLOVER_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      this.#saver?.dispose();
      this.#saver = null;
    };
  }

  /** Moves to the new day if the date has changed, opening it with its routine tasks. */
  tick(): void {
    const now = this.#now();
    const key = todayKey(now);
    if (key === this.today) return;
    this.today = key;
    this.#commit(ensureDay(this.data, key, now));
  }

  day(key: DateKey): Day | undefined {
    return this.data.days[key];
  }

  /** Past days are read-only; the UI uses this to hide edit controls. */
  isEditable(key: DateKey): boolean {
    return !isPast(key, this.today);
  }

  /** Returns the new task, or null if the text was blank. */
  add(key: DateKey, text: string): Task | null {
    this.#assertEditable(key);
    if (normalizeText(text) === null) return null;
    const { day, task } = addTask(getDay(this.data, key), text, this.#now());
    this.#commit(putDay(this.data, day));
    return task;
  }

  /** True when the task belongs to a routine that is still active. */
  isRoutine(task: Task): boolean {
    return (
      task.routineId !== undefined &&
      this.data.routines.some((r) => r.id === task.routineId && r.active)
    );
  }

  /** Puts a deleted task back with its id and order (Undo). */
  restore(key: DateKey, task: Task): void {
    this.#assertEditable(key);
    this.#commit(putDay(this.data, restoreTask(getDay(this.data, key), task)));
  }

  /** Returns false (and changes nothing) if the new text is blank. */
  edit(key: DateKey, id: string, text: string): boolean {
    this.#assertEditable(key);
    if (normalizeText(text) === null) return false;
    const day = editTask(getDay(this.data, key), id, text);
    let data = putDay(this.data, day);
    const { routineId, text: clean } = findTask(day, id);
    if (routineId !== undefined) data = renameRoutine(data, routineId, clean);
    this.#commit(data);
    return true;
  }

  remove(key: DateKey, id: string): void {
    this.#assertEditable(key);
    this.#commit(putDay(this.data, deleteTask(getDay(this.data, key), id)));
  }

  toggleDone(key: DateKey, id: string): void {
    this.#assertEditable(key);
    const day = getDay(this.data, key);
    const done = !findTask(day, id).doneAt;
    this.#commit(putDay(this.data, setDone(day, id, done, this.#now())));
  }

  move(key: DateKey, id: string, toIndex: number): void {
    this.#assertEditable(key);
    this.#commit(putDay(this.data, moveTask(getDay(this.data, key), id, toIndex)));
  }

  /** Turns the routine flag on or off for a task on an editable day. */
  setRoutine(key: DateKey, id: string, on: boolean): void {
    this.#assertEditable(key);
    if (on) {
      this.#commit(makeRoutine(this.data, key, id, this.#now()));
      return;
    }
    const { routineId } = findTask(getDay(this.data, key), id);
    if (routineId !== undefined) this.#commit(stopRoutine(this.data, routineId));
  }

  /** Copies a task from any day to today as a new one-off. The source day is untouched. */
  copyToToday(fromKey: DateKey, id: string): Task {
    this.#assertEditable(this.today);
    const result = copyToToday(this.data, fromKey, id, this.today, this.#now());
    this.#commit(result.data);
    return result.task;
  }

  /** Checks for a date change first, so a page left open past midnight is already read-only. */
  #assertEditable(key: DateKey): void {
    this.tick();
    assertEditable(key, this.today);
  }

  #commit(next: AppData, previous: AppData = this.data): void {
    this.data = next;
    if (next !== previous) this.#saver?.schedule();
  }

  #write(): void {
    this.storageOk = save($state.snapshot(this.data) as AppData, this.#storage);
  }

  /** Another tab saved: take its data. Unsaved changes here are dropped. */
  #reload(): void {
    this.#saver?.cancel();
    const loaded = load(this.#storage, this.#now());
    this.loadStatus = loaded.status;
    this.data = ensureDay(loaded.data, this.today, this.#now());
  }
}

export const app = new AppStore();
