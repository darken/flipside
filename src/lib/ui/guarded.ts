import { ReadOnlyDayError } from '$lib/store/guard';
import { toasts } from './toast.svelte';

export const NEW_DAY_MESSAGE = "It's a new day. That page is now read-only.";

/**
 * Runs a store change. If the day has just turned read-only (midnight passed while the page was
 * open), tells the user instead of failing; the page itself follows `app.today`.
 */
export function guarded<T>(change: () => T): T | undefined {
  try {
    return change();
  } catch (error) {
    if (error instanceof ReadOnlyDayError) {
      toasts.show(NEW_DAY_MESSAGE);
      return undefined;
    }
    throw error;
  }
}
