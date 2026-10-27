import { dayAccess, isPast, todayKey } from '$lib/model/dates';
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
import { assertCanCheck, assertEditable } from './guard';
import {
  SAVE_DELAY_MS,
  STORAGE_KEY,
  browserStorage,
  createSaver,
  eraseAll,
  load,
  loadSafetyCopy,
  requestPersistence,
  save,
  saveSafetyCopy,
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
  /** Counts whole-data replacements (import, undo), so the notepad can go back to today. */
  epoch = $state(0);

  todayDay = $derived<Day>(this.data.days[this.today] ?? { date: this.today, tasks: [] });
  /** Every day that has a page, newest first. */
  dayKeys = $derived(Object.keys(this.data.days).sort().reverse());

  #storage: StorageLike | null = null;
  #saver: Saver | null = null;
  #now: () => Date;
  #options: AppStoreOptions;
  #askedPersistence = false;

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

  /** Only today is fully editable; the UI uses this to hide edit controls. */
  isEditable(key: DateKey): boolean {
    return !isPast(key, this.today);
  }

  /** Today and yesterday can have tasks checked off and on. */
  canCheck(key: DateKey): boolean {
    return dayAccess(key, this.today) !== 'read-only';
  }

  /** Returns the new task, or null if the text was blank. */
  add(key: DateKey, text: string): Task | null {
    this.#assertEditable(key);
    if (normalizeText(text) === null) return null;
    const { day, task } = addTask(getDay(this.data, key), text, this.#now());
    this.#commit(putDay(this.data, day));
    this.#askForPersistence();
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
    this.#assertCanCheck(key);
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

  /**
   * Replaces everything with imported data. Past days are not read-only here: the whole notebook
   * is swapped. The current data is first copied to a safety key, whose name is returned (null if
   * that copy could not be written) so the import can be undone with `restoreSafetyCopy`.
   */
  replaceAll(data: AppData): string | null {
    this.tick();
    const safety = saveSafetyCopy(
      $state.snapshot(this.data) as AppData,
      this.#storage,
      this.#now(),
    );
    this.#replace(data);
    return safety;
  }

  /** Undo for `replaceAll`: puts the safety copy back. False when it is gone. */
  restoreSafetyCopy(key: string): boolean {
    const data = loadSafetyCopy(key, this.#storage);
    if (!data) return false;
    this.#replace(data);
    try {
      this.#storage?.removeItem(key);
    } catch {
      // The leftover copy is harmless.
    }
    return true;
  }

  /** Deletes everything this app stored. The caller reloads afterwards. */
  eraseEverything(): void {
    this.#saver?.cancel();
    eraseAll(this.#storage);
  }

  #replace(data: AppData): void {
    this.#saver?.cancel();
    const next = ensureDay(data, this.today, this.#now());
    this.data = next;
    this.storageOk = save($state.snapshot(this.data) as AppData, this.#storage);
    this.epoch++;
  }

  /** The first time something is written, ask the browser not to clear our data. */
  #askForPersistence(): void {
    if (this.#askedPersistence) return;
    this.#askedPersistence = true;
    void requestPersistence();
  }

  /** Like #assertEditable, for checking tasks: yesterday passes too. */
  #assertCanCheck(key: DateKey): void {
    this.tick();
    assertCanCheck(key, this.today);
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
