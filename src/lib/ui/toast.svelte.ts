export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; message: string; action?: ToastAction };

const DEFAULT_DURATION_MS = 5000;

export class ToastQueue {
  items = $state<Toast[]>([]);
  #next = 1;
  // Bookkeeping only; nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, options: { action?: ToastAction; duration?: number } = {}): number {
    const id = this.#next++;
    this.items.push({ id, message, ...(options.action && { action: options.action }) });
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), options.duration ?? DEFAULT_DURATION_MS),
    );
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.items = this.items.filter((t) => t.id !== id);
  }

  /** Runs the toast's action (such as Undo) and closes it. */
  act(id: number): void {
    const toast = this.items.find((t) => t.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }

  clear(): void {
    for (const toast of [...this.items]) this.dismiss(toast.id);
  }
}

export const toasts = new ToastQueue();
