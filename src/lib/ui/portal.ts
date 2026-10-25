/** Moves an element to <body>, out of any transformed ancestor (which would trap `position: fixed`). */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
}
