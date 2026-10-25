<script lang="ts">
  const heading = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
</script>

<main class="shell">
  <article class="paper page" aria-label="Today's page">
    <header class="bar">
      <h1 class="date">{heading}</h1>
      <nav class="actions" aria-label="Views">
        <button type="button" class="icon-btn" aria-label="Stats">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
        </button>
        <button type="button" class="icon-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><circle cx="12" cy="12" r="3" /><path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"
            /></svg
          >
        </button>
      </nav>
    </header>
  </article>
</main>

<style>
  .shell {
    display: flex;
    justify-content: center;
    min-height: 100dvh;
  }

  .page {
    width: 100%;
    max-width: var(--page-max-width);
    min-height: 100dvh;
    padding-top: 28px; /* binding strip */
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-3) 0 calc(var(--margin-x) + var(--space-2));
    min-height: calc(var(--line-height) * 2);
  }

  .date {
    font-family: var(--font-hand);
    font-weight: 700;
    font-size: 1.75rem;
    line-height: var(--line-height);
    color: var(--ink);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
  }

  .icon-btn {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .icon-btn svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (min-width: 520px) {
    .page {
      min-height: calc(100dvh - var(--space-6));
      margin-top: var(--space-6);
      border-radius: var(--radius-sm);
    }
  }
</style>
