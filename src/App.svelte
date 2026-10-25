<script lang="ts">
  import NotepadStack from '$components/NotepadStack.svelte';
  import Toast from '$components/Toast.svelte';
</script>

<main class="shell">
  <div class="desk">
    <NotepadStack />
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
    width: 100%;
    max-width: var(--page-max-width);
    height: 100%;
  }

  @media (min-width: 520px) {
    .desk {
      height: calc(100% - 2 * var(--space-5));
      margin-block: var(--space-5);
    }
  }
</style>
