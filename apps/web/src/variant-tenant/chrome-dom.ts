/**
 * Small DOM builders shared by the tenant room chrome. Pure element factories,
 * no variant or live-state knowledge.
 */

export function infoItem(label: string, value: string): HTMLDivElement {
  const item = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  key.textContent = label;
  val.textContent = value;
  item.append(key, val);
  return item;
}

export function noticeTitle(text: string): HTMLElement {
  const el = document.createElement('strong');
  el.textContent = text;
  return el;
}

export function noticeBody(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

export function presenceDot(connected: boolean): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = `presence-dot ${connected ? 'is-online' : 'is-offline'}`;
  dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
  dot.title = connected ? 'Connected' : 'Disconnected';
  return dot;
}

export function roomLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

export function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

// Keep the highlighted (scrubbed) move visible inside the fixed-height move
// list. The list always renders every move; stepping only moves the `.active`
// highlight, so we scroll that cell into view. When nothing is active (live
// view), leave the scroll position alone — a viewer reading back up the list
// should not get yanked on every socket update.
export function scrollActiveMoveIntoView(list: HTMLOListElement): void {
  if (typeof list.scrollTo !== 'function') return;
  window.requestAnimationFrame(() => {
    const active = list.querySelector<HTMLElement>('.active');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centeredDelta =
      activeRect.top - listRect.top - (list.clientHeight - activeRect.height) / 2;
    list.scrollTo({ top: Math.max(0, list.scrollTop + centeredDelta), behavior: 'auto' });
  });
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
