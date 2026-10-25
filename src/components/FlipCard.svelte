<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import {
    CROSSFADE_MS,
    MAX_SHADE,
    angleFor,
    depth,
    durationFor,
    flipEase,
    nearestRest,
    normalizeAngle,
    restAngle,
    sampleFlip,
    shouldFinish,
    startsInEdgeZone,
    transformFor,
    type Side,
  } from '$lib/ui/flip';
  import { gestures, lockDirection } from '$lib/ui/gesture';
  import { inertWhen } from '$lib/ui/inert';
  import { reducedMotion } from '$lib/ui/motion';

  type Props = {
    side: Side;
    onSideChange: (side: Side) => void;
    /** Called once a flip has finished (or the crossfade, with reduced motion). */
    onFlipped?: (side: Side) => void;
    /** Blocks flipping, e.g. while a task is being dragged or edited. */
    disabled?: boolean;
    front: Snippet;
    back: Snippet;
  };

  let { side, onSideChange, onFlipped, disabled = false, front, back }: Props = $props();

  type Gesture = {
    id: number;
    x0: number;
    y0: number;
    base: number;
    width: number;
    lock: 'horizontal' | 'vertical' | null;
    samples: { x: number; t: number }[];
  };
  type Run = { anims: Animation[]; from: number; to: number; duration: number };

  let stage: HTMLDivElement | undefined = $state();
  let card: HTMLDivElement | undefined = $state();
  let glow: HTMLDivElement | undefined = $state();
  let frontEl: HTMLDivElement | undefined = $state();
  let backEl: HTMLDivElement | undefined = $state();
  let frontShade: HTMLDivElement | undefined = $state();
  let backShade: HTMLDivElement | undefined = $state();
  let flat = $state(reducedMotion());

  // Imperative state: the card is moved directly (inline styles and the Web Animations API), not
  // through Svelte, so a flip can follow a finger and be reversed part way.
  let shown: Side = untrack(() => side);
  let angle = restAngle(shown);
  let run: Run | null = null;
  let gesture: Gesture | null = null;

  const other = (s: Side): Side => (s === 'todo' ? 'done' : 'todo');

  function apply(a: number) {
    if (!card) return;
    const d = depth(a);
    card.style.transform = transformFor(a);
    if (frontShade) frontShade.style.opacity = String(MAX_SHADE * d);
    if (backShade) backShade.style.opacity = String(MAX_SHADE * d);
    if (glow) glow.style.opacity = String(d);
  }

  function showRest() {
    angle = restAngle(shown);
    if (!card) return;
    if (flat) {
      card.style.transform = '';
      for (const el of [frontShade, backShade, glow]) if (el) el.style.opacity = '0';
    } else {
      apply(angle);
    }
  }

  function currentAngle(): number {
    if (!run) return angle;
    const progress = Number(run.anims[0]?.currentTime ?? 0) / run.duration;
    return run.from + (run.to - run.from) * flipEase(Math.min(1, Math.max(0, progress)));
  }

  function stopRun() {
    const r = run;
    run = null;
    r?.anims.forEach((a) => a.cancel());
    if (card) card.style.willChange = '';
  }

  function finish(to: number, notify: boolean) {
    stopRun();
    gestures.release('flip');
    angle = normalizeAngle(to);
    apply(angle);
    if (notify) onFlipped?.(shown);
  }

  /** Animates the card from one angle to another using only compositor properties. */
  function play(from: number, to: number, notify = true) {
    stopRun();
    gestures.claim('flip'); // a peel must not start while the page is turning
    angle = to;
    apply(to); // final pose is the inline style, so nothing flashes when the animation ends
    const parts = [
      card && { el: card, frame: (a: number) => ({ transform: transformFor(a) }) },
      frontShade && {
        el: frontShade,
        frame: (a: number) => ({ opacity: String(MAX_SHADE * depth(a)) }),
      },
      backShade && {
        el: backShade,
        frame: (a: number) => ({ opacity: String(MAX_SHADE * depth(a)) }),
      },
      glow && { el: glow, frame: (a: number) => ({ opacity: String(depth(a)) }) },
    ].filter((p) => p !== undefined && p !== null);
    if (!card || typeof card.animate !== 'function') {
      finish(to, notify);
      return;
    }
    const duration = durationFor(from, to);
    const frames = sampleFlip(from, to);
    const anims = parts.map((p) =>
      p.el.animate(
        frames.map((f) => ({ offset: f.offset, ...p.frame(f.angle) })),
        { duration, easing: 'linear' },
      ),
    );
    card.style.willChange = 'transform';
    run = { anims, from, to, duration };
    anims[0]!.onfinish = () => finish(to, notify);
  }

  /** With reduced motion there is no 3D: the faces just fade into each other. */
  function crossfade() {
    angle = restAngle(shown);
    const [incoming, outgoing] = shown === 'todo' ? [frontEl, backEl] : [backEl, frontEl];
    const options = { duration: CROSSFADE_MS, easing: 'ease-out' };
    outgoing?.animate?.([{ opacity: 1 }, { opacity: 0 }], options);
    const fade = incoming?.animate?.([{ opacity: 0 }, { opacity: 1 }], options);
    if (fade) fade.onfinish = () => onFlipped?.(shown);
    else onFlipped?.(shown);
  }

  /** Turns the card to `next`, from wherever it is now (so a flip can be reversed part way). */
  function turnTo(next: Side, direction: -1 | 1 = -1, explicitTo?: number) {
    const from = currentAngle();
    shown = next;
    if (flat) {
      stopRun();
      crossfade();
      return;
    }
    play(from, explicitTo ?? nearestRest(from, next, direction));
  }

  // ---- Swipe ---------------------------------------------------------------------------------

  function velocity(g: Gesture): number {
    const last = g.samples[g.samples.length - 1];
    const first = g.samples[0];
    if (!last || !first || last.t === first.t) return 0;
    return (last.x - first.x) / (last.t - first.t);
  }

  function onPointerDown(e: PointerEvent) {
    if (disabled || run || gesture || !e.isPrimary || e.button !== 0) return;
    if (gestures.owner !== null) return; // a peel is under way
    if (e.pointerType === 'mouse') return; // mouse users have the button and the F key
    const target = e.target as Element;
    if (target.closest('textarea, input:not([type="checkbox"]), [data-handle]')) return;
    if (startsInEdgeZone(e.clientX, window.innerWidth)) return;
    gesture = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      base: angle,
      width: stage?.getBoundingClientRect().width ?? window.innerWidth,
      lock: null,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  }

  function onPointerMove(e: PointerEvent) {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    if (!g.lock) {
      g.lock = lockDirection(e.clientX - g.x0, e.clientY - g.y0);
      if (g.lock === 'vertical') gesture = null; // the face scrolls
      if (g.lock !== 'horizontal') return;
      if (!gestures.claim('flip')) {
        gesture = null;
        return;
      }
      g.x0 = e.clientX; // start turning from here, so the card does not jump
      g.samples = [{ x: e.clientX, t: e.timeStamp }];
      try {
        stage?.setPointerCapture(e.pointerId);
      } catch {
        // No active pointer to capture (synthetic events); the move events still arrive.
      }
    }
    g.samples.push({ x: e.clientX, t: e.timeStamp });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0]!.t > 100) g.samples.shift();
    if (flat) return; // reduced motion: nothing follows the finger
    angle = g.base + angleFor(e.clientX - g.x0, g.width);
    apply(angle);
  }

  function onPointerUp(e: PointerEvent) {
    const g = gesture;
    gesture = null;
    if (!g || g.lock !== 'horizontal' || e.pointerId !== g.id) return;
    gestures.release('flip');
    const turned = angleFor(e.clientX - g.x0, g.width);
    if (shouldFinish(turned, velocity(g))) {
      const direction = Math.sign(turned) || Math.sign(velocity(g)) || -1;
      const next = other(shown);
      turnTo(next, direction as -1 | 1, g.base + direction * 180);
      onSideChange(next);
    } else if (!flat) {
      play(angle, g.base, false);
    }
  }

  function cancelGesture() {
    const g = gesture;
    gesture = null;
    if (g?.lock !== 'horizontal') return;
    gestures.release('flip');
    if (!flat) play(angle, g.base, false);
  }

  // ---- Reactions to props --------------------------------------------------------------------

  // A side change that did not come from a swipe: the button, the F key, an auto-flip.
  $effect(() => {
    const next = side;
    untrack(() => {
      if (next !== shown) turnTo(next);
    });
  });

  $effect(() => {
    if (disabled) untrack(cancelGesture);
  });

  $effect(() => {
    void flat;
    untrack(showRest);
  });

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (flat = query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  });

  $effect(() => () => {
    stopRun();
    gestures.release('flip');
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="stage"
  bind:this={stage}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={cancelGesture}
>
  <div class="glow" bind:this={glow} aria-hidden="true"></div>
  <div class="card" class:flat data-side={side} bind:this={card}>
    <div
      class="face front"
      data-face="todo"
      bind:this={frontEl}
      use:inertWhen={side !== 'todo'}
      aria-hidden={side !== 'todo' ? 'true' : undefined}
    >
      {@render front()}
      <div class="shade" bind:this={frontShade} aria-hidden="true"></div>
    </div>
    <div
      class="face back"
      data-face="done"
      bind:this={backEl}
      use:inertWhen={side !== 'done'}
      aria-hidden={side !== 'done' ? 'true' : undefined}
    >
      {@render back()}
      <div class="shade" bind:this={backShade} aria-hidden="true"></div>
    </div>
  </div>
</div>

<style>
  /* No overflow other than `visible` on the stage or the card: it would flatten the 3D context
     and break the flip on iOS Safari. The faces scroll inside themselves instead. */
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    perspective: 1400px;
    touch-action: pan-y;
  }

  .glow {
    position: absolute;
    inset: 3% 4%;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift);
    opacity: 0;
    pointer-events: none;
  }

  .card {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    transform-style: preserve-3d;
    -webkit-transform-style: preserve-3d;
    transform-origin: 50% 50%;
  }

  .face {
    position: relative;
    grid-area: 1 / 1;
    min-height: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: translateZ(0);
  }
  .face.back {
    transform: rotateY(180deg) translateZ(0);
  }
  .face :global(.paper) {
    height: 100%;
  }

  /* Light and shade that deepens towards the edge-on position */
  .shade {
    position: absolute;
    inset: 0;
    z-index: 5;
    opacity: 0;
    pointer-events: none;
    background: linear-gradient(
      to right,
      rgb(0 0 0 / 0.55),
      rgb(0 0 0 / 0.08) 55%,
      rgb(0 0 0 / 0.4)
    );
  }

  /* Reduced motion: no 3D, the faces crossfade */
  .card.flat .face,
  .card.flat .face.back {
    transform: none;
    backface-visibility: visible;
    -webkit-backface-visibility: visible;
  }
  .card.flat[data-side='todo'] .back,
  .card.flat[data-side='done'] .front {
    opacity: 0;
    pointer-events: none;
  }
</style>
