import type { AppData } from '$lib/model/types';
import { settings } from '$lib/settings/settings.svelte';
import { shouldShowNudge } from '$lib/store/backup';

/** The reminder note on today's page. Decided once when the app opens, then kept until dismissed. */
class BackupNudge {
  active = $state(false);

  /** Shows the note if a backup is overdue and it has not appeared in the last 30 days. */
  evaluate(data: AppData, now: Date = new Date()): void {
    if (!shouldShowNudge(settings.value, data, now)) return;
    settings.update({ backupNudgeShownAt: now.toISOString() });
    this.active = true;
  }

  dismiss(): void {
    this.active = false;
  }
}

export const nudge = new BackupNudge();
