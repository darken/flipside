/** Grows a textarea to fit its text where `field-sizing: content` is not supported (Safari). */
export function autosize(node: HTMLTextAreaElement, _value?: unknown) {
  if (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')) return {};
  const fit = () => {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  fit();
  node.addEventListener('input', fit);
  return {
    update: fit,
    destroy() {
      node.removeEventListener('input', fit);
    },
  };
}
