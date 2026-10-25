/** A keyboard shows as a visual viewport at least this much shorter than the layout viewport. */
export const KEYBOARD_MIN_PX = 120;

/** The height of what is visible above an on-screen keyboard, or null when no keyboard is up. */
export function visibleHeightAboveKeyboard(
  layoutHeight: number,
  visualHeight: number,
): number | null {
  return layoutHeight - visualHeight >= KEYBOARD_MIN_PX ? Math.round(visualHeight) : null;
}

type ViewportHost = {
  innerHeight: number;
  visualViewport?: Pick<
    VisualViewport,
    'height' | 'addEventListener' | 'removeEventListener'
  > | null;
  scrollTo: (x: number, y: number) => void;
  document: {
    documentElement: { style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'> };
    activeElement: Element | null;
  };
};

/**
 * Keeps the page on screen when the keyboard opens. Android resizes the layout itself
 * (`interactive-widget=resizes-content`); iOS Safari only shrinks the visual viewport and pans the
 * whole page up. So while a keyboard is up the page is sized to what is visible, the pan is undone,
 * and the focused field is scrolled into view inside its own list.
 */
export function watchKeyboard(host: ViewportHost = window): () => void {
  const viewport = host.visualViewport;
  if (!viewport) return () => {};
  const style = host.document.documentElement.style;

  const update = () => {
    const height = visibleHeightAboveKeyboard(host.innerHeight, viewport.height);
    if (height === null) {
      style.removeProperty('--page-height');
      return;
    }
    style.setProperty('--page-height', `calc(${height}px - env(safe-area-inset-top))`);
    host.scrollTo(0, 0);
    const active = host.document.activeElement;
    if (active instanceof HTMLElement && /^(TEXTAREA|INPUT)$/.test(active.tagName)) {
      active.scrollIntoView({ block: 'nearest' });
    }
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    style.removeProperty('--page-height');
  };
}
