// Server-restart drain banner.
//
import './restart-banner.css';

// Two sources update it:
//   1. /api/server-status at page boot (covers the case where the user loads
//      a page mid-drain — no WS broadcast was in flight for them).
//   2. WS messages `server_restart_scheduled` / `server_restart_cancelled`
//      pushed by the live socket when the admin drain endpoint fires.

let bannerEl: HTMLDivElement | null = null;
let labelEl: HTMLSpanElement | null = null;
let hintEl: HTMLSpanElement | null = null;

export type RestartBannerPhase = 'pending' | 'restarting';

export function mountRestartBanner(): void {
  if (bannerEl && document.body.contains(bannerEl)) return;
  const el = document.createElement('div');
  el.className = 'restart-banner';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.innerHTML =
    '<span class="restart-banner__label" data-label></span>' +
    '<span class="restart-banner__hint" data-hint></span>';
  document.body.insertBefore(el, document.body.firstChild);
  bannerEl = el;
  labelEl = el.querySelector<HTMLSpanElement>('[data-label]');
  hintEl = el.querySelector<HTMLSpanElement>('[data-hint]');
}

export function setRestartBanner(phase: RestartBannerPhase | null): void {
  if (!bannerEl) mountRestartBanner();
  if (phase === null) {
    if (bannerEl) bannerEl.hidden = true;
    return;
  }
  if (bannerEl) bannerEl.hidden = false;
  if (phase === 'pending') {
    if (labelEl) labelEl.textContent = 'Update pending';
    if (hintEl) hintEl.textContent = 'Active games can finish before the restart.';
  } else {
    if (labelEl) labelEl.textContent = 'Server restarting now';
    if (hintEl) hintEl.textContent = 'Please reconnect in a moment.';
  }
}
