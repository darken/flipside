<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import NotepadStack from '$components/NotepadStack.svelte';
  import SettingsSheet from '$components/SettingsSheet.svelte';
  import StatsView from '$components/StatsView.svelte';
  import Toast from '$components/Toast.svelte';
  import type { DateKey } from '$lib/model/types';
  import { settings } from '$lib/settings/settings.svelte';
  import { applyTheme } from '$lib/settings/theme';
  import { app } from '$lib/store/app.svelte';
  import { LayerHistory } from '$lib/ui/history';
  import { inertWhen } from '$lib/ui/inert';
  import { nudge } from '$lib/ui/nudge.svelte';
  import { slideUp } from '$lib/ui/sheet';
  import { sheets, type SheetName } from '$lib/ui/sheets.svelte';
  import { OPEN_SETTINGS, OPEN_STATS } from '$lib/ui/views';

  const history = new LayerHistory();

  let notepad: ReturnType<typeof NotepadStack> | undefined = $state();

  /** Opens a sheet over the notepad, with its own history entry so Back closes it. */
  function openSheet(name: SheetName) {
    if (sheets.open) return;
    sheets.open = name;
    history.open(name, () => (sheets.open = null));
  }
  setContext(OPEN_STATS, () => openSheet('stats'));
  setContext(OPEN_SETTINGS, (section?: 'data') => {
    sheets.section = section ?? null;
    openSheet('settings');
  });

  function closeSheet() {
    const name = sheets.open;
    if (!name) return;
    sheets.open = null;
    void history.close(name);
  }

  /** From a chart: close the sheet, then show that day's page (Back then leads to today). */
  async function openDay(key: DateKey) {
    const name = sheets.open;
    sheets.open = null;
    if (name) await history.close(name);
    await notepad?.goTo(key);
  }

  // The theme follows the setting; the first run only syncs (the page script already applied it).
  let themeApplied = false;
  $effect(() => {
    applyTheme(settings.theme, { animate: themeApplied });
    themeApplied = true;
  });

  onMount(() => {
    nudge.evaluate(app.data);
    return history.init();
  });
</script>

<main class="shell">
  <div class="desk">
    <div
      class="notepad"
      use:inertWhen={sheets.open !== null}
      aria-hidden={sheets.open ? 'true' : undefined}
    >
      <NotepadStack bind:this={notepad} {history} />
    </div>
    {#if sheets.open}
      <div class="sheet-host" transition:slideUp>
        {#if sheets.open === 'stats'}
          <StatsView onclose={closeSheet} onopen={openDay} />
        {:else}
          <SettingsSheet onclose={closeSheet} />
        {/if}
      </div>
    {/if}
  </div>
</main>
<Toast />

<style>
  .shell {
    display: flex;
    justify-content: center;
    height: var(--page-height);
  }

  .desk {
    position: relative;
    width: 100%;
    max-width: var(--page-max-width);
    height: 100%;
  }

  .notepad {
    height: 100%;
  }

  .sheet-host {
    position: absolute;
    inset: 0;
    z-index: 30;
  }

  @media (min-width: 520px) {
    .desk {
      height: calc(100% - 2 * var(--space-5));
      margin-block: var(--space-5);
    }
  }
</style>
