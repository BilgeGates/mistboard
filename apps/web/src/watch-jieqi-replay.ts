// Mistboard TV renderer for Jieqi: the jieqi arm of the
// `gameSpecId -> ReplayHandle` dispatch in watch-route.ts (sibling of the Dark
// Mini Xiangqi xiangqi path and replay.ts's chessground path). It replays a
// FINISHED game via the postgame endpoint (loadJieqiPostgame) — never live
// spectating — so there is no fog/redaction work here: Jieqi has NO fog at all
// (positions are public; only a face-down piece's IDENTITY is hidden, and the
// server-computed per-color views already render those as backs). It reuses the
// shared replay chrome (header strip, triptych panes) plus the watch control
// bar + auto-play, matching the Dark Mini Xiangqi "TV" layout. Rendering the
// server-computed views (postgame `history`) rather than recomputing client-side
// keeps identity-masking correct.
import type { JieqiColor, JieqiPlayerView } from '@mistboard/game';
import { fillCapturedPool } from './live-jieqi.js';
import {
  type JieqiPostgameResponse,
  type JieqiPostgameViewKey,
  loadJieqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './live-jieqi-postgame.js';
import { installJieqiBoardStyles, renderJieqiBoardSvg } from './live-jieqi-render.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { createPane, type ReplayPaneHandle } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { formatClock } from './web-utils.js';

const AUTO_PLAY_PLY_MS = 1100;
const AUTO_PLAY_LOOP_HOLD_MS = 2600;

export type JieqiWatchReplayOptions = {
  autoplay?: boolean;
  metadataByRoomId?: Record<string, GameMeta>;
};

type ControlRefs = {
  first: HTMLButtonElement;
  prev: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  last: HTMLButtonElement;
  plyLabel: HTMLElement;
};

function paneKind(key: JieqiPostgameViewKey): 'white' | 'truth' | 'black' {
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

function timeControlLabel(postgame: JieqiPostgameResponse): string {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${Math.round((initialMs ?? 0) / 60000)}+${Math.round((incrementMs ?? 0) / 1000)}`;
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

function controlButton(symbol: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', aria);
  return button;
}

// Lichess convention: a player's captured material sits next to that player. The
// top strip is the side at the top of the board (the orientation opponent), so
// it shows the pieces THAT player lost; the bottom strip is the viewer side, so
// it shows the pieces the bottom player lost. fillCapturedPool filters by former
// owner, so a face-down piece the viewer can't identify renders as a back.
function renderPaneCaptures(
  pane: ReplayPaneHandle,
  view: JieqiPlayerView,
  bottomColor: JieqiColor,
): void {
  const topColor: JieqiColor = bottomColor === 'red' ? 'black' : 'red';
  fillCapturedPool(pane.topCapturesEl, view.captured, topColor);
  fillCapturedPool(pane.capturesEl, view.captured, bottomColor);
}

export async function mountJieqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: JieqiWatchReplayOptions,
): Promise<ReplayHandle> {
  installJieqiBoardStyles();
  const autoplay = options.autoplay ?? true;

  let activeId = roomId;
  let destroyed = false;
  let timer: number | null = null;
  let paused = !autoplay;

  // Per-game render state, rebuilt on each loadGame.
  let boardTargets: Array<{ pane: ReplayPaneHandle; key: JieqiPostgameViewKey }> = [];
  let controls: ControlRefs | null = null;
  let seatCells: { red: SeatCell; black: SeatCell } | null = null;
  // Per-ply remaining-time series, indexed by ply; null when the game was
  // untimed. Jieqi's postgame payload carries no dense clock series, so the
  // watch shows the static initial time (no continuous countdown to animate).
  let initialClock: Record<JieqiColor, number> | null = null;
  let maxPly = 0;
  let currentPly = 0;
  let boardOrientation: JieqiColor = 'red';
  let activePostgame: JieqiPostgameResponse | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const sync = (): void => {
    if (!activePostgame || !controls) return;
    for (const target of boardTargets) {
      const view = postgameViewAtPly(activePostgame, target.key, currentPly);
      if (view) {
        // No fog: the truth view shows every identity; per-color views render
        // the opponent's face-down pieces as backs (the renderer keys off the
        // view entry's faceDown flag, not a showFog option).
        target.pane.boardEl.innerHTML = renderJieqiBoardSvg(view, boardOrientation, {});
        renderPaneCaptures(target.pane, view, boardOrientation);
      }
    }
    const result = currentPly >= maxPly ? ` — ${resultLabel(activePostgame.game.result)}` : '';
    controls.plyLabel.textContent = `Ply ${currentPly} / ${maxPly}${result}`;
    controls.first.disabled = currentPly <= 0;
    controls.prev.disabled = currentPly <= 0;
    controls.next.disabled = currentPly >= maxPly;
    controls.last.disabled = currentPly >= maxPly;

    // Red moves first, so after an even ply Red is to move; no active side once
    // the game has ended.
    const toMove = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'red' : 'black';
    if (seatCells) {
      if (initialClock) {
        seatCells.red.clock.textContent = formatClock(initialClock.red);
        seatCells.black.clock.textContent = formatClock(initialClock.black);
      }
      seatCells.red.row.classList.toggle('active', toMove === 'red');
      seatCells.black.row.classList.toggle('active', toMove === 'black');
    }
  };

  const scheduleAuto = (): void => {
    if (paused || destroyed || maxPly <= 0) return;
    clearTimer();
    const atEnd = currentPly >= maxPly;
    timer = window.setTimeout(
      () => {
        if (destroyed) return;
        currentPly = atEnd ? 0 : currentPly + 1;
        sync();
        scheduleAuto();
      },
      atEnd ? AUTO_PLAY_LOOP_HOLD_MS : AUTO_PLAY_PLY_MS,
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

  const buildGame = (postgame: JieqiPostgameResponse): void => {
    activePostgame = postgame;
    maxPly = postgameReplayMaxPly(postgame);
    currentPly = 0;
    paused = !autoplay;
    boardOrientation = 'red';
    const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
    initialClock = initialMs === null ? null : { red: initialMs, black: initialMs };

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
    // The jieqi postgame payload carries no seat-name fields, so the cells fall
    // back to the color labels (matchup name lives in the header title).
    const redCell = seatCell('Red');
    const blackCell = seatCell('Black');
    header.whiteCell.append(redCell.row);
    header.blackCell.append(blackCell.row);
    seatCells = { red: redCell, black: blackCell };

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
  };

  const load = async (nextId: string): Promise<void> => {
    clearTimer();
    activeId = nextId;
    const result = await loadJieqiPostgame(nextId);
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
      root.replaceChildren();
    },
    loadGame: async (sampleId: string) => {
      await load(sampleId);
    },
    // Watch drives game selection through the queue; no internal auto-advance pool.
    updateLoopPool: () => {},
  };
}
