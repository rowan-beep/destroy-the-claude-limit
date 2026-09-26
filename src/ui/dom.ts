// Minimal DOM helpers.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement | null,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function clearEl(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}

export function button(label: string, cls: string, parent: HTMLElement, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'btn ' + cls, parent, label);
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return b;
}

/** Set text only when it changed (avoids layout thrash at 60 fps). */
export function setText(e: HTMLElement, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

export function setClass(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}
