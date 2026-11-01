/** Tiny DOM helpers shared by the overlays. */

export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Sets textContent only when it changed (avoids layout churn at 60 fps). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
