/** Reloads the page. A module of its own so tests can replace it. */
export function reloadApp(): void {
  location.reload();
}

/** If the new version does not take over by itself, reload anyway after this long. */
export const UPDATE_FALLBACK_MS = 4000;

type WorkerHost = Pick<ServiceWorkerContainer, 'addEventListener'>;

/**
 * Switches to the version that is waiting: asks it to take over, then reloads once it has (or
 * after a short wait, if the browser never says). `skipWaiting` is the call that messages the
 * waiting worker.
 */
export function applyUpdate(
  skipWaiting: () => void,
  host: WorkerHost | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.serviceWorker,
  reload: () => void = reloadApp,
): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    reload();
  };
  host?.addEventListener('controllerchange', once, { once: true });
  setTimeout(once, UPDATE_FALLBACK_MS);
  skipWaiting();
}
