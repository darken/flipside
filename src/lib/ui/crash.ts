import { reloadApp } from './reload';
import { toasts } from './toast.svelte';

/** Longest gap in which a burst of errors shows only one toast. */
export const CRASH_TOAST_GAP_MS = 10_000;
let lastToastAt = -Infinity;

/**
 * A stray error that the interface can survive: details go to the console only (nothing is sent
 * anywhere), and the person sees one toast with a way to reload.
 */
export function reportError(error: unknown, now: number = Date.now()): void {
  console.error('Flipside error:', error);
  if (now - lastToastAt < CRASH_TOAST_GAP_MS) return;
  lastToastAt = now;
  toasts.show('Something went wrong', {
    action: { label: 'Reload', run: reloadApp },
    duration: 8000,
  });
}

/** Listens for uncaught errors and rejected promises. Returns a function that stops listening. */
export function installGlobalHandlers(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

export function resetCrashThrottle(): void {
  lastToastAt = -Infinity;
}
