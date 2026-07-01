// Mistboard TV renderer for Dark Mini Xiangqi: the xiangqi half of the
// `variant -> ReplayHandle` dispatch in watch-route.ts (sibling of replay.ts's
// chessground path). It reuses the postgame payload + the shared replay chrome
// (header strip, triptych panes) and adds the watch's control bar + auto-play,
// matching the dark-chess "TV" layout: header on top, 3 fog views, a control
// bar with a ply line below (no move list). Rendering the server-computed fog
// views (postgame `history`) rather than recomputing client-side keeps it
// leak-safe. The shared viewer is a candidate to extract once a third variant
// (Crossroads) needs watch; until then it stays a parallel tenant.
import type { MiniXiangqiColor } from '@mistboard/game';
import {
  type DarkMiniXiangqiPostgameResponse,
  type DarkMiniXiangqiPostgameViewKey,
  loadDarkMiniXiangqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './dark-mini-xiangqi-postgame.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import {
  miniXiangqiCapturesFromTruthView,
  renderMiniXiangqiPaneCaptureSplit,
} from './mini-xiangqi-captures.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { createPane, type ReplayPaneHandle } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { reconstructMoveDelays } from './showcase-clock.js';
import { pickCompactViewKey } from './showcase-compact-view.js';
import { formatClock } from './web-utils.js';

const AUTO_PLAY_PLY_MS = 1100;
const AUTO_PLAY_LOOP_HOLD_MS = 2600;
// Compact showcase per-move pacing: play each move at its real recorded duration
// clamped to this band, and tick the mover's clock across it.
const SHOWCASE_MIN_MOVE_MS = 700;
const SHOWCASE_MAX_MOVE_MS = 2500;

export type MiniXiangqiWatchReplayOptions = {
  autoplay?: boolean;
  metadataByRoomId?: Record<string, GameMeta>;
  /**
   * Homepage showcase mode: a single fogged board (no header/control-bar/ply-line/
   * clocks) showing one random side's own POV — never truth. Pairs with onGameEnd
   * for cross-variant cycling.
   */
  compact?: boolean;
  /** Called once at the final ply (after the loop hold) instead of restarting the
   *  game, so an outer showcase controller can advance to the next pooled game. */
  onGameEnd?: () => void;
  /** Player names for the compact seats (first = red, second = black), keyed by
   *  room id; absent names fall back to the color labels. */
  namesByRoomId?: Record<string, { first: string; second: string }>;
};

type ControlRefs = {
  first: HTMLButtonElement;
  prev: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  last: HTMLButtonElement;
  plyLabel: HTMLElement;
};

function paneKind(key: DarkMiniXiangqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function timeControlLabel(postgame: DarkMiniXiangqiPostgameResponse): string {
  const tc = postgame.game.timeControl ?? postgame.state.timeControl;
  if (!tc) return 'Untimed';
  return `${Math.round(tc.initialMs / 60000)}+${Math.round(tc.incrementMs / 1000)}`;
}

// Title is the matchup (like the dark-chess watch's "Human vs engine"), not the
// variant name; the channel tab already conveys the variant.
function matchupLabel(mode: string): string {
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'eve') return 'Engine vs engine';
  return 'Human vs human';
}

type SeatCell = { row: HTMLElement; clock: HTMLElement };

function seatCell(name: string): SeatCell {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = name;
  const clock = document.createElement('span');
  clock.className = 'replay-clock-time';
  row.append(label, clock);
  return { row, clock };
}

// Dense per-ply remaining-time series from the payload's `clocks` (indexed by
// ply, possibly sparse); carry forward over gaps and start at the initial time.
// Null when the game was untimed.
function clockSeries(
  postgame: DarkMiniXiangqiPostgameResponse,
): Array<Record<MiniXiangqiColor, number>> | null {
  const tc = postgame.game.timeControl ?? postgame.state.timeControl;
  if (!tc) return null;
  const raw = postgame.clocks ?? [];
  const maxPly = postgameReplayMaxPly(postgame);
  const series: Array<Record<MiniXiangqiColor, number>> = [];
  let last: Record<MiniXiangqiColor, number> = raw[0] ?? { red: tc.initialMs, black: tc.initialMs };
  for (let ply = 0; ply <= maxPly; ply += 1) {
    last = raw[ply] ?? last;
    series[ply] = last;
  }
  return series;
}

function controlButton(symbol: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', aria);
  return button;
}

export async function mountMiniXiangqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: MiniXiangqiWatchReplayOptions,
): Promise<ReplayHandle> {
  installMiniXiangqiBoardStyles();
  const autoplay = options.autoplay ?? true;
  const compact = options.compact === true;
  const onGameEnd = options.onGameEnd;
  const namesByRoomId = options.namesByRoomId;

  let activeId = roomId;
  let destroyed = false;
  let timer: number | null = null;
  let paused = !autoplay;
  // Guards a single onGameEnd fire per game so the loop hold can't re-enter it.
  let endFired = false;

  // Per-game render state, rebuilt on each loadGame.
  let boardTargets: Array<{ pane: ReplayPaneHandle; key: DarkMiniXiangqiPostgameViewKey }> = [];
  let controls: ControlRefs | null = null;
  let seatCells: { red: SeatCell; black: SeatCell } | null = null;
  let clocks: Array<Record<MiniXiangqiColor, number>> | null = null;
  let incrementMs = 0;
  // Compact showcase: per-move real-duration playback delays (null = fixed pacing).
  let moveDelays: number[] | null = null;
  // Continuous-countdown animation for the side to move (see tickClock).
  let clockAnim: {
    side: MiniXiangqiColor;
    startVal: number;
    floorVal: number;
    shownAt: number;
    windowMs: number;
  } | null = null;
  let clockTickTimer: number | null = null;
  let maxPly = 0;
  let currentPly = 0;
  let boardOrientation: MiniXiangqiColor = 'red';
  let activePostgame: DarkMiniXiangqiPostgameResponse | null = null;
  // Compact showcase seats (name + native per-ply clock), rebuilt per game.
  let compactSeats: {
    top: { row: HTMLElement; clockEl: HTMLElement; color: MiniXiangqiColor };
    bottom: { row: HTMLElement; clockEl: HTMLElement; color: MiniXiangqiColor };
  } | null = null;

  const compactSeatRow = (name: string): { row: HTMLElement; clockEl: HTMLElement } => {
    const row = document.createElement('div');
    row.className = 'showcase-seat';
    const nameEl = document.createElement('span');
    nameEl.className = 'showcase-seat-name';
    nameEl.textContent = name;
    const clockEl = document.createElement('span');
    clockEl.className = 'showcase-seat-clock';
    row.append(nameEl, clockEl);
    return { row, clockEl };
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const sync = (): void => {
    if (!activePostgame) return;
    const captures = miniXiangqiCapturesFromTruthView(
      postgameViewAtPly(activePostgame, 'truth', currentPly),
    );
    for (const target of boardTargets) {
      const entryView = postgameViewAtPly(activePostgame, target.key, currentPly);
      if (entryView) {
        target.pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(entryView, boardOrientation, {
          showFog: target.key !== 'truth',
        });
      }
      if (!compact) {
        renderMiniXiangqiPaneCaptureSplit(target.pane, captures, boardOrientation);
      }
    }
    if (compactSeats) {
      if (clocks) {
        const at = clocks[Math.min(currentPly, clocks.length - 1)] ?? clocks[0]!;
        compactSeats.top.clockEl.textContent = formatClock(at[compactSeats.top.color]);
        compactSeats.bottom.clockEl.textContent = formatClock(at[compactSeats.bottom.color]);
      }
      const active = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'red' : 'black';
      compactSeats.top.row.classList.toggle('active', active === compactSeats.top.color);
      compactSeats.bottom.row.classList.toggle('active', active === compactSeats.bottom.color);
    }
    if (controls) {
      const result = currentPly >= maxPly ? ` — ${resultLabel(activePostgame.game.result)}` : '';
      controls.plyLabel.textContent = `Ply ${currentPly} / ${maxPly}${result}`;
      controls.first.disabled = currentPly <= 0;
      controls.prev.disabled = currentPly <= 0;
      controls.next.disabled = currentPly >= maxPly;
      controls.last.disabled = currentPly >= maxPly;
    }

    // Red moves first, so after an even ply Red is to move; no active side once
    // the game has ended.
    const toMove = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'red' : 'black';
    if (seatCells) {
      if (clocks) {
        const at = clocks[Math.min(currentPly, clocks.length - 1)] ?? clocks[0]!;
        seatCells.red.clock.textContent = formatClock(at.red);
        seatCells.black.clock.textContent = formatClock(at.black);
      }
      seatCells.red.row.classList.toggle('active', toMove === 'red');
      seatCells.black.row.classList.toggle('active', toMove === 'black');
    }
    // Arm the countdown for the side to move: animate its clock from this ply's
    // value toward the value just before its next move (next snapshot minus the
    // increment it earns on completing the move), over the auto-play window.
    if (toMove && clocks) {
      const startVal = clocks[Math.min(currentPly, clocks.length - 1)]?.[toMove] ?? 0;
      const nextVal = clocks[currentPly + 1]?.[toMove];
      clockAnim = {
        side: toMove,
        startVal,
        floorVal: nextVal === undefined ? startVal : Math.max(0, nextVal - incrementMs),
        shownAt: Date.now(),
        windowMs: moveDelays?.[currentPly + 1] ?? AUTO_PLAY_PLY_MS,
      };
    } else {
      clockAnim = null;
    }
  };

  // Smoothly drains the active clock between ply snapshots (a long think shows as
  // a fast drop, compressed into the auto-play window); mirrors the dark-chess
  // watch's clock tick. Settles at the floor when paused.
  const tickClock = (): void => {
    if (!clockAnim) return;
    const fraction = Math.min((Date.now() - clockAnim.shownAt) / clockAnim.windowMs, 1);
    const displayed = Math.max(
      0,
      clockAnim.startVal - (clockAnim.startVal - clockAnim.floorVal) * fraction,
    );
    if (compactSeats) {
      const seat =
        compactSeats.top.color === clockAnim.side ? compactSeats.top : compactSeats.bottom;
      seat.clockEl.textContent = formatClock(displayed);
    } else if (seatCells) {
      seatCells[clockAnim.side].clock.textContent = formatClock(displayed);
    }
  };

  const scheduleAuto = (): void => {
    if (paused || destroyed || maxPly <= 0) return;
    clearTimer();
    const atEnd = currentPly >= maxPly;
    timer = window.setTimeout(
      () => {
        if (destroyed) return;
        if (atEnd) {
          // Showcase mode hands off to the outer controller instead of replaying
          // the same game. Watch (no onGameEnd) loops the single game as before.
          if (onGameEnd) {
            if (!endFired) {
              endFired = true;
              onGameEnd();
            }
            return;
          }
          currentPly = 0;
        } else {
          currentPly += 1;
        }
        sync();
        scheduleAuto();
      },
      atEnd ? AUTO_PLAY_LOOP_HOLD_MS : (moveDelays?.[currentPly + 1] ?? AUTO_PLAY_PLY_MS),
    );
  };

  const setPaused = (next: boolean): void => {
    paused = next;
    if (controls) controls.play.textContent = paused ? '▶ Play' : '⏸ Pause';
    if (paused) clearTimer();
    else scheduleAuto();
  };

  // A manual step pauses auto-play (TV you can pause and scrub).
  const manualJump = (ply: number): void => {
    setPaused(true);
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };

  // The single fogged board for compact showcase mode: one random side's own POV,
  // stable per room, oriented to that side. Never the truth board.
  const pickCompactTarget = (
    game: DarkMiniXiangqiPostgameResponse,
  ): { key: DarkMiniXiangqiPostgameViewKey; orientation: MiniXiangqiColor } => {
    const choice = pickCompactViewKey({
      roomId: activeId,
      entries: postgameViewEntries(game),
      paneKind,
    });
    return { key: choice.key, orientation: choice.side === 'second' ? 'black' : 'red' };
  };

  const buildGame = (postgame: DarkMiniXiangqiPostgameResponse): void => {
    activePostgame = postgame;
    maxPly = postgameReplayMaxPly(postgame);
    currentPly = 0;
    paused = !autoplay;
    boardOrientation = 'red';
    incrementMs = (postgame.game.timeControl ?? postgame.state.timeControl)?.incrementMs ?? 0;
    endFired = false;

    // Compact showcase: a single fogged board framed by a player name + real
    // clock on each side (DMX carries a native per-ply clock series).
    if (compact) {
      const target = pickCompactTarget(postgame);
      boardOrientation = target.orientation;
      // Compact showcase shows no capture rows (DMX is not a drop/reserve variant).
      const pane = createPane('', paneKind(target.key), false, 'split');
      boardTargets = [{ pane, key: target.key }];
      controls = null;
      seatCells = null;
      clocks = clockSeries(postgame);
      // Play each move at its real recorded duration (clamped); the clock ticks
      // down across that window via tickClock.
      const moves = postgame.timeline.flatMap((event) =>
        typeof event.color === 'string' && typeof event.ply === 'number'
          ? [{ at: event.at, color: event.color, ply: event.ply }]
          : [],
      );
      moveDelays =
        moves.length > 0
          ? reconstructMoveDelays({
              moves,
              minMs: SHOWCASE_MIN_MOVE_MS,
              maxMs: SHOWCASE_MAX_MOVE_MS,
            })
          : null;

      const names = namesByRoomId?.[activeId];
      const bottomColor = boardOrientation;
      const topColor: MiniXiangqiColor = bottomColor === 'red' ? 'black' : 'red';
      const nameFor = (color: MiniXiangqiColor): string =>
        names ? (color === 'red' ? names.first : names.second) : color === 'red' ? 'Red' : 'Black';
      const topSeat = compactSeatRow(nameFor(topColor));
      const bottomSeat = compactSeatRow(nameFor(bottomColor));
      compactSeats = {
        top: { row: topSeat.row, clockEl: topSeat.clockEl, color: topColor },
        bottom: { row: bottomSeat.row, clockEl: bottomSeat.clockEl, color: bottomColor },
      };

      const layout = document.createElement('div');
      layout.className = 'replay-layout replay-layout-solo';
      layout.append(topSeat.row, pane.el, bottomSeat.row);
      root.replaceChildren(layout);
      sync();
      scheduleAuto();
      if (clocks && clockTickTimer === null) {
        clockTickTimer = window.setInterval(tickClock, 100);
      }
      return;
    }

    const header = createGameHeaderStrip();
    header.title.textContent = matchupLabel(postgame.game.mode);
    const chip = document.createElement('span');
    chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
    chip.textContent = resultLabel(postgame.game.result);
    const detail = document.createElement('span');
    detail.className = 'replay-game-header-result-detail';
    detail.textContent = `by ${labelize(postgame.game.termination)}`;
    header.result.append(chip, detail);
    const plies = document.createElement('span');
    plies.textContent = `${postgame.game.plyCount} plies`;
    const sep = document.createElement('span');
    sep.className = 'replay-game-header-sep';
    sep.textContent = '·';
    const clock = document.createElement('span');
    clock.textContent = timeControlLabel(postgame);
    const sepRated = document.createElement('span');
    sepRated.className = 'replay-game-header-sep';
    sepRated.textContent = '·';
    const rated = document.createElement('span');
    rated.textContent = postgame.game.rated ? 'Rated' : 'Casual';
    header.meta.append(plies, sep, clock, sepRated, rated);
    const redCell = seatCell(postgame.game.redName || 'Red');
    const blackCell = seatCell(postgame.game.blackName || 'Black');
    header.whiteCell.append(redCell.row);
    header.blackCell.append(blackCell.row);
    seatCells = { red: redCell, black: blackCell };
    clocks = clockSeries(postgame);

    const layout = document.createElement('div');
    layout.className = 'replay-layout replay-layout-all';
    boardTargets = [];
    for (const entry of postgameViewEntries(postgame)) {
      // Center board reads "Truth" on watch, matching the dark-chess TV (the
      // postgame review keeps its own "Server truth" label).
      const label = entry.key === 'truth' ? 'Truth' : entry.label;
      const pane = createPane(label, paneKind(entry.key), true, 'split');
      boardTargets.push({ pane, key: entry.key });
      layout.append(pane.el);
    }

    // Control bar below the boards (matches the dark-chess watch: no move list).
    const bar = document.createElement('div');
    bar.className = 'replay-control-bar';
    const first = controlButton('|<', 'First move');
    const prev = controlButton('<', 'Previous move');
    const play = controlButton(paused ? '▶ Play' : '⏸ Pause', 'Play / pause');
    const next = controlButton('>', 'Next move');
    const last = controlButton('>|', 'Last move');
    const flip = controlButton('↕ Flip', 'Flip boards');
    bar.append(first, prev, play, next, last, flip);
    const plyLine = document.createElement('div');
    plyLine.className = 'replay-ply-line';
    const plyLabel = document.createElement('span');
    plyLine.append(plyLabel);

    controls = { first, prev, play, next, last, plyLabel };
    first.onclick = () => manualJump(0);
    prev.onclick = () => manualJump(currentPly - 1);
    next.onclick = () => manualJump(currentPly + 1);
    last.onclick = () => manualJump(maxPly);
    play.onclick = () => setPaused(!paused);
    flip.onclick = () => {
      boardOrientation = boardOrientation === 'red' ? 'black' : 'red';
      sync();
    };

    // Append directly to root (no wrapper), exactly like the dark-chess watch, so
    // the header/boards/control-bar spacing and alignment are inherited rather
    // than re-derived.
    root.replaceChildren(header.el, layout, bar, plyLine);

    sync();
    scheduleAuto();
    if (clockTickTimer === null) clockTickTimer = window.setInterval(tickClock, 100);
  };

  const load = async (nextId: string): Promise<void> => {
    clearTimer();
    activeId = nextId;
    const result = await loadDarkMiniXiangqiPostgame(nextId);
    if (destroyed) return;
    if (!result.ok) {
      const notice = document.createElement('p');
      notice.className = 'watch-empty';
      notice.textContent = 'This game could not be loaded.';
      root.replaceChildren(notice);
      return;
    }
    buildGame(result.postgame);
  };

  await load(roomId);

  return {
    activeSampleId: () => activeId,
    destroy: () => {
      destroyed = true;
      clearTimer();
      if (clockTickTimer !== null) {
        window.clearInterval(clockTickTimer);
        clockTickTimer = null;
      }
      root.replaceChildren();
    },
    loadGame: async (sampleId: string) => {
      await load(sampleId);
    },
    // Watch drives game selection through the queue; no internal auto-advance pool.
    updateLoopPool: () => {},
  };
}
