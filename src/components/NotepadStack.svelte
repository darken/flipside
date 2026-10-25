<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { formatHeading, formatRelative } from '$lib/model/dates';
  import { daysBetween } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { busy } from '$lib/ui/busy.svelte';
  import { gestures } from '$lib/ui/gesture';
  import { LayerHistory } from '$lib/ui/history';
  import { inertWhen } from '$lib/ui/inert';
  import { reducedMotion } from '$lib/ui/motion';
  import { newPageMemory, type PageMemory, type PageNav } from '$lib/ui/page-memory';
  import {
    CROSSFADE_MS,
    MAX_VISIBLE_STEPS,
    PEEL_MS,
    STEP_MS,
    neighbours,
    peelDuration,
    samplePeel,
    skippedBetween,
    skippedLabel,
    topPose,
    underPose,
    type PeelDirection,
  } from '$lib/ui/peel';
  import { attachPeelGestures } from '$lib/ui/peelGesture';
  import { toasts } from '$lib/ui/toast.svelte';
  import DayPage from './DayPage.svelte';

  const PAST_LAYER = 'past';

  /** `App` shares one LayerHistory so Stats and past pages stack; alone, the stack makes its own. */
  let { history: shared }: { history?: LayerHistory } = $props();
  const ownsHistory = untrack(() => !shared);
  const history = untrack(() => shared ?? new LayerHistory());

  let currentKey = $state<DateKey>(untrack(() => app.today));
  let announcement = $state('');
  let stack: HTMLDivElement | undefined = $state();
  let endNote: HTMLParagraphElement | undefined = $state();

  const keys = $derived(app.dayKeys);
  const near = $derived(neighbours(keys, currentKey));
  /** Only three pages exist at a time: the newer one waiting above, this one, the older one below. */
  const pages = $derived(
    [near.newer, currentKey, near.older].filter((k): k is DateKey => k !== null),
  );

  // Plain bookkeeping, not rendered state.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const memories = new Map<DateKey, PageMemory>();
  const memoryFor = (key: DateKey) => {
    let m = memories.get(key);
    if (!m) memories.set(key, (m = newPageMemory()));
    return m;
  };

  const roleOf = (key: DateKey) =>
    key === currentKey ? 'current' : key === near.older ? 'older' : 'newer';
  const zIndexOf = (role: string) => (role === 'current' ? 2 : role === 'older' ? 1 : 3);

  function navFor(key: DateKey): PageNav {
    const n = neighbours(keys, key);
    return {
      hasNewer: n.newer !== null,
      hasOlder: n.older !== null,
      onNewer: () => void step('newer'),
      onOlder: () => void step('older'),
      onToday: () => void goToday(),
    };
  }

  function skippedFor(key: DateKey): number {
    const newer = neighbours(keys, key).newer;
    return newer ? skippedBetween(newer, key) : 0;
  }

  // ---- Sheets: where each page sits, applied directly so a peel can follow a finger ----------

  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const sheets = new Map<DateKey, HTMLElement>();
  function register(node: HTMLElement, key: DateKey) {
    sheets.set(key, node);
    return {
      destroy() {
        if (sheets.get(key) === node) sheets.delete(key);
      },
    };
  }

  const layer = (el: HTMLElement, name: 'shadow' | 'dim') =>
    el.querySelector<HTMLElement>(`:scope > .${name}`);

  /** A page that is being lifted away (p = 0 on screen, 1 gone). */
  function setTop(el: HTMLElement, p: number) {
    const pose = topPose(p);
    el.style.transformOrigin = '50% 0';
    el.style.transform = pose.transform;
    layer(el, 'shadow')?.style.setProperty('opacity', String(pose.shadow));
    layer(el, 'dim')?.style.setProperty('opacity', '0');
  }

  /** A page that is being uncovered (e = 0 covered, 1 fully revealed). */
  function setUnder(el: HTMLElement, e: number) {
    const pose = underPose(e);
    el.style.transformOrigin = '50% 50%';
    el.style.transform = pose.transform;
    layer(el, 'shadow')?.style.setProperty('opacity', '0');
    layer(el, 'dim')?.style.setProperty('opacity', String(pose.dim));
  }

  function applyRest() {
    for (const [key, el] of sheets) {
      el.style.willChange = '';
      const role = roleOf(key);
      if (role === 'current') setUnder(el, 1);
      else if (role === 'older') setUnder(el, 0);
      else setTop(el, 1);
    }
    endNote?.style.setProperty('opacity', '0');
  }

  // Poses follow the pages: after the keys change (a peel, a new day, goTo) put everything back.
  $effect(() => {
    void pages;
    void currentKey;
    untrack(() => {
      if (!session) applyRest();
    });
  });

  // ---- Peeling ------------------------------------------------------------------------------

  type Session = {
    direction: PeelDirection;
    top: HTMLElement | null;
    under: HTMLElement | null;
    releaseBusy: () => void;
  };
  let session: Session | null = null;
  let running = false; // a scripted animation is under way

  const sheetOf = (key: DateKey | null) => (key ? (sheets.get(key) ?? null) : null);

  /** The pair of pages for a peel: the one lifting away and the one being uncovered. */
  function pairFor(direction: PeelDirection) {
    return direction === 'older'
      ? { top: sheetOf(currentKey), under: sheetOf(near.older) }
      : { top: sheetOf(near.newer), under: sheetOf(currentKey) };
  }

  /** `g` is how far the peel has gone (0 nothing, 1 complete). A newer page comes down as g grows. */
  function pose(s: Session, g: number) {
    const p = s.direction === 'older' ? g : 1 - g;
    if (s.top) setTop(s.top, p);
    if (s.under) setUnder(s.under, p);
  }

  function beginSession(direction: PeelDirection, releaseBusy: () => void): Session {
    const { top, under } = pairFor(direction);
    const s: Session = { direction, top, under, releaseBusy };
    for (const el of [top, under]) if (el) el.style.willChange = 'transform';
    session = s;
    return s;
  }

  function endSession() {
    const s = session;
    session = null;
    for (const el of [s?.top, s?.under]) if (el) el.style.willChange = '';
    s?.releaseBusy();
  }

  type Anim = {
    el: HTMLElement;
    frames: Keyframe[];
  };

  function play(anims: Anim[], duration: number, easing = 'linear'): Promise<void> {
    const running = anims.flatMap(({ el, frames }) =>
      typeof el.animate === 'function' ? [el.animate(frames, { duration, easing })] : [],
    );
    if (running.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      let left = running.length;
      for (const a of running) {
        a.onfinish = a.oncancel = () => {
          if (--left === 0) resolve();
        };
      }
    });
  }

  /** Animates a peel between two amounts, ending with the final pose set as inline style. */
  async function animatePeel(s: Session, from: number, to: number, ms: number) {
    const samples = samplePeel(from, to);
    const at = (g: number) => (s.direction === 'older' ? g : 1 - g);
    const anims: Anim[] = [];
    if (s.top) {
      anims.push({
        el: s.top,
        frames: samples.map((f) => ({ offset: f.offset, transform: topPose(at(f.p)).transform })),
      });
      const shadow = layer(s.top, 'shadow');
      if (shadow) {
        anims.push({
          el: shadow,
          frames: samples.map((f) => ({
            offset: f.offset,
            opacity: String(topPose(at(f.p)).shadow),
          })),
        });
      }
    }
    if (s.under) {
      anims.push({
        el: s.under,
        frames: samples.map((f) => ({
          offset: f.offset,
          transform: underPose(at(f.p)).transform,
        })),
      });
      const dim = layer(s.under, 'dim');
      if (dim) {
        anims.push({
          el: dim,
          frames: samples.map((f) => ({
            offset: f.offset,
            opacity: String(underPose(at(f.p)).dim),
          })),
        });
      }
    }
    pose(s, to); // the final pose is the inline style, so nothing flashes when the animation ends
    await play(anims, ms);
  }

  /** Reduced motion: no movement, the leaving page just fades away (or the arriving one fades in). */
  async function crossfade(s: Session) {
    const arriving = s.direction === 'newer';
    if (arriving && s.top) setTop(s.top, 0);
    if (s.under) setUnder(s.under, 1);
    if (s.top) {
      await play(
        [
          {
            el: s.top,
            frames: arriving ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
          },
        ],
        CROSSFADE_MS,
        'ease-out',
      );
    }
    if (!arriving && s.top) setTop(s.top, 1);
  }

  /** Makes `key` the current page and settles everything. */
  async function land(key: DateKey, announce = true) {
    currentKey = key;
    await tick();
    applyRest();
    syncHistory();
    if (announce) announceCurrent();
  }

  function announceCurrent() {
    const key = currentKey;
    const parts = [
      formatHeading(key),
      key === app.today ? 'Today' : formatRelative(key, app.today),
    ];
    if (!app.isEditable(key)) parts.push('read-only');
    const skipped = skippedFor(key);
    announcement = parts.join(' · ') + (skipped > 0 ? `, ${skippedLabel(skipped)}` : '');
    sheetOf(key)
      ?.querySelector<HTMLElement>('[data-face]:not([inert]) h1')
      ?.focus({ preventScroll: true });
  }

  /** Turn one page using the buttons, keys or wheel. */
  async function step(direction: PeelDirection, ms = PEEL_MS) {
    const target = direction === 'older' ? near.older : near.newer;
    if (!target || busy.active || running || !gestures.claim('peel')) return;
    running = true;
    const s = beginSession(direction, busy.hold());
    try {
      if (reducedMotion()) await crossfade(s);
      else await animatePeel(s, 0, 1, ms);
    } finally {
      endSession();
      gestures.release('peel');
      running = false;
    }
    await land(target);
  }

  /** Back to today: newer pages come back down in quick succession. */
  async function goToday() {
    if (running || busy.active) return;
    const today = app.today;
    let distance = keys.indexOf(currentKey);
    if (distance <= 0) {
      syncHistory();
      return;
    }
    if (reducedMotion()) {
      await land(today); // no motion: straight there
      return;
    }
    if (distance > MAX_VISIBLE_STEPS) {
      // Only the last few pages are shown; the rest are skipped over instantly.
      await land(keys[MAX_VISIBLE_STEPS]!, false);
      distance = MAX_VISIBLE_STEPS;
    }
    for (let i = 0; i < distance; i++) await step('newer', STEP_MS);
  }

  /** Jump to any day with a page (the nearest one if that exact day has none). */
  export async function goTo(key: DateKey) {
    if (running || busy.active) return;
    const target = nearestPage(key);
    if (!target || target === currentKey) return;
    if (target === near.older) return step('older');
    if (target === near.newer) return step('newer');
    await land(target);
  }

  function nearestPage(key: DateKey): DateKey | null {
    if (keys.includes(key)) return key;
    let best: DateKey | null = null;
    for (const k of keys) {
      if (best === null || Math.abs(daysBetween(key, k)) < Math.abs(daysBetween(key, best)))
        best = k;
    }
    return best;
  }

  // ---- History: Back closes the past pages and returns to today ------------------------------

  function syncHistory() {
    if (currentKey !== app.today) history.open(PAST_LAYER, () => void backToToday());
    else history.close(PAST_LAYER);
  }

  /** Back pressed on a past page: the history entry is already gone. */
  async function backToToday() {
    await goToday();
  }

  // ---- Whole notebook replaced (import, undo) or the open page vanished (another tab) ---------

  let knownEpoch = untrack(() => app.epoch);
  $effect(() => {
    const epoch = app.epoch;
    untrack(() => {
      if (epoch === knownEpoch) return;
      knownEpoch = epoch;
      memories.clear();
      void land(app.today, false);
    });
  });
  $effect(() => {
    if (keys.includes(currentKey)) return;
    untrack(() => void land(app.today, false));
  });

  // ---- A new day while the app is open ------------------------------------------------------

  let knownToday = untrack(() => app.today);
  $effect(() => {
    const today = app.today;
    untrack(() => {
      const before = knownToday;
      knownToday = today;
      if (today === before) return;
      if (currentKey === before) {
        // On today's page: the new day lays down on top, the old one becomes the read-only page below.
        toasts.show("It's a new day");
        void tick().then(() => step('newer'));
      }
      // On a past page: stay put. Today and Back lead to the new day.
    });
  });

  // ---- Gestures and keys --------------------------------------------------------------------

  onMount(() => {
    const stopHistory = ownsHistory ? history.init() : () => {};
    const stopGestures = attachPeelGestures({
      target: stack!,
      getScroller: () =>
        sheetOf(currentKey)?.querySelector<HTMLElement>('[data-face]:not([inert]) .scroll') ?? null,
      pageHeight: () => stack!.clientHeight,
      canStart: () => !running && !busy.active && session === null,
      has: (direction) => (direction === 'older' ? near.older : near.newer) !== null,
      begin: (direction) => {
        beginSession(direction, () => {});
      },
      move: (direction, progress, stretch) => {
        const s = session;
        if (!s) return;
        if (reducedMotion()) return; // nothing follows the finger
        if ((direction === 'older' ? near.older : near.newer) === null) {
          // The end of the stack: the page stretches a little and stops.
          const el = sheetOf(currentKey);
          if (el) {
            el.style.transformOrigin = '50% 50%';
            el.style.transform = `translateY(${direction === 'older' ? -stretch : stretch}px)`;
          }
          if (direction === 'older')
            endNote?.style.setProperty('opacity', String(Math.min(1, stretch / 24)));
          return;
        }
        pose(s, progress);
      },
      end: (direction, commit, progress) => void finishGesture(direction, commit, progress),
      turn: (direction) => void step(direction),
    });
    return () => {
      stopGestures();
      stopHistory();
    };
  });

  async function finishGesture(direction: PeelDirection, commit: boolean, progress: number) {
    const s = session;
    if (!s) return;
    const target = direction === 'older' ? near.older : near.newer;
    running = true;
    gestures.claim('peel');
    const release = busy.hold();
    try {
      if (!target) {
        const el = sheetOf(currentKey);
        if (el) {
          await play(
            [{ el, frames: [{ transform: el.style.transform || 'none' }, { transform: 'none' }] }],
            220,
            'ease-out',
          );
        }
      } else if (reducedMotion()) {
        if (commit) await crossfade(s);
      } else {
        await animatePeel(s, progress, commit ? 1 : 0, peelDuration(progress, commit ? 1 : 0));
      }
    } finally {
      endSession();
      release();
      gestures.release('peel');
      running = false;
    }
    if (commit && target) await land(target);
    else applyRest();
  }

  function onKeydown(event: KeyboardEvent) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void step('older');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void step('newer');
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="stack" role="region" aria-label="Notepad" bind:this={stack}>
  <p class="end-note" bind:this={endNote} aria-hidden="true">This is your first page</p>

  {#each pages as key (key)}
    {@const role = roleOf(key)}
    <div
      class="sheet"
      data-key={key}
      data-role={role}
      style:z-index={zIndexOf(role)}
      use:register={key}
      use:inertWhen={role !== 'current'}
      aria-hidden={role !== 'current' ? 'true' : undefined}
    >
      <div class="shadow" aria-hidden="true"></div>
      <DayPage
        {key}
        memory={memoryFor(key)}
        active={role === 'current'}
        nav={navFor(key)}
        skipped={skippedFor(key)}
      />
      <div class="dim" aria-hidden="true"></div>
    </div>
  {/each}

  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>

<style>
  .stack {
    position: relative;
    width: 100%;
    max-width: var(--page-max-width);
    height: 100%;
  }

  .sheet {
    position: absolute;
    inset: 0;
    transform-origin: 50% 0;
  }

  .shadow,
  .dim {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  /* The shadow of a page lifting away falls on the page underneath */
  .shadow {
    border-radius: var(--radius-sm);
    box-shadow: 0 24px 48px rgb(0 0 0 / 0.45);
  }
  .dim {
    z-index: 10;
    background: #000;
  }

  .end-note {
    position: absolute;
    z-index: 0;
    left: 0;
    right: 0;
    bottom: var(--space-4);
    opacity: 0;
    text-align: center;
    font-family: var(--font-hand);
    font-size: 1.4rem;
    color: var(--ink-soft);
    pointer-events: none;
  }
</style>
