<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import NotepadStack from '$components/NotepadStack.svelte';
  import StatsView from '$components/StatsView.svelte';
  import Toast from '$components/Toast.svelte';
  import type { DateKey } from '$lib/model/types';
  import { LayerHistory } from '$lib/ui/history';
  import { inertWhen } from '$lib/ui/inert';
  import { slideUp } from '$lib/ui/sheet';
  import { OPEN_STATS } from '$lib/ui/views';

  const STATS_LAYER = 'stats';
  const history = new LayerHistory();

  let statsOpen = $state(false);
  let notepad: ReturnType<typeof NotepadStack> | undefined = $state();

  function openStats() {
    if (statsOpen) return;
    statsOpen = true;
    history.open(STATS_LAYER, () => (statsOpen = false));
  }
  setContext(OPEN_STATS, openStats);

  function closeStats() {
    if (!statsOpen) return;
    statsOpen = false;
    void history.close(STATS_LAYER);
  }

  /** From a chart: close the sheet, then show that day's page (Back then leads to today). */
  async function openDay(key: DateKey) {
    statsOpen = false;
    await history.close(STATS_LAYER);
    await notepad?.goTo(key);
  }

  onMount(() => history.init());
</script>

<main class="shell">
  <div class="desk">
    <div class="notepad" use:inertWhen={statsOpen} aria-hidden={statsOpen ? 'true' : undefined}>
      <NotepadStack bind:this={notepad} {history} />
    </div>
    {#if statsOpen}
      <div class="stats-host" transition:slideUp>
        <StatsView onclose={closeStats} onopen={openDay} />
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

  .stats-host {
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
