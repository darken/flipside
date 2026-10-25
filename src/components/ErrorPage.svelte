<script lang="ts">
  import type { AppData } from '$lib/model/types';
  import { settings } from '$lib/settings/settings.svelte';
  import { exportBackup } from '$lib/store/backup';
  import { app } from '$lib/store/app.svelte';
  import { reloadApp } from '$lib/ui/reload';

  type Props = { error: unknown };
  let { error }: Props = $props();

  let note = $state('');

  $effect(() => {
    console.error('Flipside crashed:', error);
  });

  /** The normal backup; if the live data is what broke, the raw saved copy goes out instead. */
  async function backUp() {
    note = '';
    try {
      await exportBackup($state.snapshot(app.data) as AppData, settings.value);
    } catch {
      try {
        const raw = localStorage.getItem('flipside:v1');
        if (!raw) throw new Error('nothing saved');
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), {
          href: url,
          download: 'flipside-data.json',
        });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } catch {
        note = 'There was nothing to download.';
      }
    }
  }
</script>

<div class="crash" role="alert">
  <h2>Something went wrong</h2>
  <p>Your data is safe on this device.</p>
  <div class="buttons">
    <button type="button" class="primary" onclick={reloadApp}>Reload</button>
    <button type="button" onclick={backUp}>Download backup</button>
  </div>
  {#if note}<p class="note">{note}</p>{/if}
</div>

<style>
  .crash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    height: 100%;
    min-height: 240px;
    padding: var(--space-5);
    background: var(--paper-cream);
    color: var(--ink);
    text-align: center;
  }
  h2 {
    font-family: var(--font-hand);
    font-size: 2rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  button {
    min-height: var(--tap-target);
    padding: 0 var(--space-4);
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: var(--paper-cream);
  }
  .note {
    color: var(--ink-soft);
    font-size: 0.875rem;
  }
</style>
