// Server-restart drain countdown banner.
//
// Two sources update it:
//   1. /api/server-status at page boot (covers the case where the user loads
//      a page mid-drain — no WS broadcast was in flight for them).
//   2. WS messages `server_restart_scheduled` / `server_restart_cancelled`
//      pushed by the live socket when the admin drain endpoint fires.
//
// restartAt is an absolute ms-epoch from the server. The client ticks the
// countdown locally so a flaky socket doesn't freeze the display.

let bannerEl: HTMLDivElement | null = null;
let countdownEl: HTMLSpanElement | null = null;
let tickTimer: number | null = null;
let currentRestartAt: number | null = null;

export function mountRestartBanner(): void {
  if (bannerEl && document.body.contains(bannerEl)) return;
  const el = document.createElement('div');
  el.className = 'restart-banner';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.innerHTML =
    '<span class="restart-banner__label">Server restart in</span>' +
    '<span class="restart-banner__countdown" data-countdown></span>' +
    '<span class="restart-banner__hint">Your game will pause briefly and resume after restart.</span>';
  document.body.insertBefore(el, document.body.firstChild);
  bannerEl = el;
  countdownEl = el.querySelector<HTMLSpanElement>('[data-countdown]');
}

export function setRestartBanner(restartAt: number | null): void {
  if (!bannerEl) mountRestartBanner();
  // Treat past restartAt as cancelled — the deploy either landed or got cancelled.
  if (restartAt === null || restartAt <= Date.now()) {
    currentRestartAt = null;
    stopTicking();
    if (bannerEl) bannerEl.hidden = true;
    return;
  }
  currentRestartAt = restartAt;
  if (bannerEl) bannerEl.hidden = false;
  renderCountdown();
  startTicking();
}

function renderCountdown(): void {
  if (!countdownEl || currentRestartAt === null) return;
  const remainingMs = currentRestartAt - Date.now();
  if (remainingMs <= 0) {
    countdownEl.textContent = 'now';
    return;
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startTicking(): void {
  stopTicking();
  tickTimer = window.setInterval(() => {
    renderCountdown();
    if (currentRestartAt !== null && currentRestartAt <= Date.now()) {
      // Leave the banner visible past T-zero — the actual restart can take
      // a few seconds. Server cancel or page reload clears it.
      stopTicking();
    }
  }, 1000);
}

function stopTicking(): void {
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}
