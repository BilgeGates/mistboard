import { type Color, clockRemainingMs, type GameEvent, type PlayerView } from '@mistboard/game';
import { isLive } from './live-replay.js';
import { type LiveRefs, liveState } from './live-state.js';
import { formatClock, isColor } from './web-utils.js';

type ClockRefs = Pick<LiveRefs, 'clockTop' | 'clockBottom' | 'clockNote'>;

// Tracks the previous active clock color across renderClocks() calls so we can
// detect the turn flip into the seated player's clock and play a flash.
let lastActiveClockColor: Color | null = null;

export function resetClockState(): void {
  lastActiveClockColor = null;
}

export function renderClocks(refs: ClockRefs, view: PlayerView | null): void {
  refs.clockTop.replaceChildren();
  refs.clockBottom.replaceChildren();
  refs.clockNote.hidden = true;
  refs.clockNote.textContent = '';
  if (!view?.clock) {
    resetClockState();
    const roomCreated = liveState.events.find(
      (e): e is Extract<GameEvent, { type: 'room-created' }> => e.type === 'room-created',
    );
    const tc = roomCreated?.timeControl;
    if (tc) {
      const incrementSec = Math.round(tc.incrementMs / 1000);
      const tcLabel =
        incrementSec > 0
          ? `${formatClock(tc.initialMs)}+${incrementSec}`
          : formatClock(tc.initialMs);
      const colors: Color[] = ['black', 'white'];
      colors.forEach((color, index) => {
        const row = document.createElement('div');
        row.className = 'pregame';
        const label = document.createElement('span');
        label.textContent = capitalize(color);
        const time = document.createElement('strong');
        time.textContent = formatClock(tc.initialMs);
        row.append(label, time);
        (index === 0 ? refs.clockTop : refs.clockBottom).append(row);
      });
      refs.clockNote.textContent = `${tcLabel} · clock starts when both players are ready`;
      refs.clockNote.hidden = false;
    }
    return;
  }

  const clock = view.clock;
  const displayAt = isLive() ? Date.now() : (clock.runningSince ?? Date.now());
  const colors: Color[] = view.perspective === 'white' ? ['black', 'white'] : ['white', 'black'];
  const isPvp = liveState.roomMode === 'pvp';
  const humanColor = isColor(liveState.seat) ? liveState.seat : null;
  const playing = view.status.type === 'playing';
  const nextActiveColor = playing ? view.clock.activeColor : null;
  // Flash fires once on the transition: previous render had a different active
  // color (or none), and the new active is the seated player's. Skips the very
  // first render of a game so we don't flash on initial pregame->playing flip.
  const flashThisRender =
    playing &&
    humanColor !== null &&
    nextActiveColor === humanColor &&
    lastActiveClockColor !== null &&
    lastActiveClockColor !== humanColor;
  colors.forEach((color, index) => {
    const isActive = nextActiveColor === color;
    const row = document.createElement('div');
    row.dataset.color = color;
    const playerLine = document.createElement('span');
    playerLine.className = 'clock-player-line';
    const time = document.createElement('strong');
    if (isPvp) playerLine.append(presenceDot(liveState.connectedSeats[color] ?? false));
    const serverName = liveState.seatDisplayNames[color];
    const playerName =
      serverName ??
      (color === humanColor ? 'You' : liveState.roomMode === 'pve' ? 'Bot' : capitalize(color));
    const nameEl = document.createElement('span');
    nameEl.className = 'clock-name';
    nameEl.textContent = playerName;
    nameEl.title = playerName;
    playerLine.append(nameEl);
    const toMove = document.createElement('span');
    toMove.className = 'clock-to-move';
    toMove.textContent = 'to move';
    toMove.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    playerLine.append(toMove);
    const remainingMs = clockRemainingMs(clock, color, displayAt);
    time.textContent = formatClock(remainingMs, isActive && remainingMs < 10_000);
    const classes = ['clock-time-row'];
    if (isActive) classes.push('active');
    if (isActive && flashThisRender) classes.push('just-activated');
    row.className = classes.join(' ');
    row.append(time);
    if (isActive) playerLine.classList.add('active');
    const slot = index === 0 ? refs.clockTop : refs.clockBottom;
    if (index === 0) {
      slot.append(playerLine, row);
    } else {
      slot.append(row, playerLine);
    }
  });
  lastActiveClockColor = nextActiveColor;
}

// Lightweight per-tick refresh used by the 100ms interval. Updates only the
// time text and low-time emphasis on existing rows so a CSS animation applied
// to the active row by renderClocks() is not restarted each tick.
export function tickClockTimers(refs: ClockRefs, view: PlayerView | null): void {
  if (!view?.clock || view.status.type !== 'playing') return;
  if (refs.clockTop.children.length === 0 || refs.clockBottom.children.length === 0) {
    renderClocks(refs, view);
    return;
  }
  const displayAt = isLive() ? Date.now() : (view.clock.runningSince ?? Date.now());
  const rows = [...Array.from(refs.clockTop.children), ...Array.from(refs.clockBottom.children)];
  for (const row of rows as HTMLDivElement[]) {
    const color = row.dataset.color;
    if (color !== 'white' && color !== 'black') continue;
    const isActive = view.clock.activeColor === color;
    const remainingMs = clockRemainingMs(view.clock, color, displayAt);
    const strong = row.querySelector('strong');
    if (strong) strong.textContent = formatClock(remainingMs, isActive && remainingMs < 10_000);
  }
}

function presenceDot(connected: boolean): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = `presence-dot ${connected ? 'is-online' : 'is-offline'}`;
  dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
  dot.title = connected ? 'Connected' : 'Disconnected';
  return dot;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
