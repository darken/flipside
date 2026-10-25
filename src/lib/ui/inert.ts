/** Sets the `inert` attribute by hand, so it also works where the DOM property is missing. */
export function inertWhen(node: HTMLElement, hidden: boolean) {
  node.toggleAttribute('inert', hidden);
  return {
    update(next: boolean) {
      node.toggleAttribute('inert', next);
    },
  };
}
