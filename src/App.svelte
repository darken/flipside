<script lang="ts">
  import DayPage, { type Side } from '$components/DayPage.svelte';
  import Toast from '$components/Toast.svelte';
  import { app } from '$lib/store/app.svelte';

  let side = $state<Side>('todo');
</script>

<main class="shell">
  <DayPage key={app.today} {side} onSideChange={(next) => (side = next)} />
</main>
<Toast />

<style>
  .shell {
    display: flex;
    justify-content: center;
    min-height: 100dvh;
  }
</style>
