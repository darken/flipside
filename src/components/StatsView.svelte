<script lang="ts">
  import { onMount } from 'svelte';
  import { formatShort, weekdayName, weekStart as localeWeekStart } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import {
    dailyCounts,
    lastDays,
    routineStats,
    streaks,
    summary,
    weekdayAverages,
    type StripState,
  } from '$lib/stats/compute';
  import { reducedMotion } from '$lib/ui/motion';
  import BarChart from './charts/BarChart.svelte';
  import Heatmap from './charts/Heatmap.svelte';

  type Props = {
    /** Closes the sheet (button, Escape or a swipe down). */
    onclose: () => void;
    /** Opens a day's page on the notepad; the app closes this sheet first. */
    onopen: (key: DateKey) => void;
  };
  let { onclose, onopen }: Props = $props();

  const RANGES = [7, 30, 90] as const;
  let days = $state<(typeof RANGES)[number]>(30);

  // Read once, when the view opens.
  const weekStart = localeWeekStart();

  const today = $derived(app.today);
  const data = $derived(app.data);
  const range = $derived(lastDays(days, today));
  const counts = $derived(dailyCounts(data, range.from, range.to));
  const sum = $derived(summary(data, range, today));
  const streak = $derived(streaks(data, today));
  const routines = $derived(routineStats(data, range));
  const activeRoutines = $derived(routines.filter((r) => r.active));
  const stoppedRoutines = $derived(routines.filter((r) => !r.active));
  const weekdays = $derived(weekdayAverages(data, range, weekStart));
  const weekdayMax = $derived(Math.max(0, ...weekdays.map((w) => w.average)));

  const empty = $derived(!Object.values(data.days).some((d) => d.tasks.some((t) => t.doneAt)));

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const decimal = (n: number) => (Math.round(n * 10) / 10).toString();

  const changeText = $derived.by(() => {
    if (sum.change === null) return 'No earlier data to compare';
    const pct = Math.round(sum.change * 100);
    const against = `vs previous ${days} days`;
    if (pct === 0) return `Same ${against}`;
    return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% ${against}`;
  });

  const chartLabel = $derived(
    `Last ${days} days: ${plural(sum.done, 'task')} done` +
      (sum.bestDay ? `, best day ${formatShort(sum.bestDay.date)} with ${sum.bestDay.done}` : ''),
  );

  const stripLabel = (strip: { state: StripState }[]) => {
    const n = (s: StripState) => strip.filter((x) => x.state === s).length;
    return `Last 14 days: ${n('done')} done, ${n('missed')} missed`;
  };

  let sheet: HTMLElement | undefined = $state();
  let scroller: HTMLElement | undefined = $state();
  let heading: HTMLElement | undefined = $state();

  onMount(() => heading?.focus({ preventScroll: true }));

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onclose();
    }
  }

  // ---- Swipe down to close ------------------------------------------------------------------

  const CLOSE_DISTANCE = 120;
  const CLOSE_FLING = 0.5; // px/ms

  onMount(() => {
    const el = sheet;
    if (!el) return;
    let start: { x: number; y: number; t: number; atTop: boolean } | null = null;
    let owning = false;
    let dy = 0;

    const reset = () => {
      el.style.transition = 'transform 200ms ease-out';
      el.style.transform = '';
      setTimeout(() => (el.style.transition = ''), 220);
    };

    const touchstart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 && t
          ? { x: t.clientX, y: t.clientY, t: Date.now(), atTop: (scroller?.scrollTop ?? 0) <= 0 }
          : null;
      owning = false;
      dy = 0;
    };
    const touchmove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const mx = t.clientX - start.x;
      dy = t.clientY - start.y;
      if (!owning) {
        if (Math.abs(mx) < 10 && Math.abs(dy) < 10) return;
        // Only a clearly downward pull from the top of the sheet; anything else is left alone.
        if (!start.atTop || dy <= 0 || Math.abs(dy) < Math.abs(mx) * 1.5) {
          start = null;
          return;
        }
        owning = true;
      }
      if (reducedMotion()) return;
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const touchend = () => {
      if (!start) return;
      const fast = owning && dy / Math.max(1, Date.now() - start.t) > CLOSE_FLING;
      const commit = owning && (dy > CLOSE_DISTANCE || fast);
      start = null;
      if (commit) onclose();
      else if (owning) reset();
      owning = false;
    };

    el.addEventListener('touchstart', touchstart, { passive: true });
    el.addEventListener('touchmove', touchmove, { passive: false });
    el.addEventListener('touchend', touchend);
    el.addEventListener('touchcancel', touchend);
    return () => {
      el.removeEventListener('touchstart', touchstart);
      el.removeEventListener('touchmove', touchmove);
      el.removeEventListener('touchend', touchend);
      el.removeEventListener('touchcancel', touchend);
    };
  });
</script>

<svelte:window {onkeydown} />

<div class="sheet" bind:this={sheet} role="dialog" aria-modal="true" aria-labelledby="stats-title">
  <header class="top">
    <h1 id="stats-title" tabindex="-1" bind:this={heading}>Stats</h1>
    <button type="button" class="close" aria-label="Close stats" onclick={onclose}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </header>

  <div class="scroll" bind:this={scroller}>
    <fieldset class="range">
      <legend class="sr-only">Time range</legend>
      {#each RANGES as n (n)}
        <label class:on={days === n}>
          <input
            type="radio"
            name="stats-range"
            value={n}
            checked={days === n}
            onchange={() => (days = n)}
          />
          {n} days
        </label>
      {/each}
    </fieldset>

    {#if empty}
      <p class="empty">Check off a task and your stats will start here</p>
    {/if}

    <div class="content" class:ghost={empty}>
      <dl class="tiles">
        <div class="tile">
          <dt>Done</dt>
          <dd>
            <span class="num">{sum.done}</span>
            <span class="sub">{changeText}</span>
          </dd>
        </div>
        <div class="tile">
          <dt>Current streak <span aria-hidden="true">🔥</span></dt>
          <dd>
            <span class="num">{streak.current}</span>
            <span class="sub">{plural(streak.current, 'day')}</span>
          </dd>
        </div>
        <div class="tile">
          <dt>Longest streak</dt>
          <dd>
            <span class="num">{streak.longest}</span>
            <span class="sub"
              >{streak.longestEnd
                ? `${plural(streak.longest, 'day')}, to ${formatShort(streak.longestEnd)}`
                : 'days'}</span
            >
          </dd>
        </div>
        <div class="tile">
          <dt>Average per day</dt>
          <dd>
            <span class="num">{decimal(sum.average)}</span>
            <span class="sub">over {plural(sum.activeDays, 'active day')}</span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="h-bars">
        <h2 id="h-bars">Tasks done</h2>
        {#key days}
          <BarChart days={counts} {today} label={chartLabel} {onopen} />
        {/key}
      </section>

      <section aria-labelledby="h-heat">
        <h2 id="h-heat">Calendar</h2>
        <Heatmap {data} {today} {weekStart} {onopen} />
      </section>

      <section aria-labelledby="h-routines">
        <h2 id="h-routines">Routines</h2>
        {#if routines.length === 0}
          <p class="note">No routines yet. Turn on ↻ when adding a task.</p>
        {/if}
        <ul class="routines">
          {#each activeRoutines as r (r.id)}
            {@render routine(r)}
          {/each}
        </ul>
        {#if stoppedRoutines.length > 0}
          <details class="stopped">
            <summary>Stopped ({stoppedRoutines.length})</summary>
            <ul class="routines">
              {#each stoppedRoutines as r (r.id)}
                {@render routine(r)}
              {/each}
            </ul>
          </details>
        {/if}
      </section>

      <section aria-labelledby="h-week">
        <h2 id="h-week">Weekdays</h2>
        <svg
          class="week"
          viewBox="0 0 343 100"
          role="img"
          aria-label={'Average tasks done per weekday: ' +
            weekdays.map((w) => `${weekdayName(w.weekday)} ${decimal(w.average)}`).join(', ')}
        >
          {#each weekdays as w, i (w.weekday)}
            {@const h = weekdayMax > 0 ? (w.average / weekdayMax) * 56 : 0}
            {@const x = 21 + i * 46.5}
            <rect class="well" {x} y="22" width="22" height="56" rx="2" />
            {#if h > 0}
              <rect class="wbar" {x} y={78 - h} width="22" height={h} rx="2" />
            {/if}
            <text class="val" x={x + 11} y="16" text-anchor="middle">{decimal(w.average)}</text>
            <text class="axis" x={x + 11} y="94" text-anchor="middle">{weekdayName(w.weekday)}</text
            >
          {/each}
        </svg>
        <div class="sr-only">
          <table>
            <caption>Average tasks done per weekday</caption>
            <thead><tr><th>Weekday</th><th>Average done</th></tr></thead>
            <tbody>
              {#each weekdays as w (w.weekday)}
                <tr
                  ><th scope="row">{weekdayName(w.weekday, undefined, 'short')}</th><td
                    >{decimal(w.average)}</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</div>

{#snippet routine(r: ReturnType<typeof routineStats>[number])}
  <li class="routine">
    <div class="line">
      <span class="name">{r.text}</span>
      <span class="pct">{r.rate === null ? '—' : percent(r.rate)}</span>
    </div>
    <div class="meter" aria-hidden="true">
      <span style:width={r.rate === null ? '0%' : percent(r.rate)}></span>
    </div>
    <p class="detail">{r.done} of {r.instances} done</p>
    <div class="strip" role="img" aria-label={stripLabel(r.strip)}>
      {#each r.strip as s (s.date)}
        <span class="dot {s.state}" title={formatShort(s.date)}></span>
      {/each}
    </div>
  </li>
{/snippet}

<style>
  .sheet {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background-color: var(--paper-cream);
    /* Graph paper instead of ruled lines: a fine square grid */
    background-image:
      linear-gradient(to right, var(--viz-grid) 1px, transparent 1px),
      linear-gradient(to bottom, var(--viz-grid) 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift);
    color: var(--ink);
  }

  .top {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-1) var(--space-4);
  }
  h1 {
    font-family: var(--font-hand);
    font-size: 2rem;
    line-height: 1.2;
  }
  h1:focus-visible {
    outline-offset: 2px;
  }
  .close {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .close svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-1) var(--space-3) var(--space-6);
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-family: var(--font-hand);
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .content > section {
    margin-top: var(--space-5);
  }

  .range {
    display: flex;
    margin: 0;
    padding: 0;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--paper-cream) 85%, transparent);
    overflow: hidden;
  }
  .range label {
    position: relative;
    flex: 1;
    display: grid;
    place-items: center;
    min-height: var(--tap-target);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
  }
  .range label.on {
    background: var(--accent);
    color: var(--paper-cream);
  }
  .range input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  .range label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -4px;
  }

  .empty {
    margin: var(--space-4) 0 0;
    font-family: var(--font-hand);
    font-size: 1.5rem;
    line-height: 1.2;
    text-align: center;
    color: var(--ink-soft);
  }
  .ghost {
    opacity: 0.4;
    pointer-events: none;
  }

  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin: var(--space-4) 0 0;
  }
  .tile {
    padding: var(--space-3);
    border: 1px solid var(--viz-grid);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--paper-cream) 80%, transparent);
  }
  dt {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--ink-soft);
  }
  dd {
    margin: 0;
  }
  .num {
    display: block;
    font-family: var(--font-body);
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    display: block;
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--ink-soft);
  }

  .note {
    font-size: 0.875rem;
    color: var(--ink-soft);
  }

  .routines {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .routine {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--viz-grid);
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 0.9375rem;
    line-height: 1.3;
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .pct {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .meter {
    height: 6px;
    margin: 6px 0 4px;
    border-radius: 3px;
    background: var(--viz-empty);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--viz-3);
  }
  .detail {
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .strip {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }
  .dot {
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .dot.done {
    background: var(--viz-3);
  }
  .dot.missed {
    border: 2px solid var(--viz-today);
  }
  .dot.none {
    width: 4px;
    height: 4px;
    margin: 3px;
    background: var(--ink-soft);
    opacity: 0.45;
  }

  .stopped summary {
    min-height: var(--tap-target);
    display: flex;
    align-items: center;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
  }

  .week {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--font-body);
  }
  .well {
    fill: var(--viz-empty);
    opacity: 0.6;
  }
  .wbar {
    fill: var(--viz-3);
  }
  .axis {
    fill: var(--ink-soft);
    font-size: 10px;
  }
  .val {
    fill: var(--ink);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
