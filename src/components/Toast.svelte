<script lang="ts">
  import { toasts } from '$lib/ui/toast.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast">
      <span>{toast.message}</span>
      {#if toast.action}
        <button type="button" onclick={() => toasts.act(toast.id)}>{toast.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    z-index: 40;
    left: 0;
    right: 0;
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: 100%;
    min-height: var(--tap-target);
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    background: var(--ink);
    color: var(--paper-cream);
    box-shadow: var(--shadow-lift);
    font-size: 14px;
    pointer-events: auto;
    animation: pop var(--dur-fast) var(--ease-out);
  }
  button {
    min-height: var(--tap-target);
    padding: 0 var(--space-2);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
  }
  @keyframes pop {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
  }
</style>
