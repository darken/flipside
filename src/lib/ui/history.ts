/**
 * Browser Back button support as a stack of "layers": past pages now, and later the stats view,
 * the settings sheet or a menu. Each layer owns exactly one history entry, however many times it
 * changes; Back closes the top layer and pressing Back with no layer open leaves the app.
 */

export type HistoryHost = {
  history: Pick<History, 'pushState' | 'replaceState' | 'back' | 'state'>;
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
};

export type Layer = { id: string; onBack: () => void };

const MARK = 'flipside';

export class LayerHistory {
  #layers: Layer[] = [];
  /** Popstates caused by our own `history.back()`, which must not close anything. */
  #ignore = 0;
  /** Callers waiting for the popstate of one of our own `history.back()` calls. */
  #waiting: (() => void)[] = [];
  #host: HistoryHost;
  #listener = () => this.#popstate();

  constructor(host: HistoryHost = window) {
    this.#host = host;
  }

  get depth(): number {
    return this.#layers.length;
  }

  has(id: string): boolean {
    return this.#layers.some((l) => l.id === id);
  }

  /** Starts listening, and clears an entry left over from before a reload. */
  init(): () => void {
    const state = this.#host.history.state as Record<string, unknown> | null;
    if (state && MARK in state) this.#host.history.replaceState(null, '');
    this.#host.addEventListener('popstate', this.#listener);
    return () => this.#host.removeEventListener('popstate', this.#listener);
  }

  /** Opens a layer with its own history entry. Opening one that is already open does nothing. */
  open(id: string, onBack: () => void): void {
    const existing = this.#layers.find((l) => l.id === id);
    if (existing) {
      existing.onBack = onBack;
      return;
    }
    this.#layers.push({ id, onBack });
    this.#host.history.pushState({ [MARK]: id }, '');
  }

  /**
   * Closes a layer from the app's own code (not the Back button) and removes its entry. Only the
   * top layer's entry can be removed; a deeper one is just forgotten. The promise resolves once
   * the browser has finished going back, so a new layer can be opened without racing it.
   */
  close(id: string): Promise<void> {
    const index = this.#layers.findIndex((l) => l.id === id);
    if (index < 0) return Promise.resolve();
    const wasTop = index === this.#layers.length - 1;
    this.#layers.splice(index, 1);
    if (!wasTop) return Promise.resolve();
    this.#ignore++;
    const done = new Promise<void>((resolve) => this.#waiting.push(resolve));
    this.#host.history.back();
    return done;
  }

  #popstate() {
    if (this.#ignore > 0) {
      this.#ignore--;
      this.#waiting.shift()?.();
      return;
    }
    const layer = this.#layers.pop();
    layer?.onBack();
  }
}
