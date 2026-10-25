import { cubicOut } from 'svelte/easing';
import { reducedMotion } from './motion';

export const SHEET_MS = 350;
export const SHEET_FADE_MS = 150;

/** Svelte transition for a sheet that slides up over the page; a plain crossfade for reduced motion. */
export function slideUp(node: Element) {
  const reduced = reducedMotion();
  const canAnimate = typeof node.animate === 'function';
  return {
    duration: !canAnimate ? 0 : reduced ? SHEET_FADE_MS : SHEET_MS,
    easing: cubicOut,
    css: (t: number, u: number) =>
      reduced ? `opacity: ${t}` : `transform: translateY(${u * 100}%)`,
  };
}
