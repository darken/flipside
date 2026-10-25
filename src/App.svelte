<script lang="ts">
  import DayPage from '$components/DayPage.svelte';
  import Toast from '$components/Toast.svelte';
  import { app } from '$lib/store/app.svelte';
</script>

<main class="shell">
  <DayPage key={app.today} />
</main>
<Toast />

<style>
  .shell {
    display: flex;
    justify-content: center;
    height: var(--page-height);
  }
</style>
