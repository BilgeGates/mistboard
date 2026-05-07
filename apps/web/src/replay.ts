import {
  fogOfWarVariant,
  replayGameEvents,
  type Board,
  type Color,
  type GameEvent,
  type GameState,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@bichess/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const allSquares: Square[] = ranks.flatMap((r) => files.map((f) => `${f}${r}` as Square));

const FALLBACK_PLAY_MS = 900;
const COMPUTE_SCALE = 50;
const MIN_PLAY_MS = 700;
const MAX_PLAY_MS = 2500;
const DEFAULT_BETWEEN_GAME_DELAY_MS = 8000;

const replayAbortControllers = new WeakMap<HTMLElement, AbortController>();

type MovePlayedExt = { type: 'move-played'; compute_ms?: number };

export type GameMeta = {
  whiteName: string | null;
  blackName: string | null;
  result: string;
  termination: string;
  plyCount: number;
};

export type ReplayOptions = {
  autoplay?: boolean;
  /** When false, white/black panes stay on their last fogged view at game-end. Truth always reveals. */
  revealOnFinish?: boolean;
  /** When false, the prev/next/play control bar is hidden (autoplay-only mode). */
  showControls?: boolean;
  /** When set, after each game finishes the next sample loads automatically. */
  loopSamples?: string[];
  /** Pause length on the reveal frame before cycling to the next loop sample. */
  betweenGameDelayMs?: number;
  /**
   * Override URL construction for sample ids. Default loads from
   * `/replay-samples/<safe-id>.jsonl`. Bakeoff browser uses this to point
   * at `/bakeoff/<path>` without the safe-id sanitization that would mangle
   * filenames containing slashes or dots.
   */
  urlForId?: (sampleId: string) => string;
  /**
   * Custom loader. Bypasses urlForId entirely — for callers that fetch
   * events from a JSON API rather than a static JSONL file.
   */
  loaderForId?: (sampleId: string) => Promise<GameEvent[]>;
  /**
   * Per-game metadata to display in a header bar above the boards. Keyed
   * by sampleId. When absent, no bar renders.
   */
  metadataByRoomId?: Record<string, GameMeta>;
};

export async function mountReplay(
  root: HTMLElement,
  initialSampleId: string,
  options: ReplayOptions = {},
): Promise<void> {
  const reveal = options.revealOnFinish !== false;
  const showControls = options.showControls !== false;
  const loopSamples = options.loopSamples;
  const betweenGameDelayMs = options.betweenGameDelayMs ?? DEFAULT_BETWEEN_GAME_DELAY_MS;
  const autoplay = options.autoplay === true || loopSamples !== undefined;
  const urlForId = options.urlForId ?? defaultUrlForId;
  const loaderForId = options.loaderForId;
  const metadataByRoomId = options.metadataByRoomId;

  // If mountReplay is called again on the same root (e.g. switching games
  // in the bakeoff browser), abort any keyboard listeners from the prior
  // mount so we don't leak handlers.
  const priorAbort = replayAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  replayAbortControllers.set(root, abortController);

  root.replaceChildren();
  root.classList.add('replay-page');

  const layout = document.createElement('div');
  layout.className = 'replay-layout';

  const whiteBaseLabel = "White's view";
  const blackBaseLabel = "Black's view";

  const whitePane = createPane(whiteBaseLabel);
  const truthPane = createPane('Truth');
  const blackPane = createPane(blackBaseLabel);
  layout.append(whitePane.el, truthPane.el, blackPane.el);
  root.append(layout);

  const gameIdFooter = metadataByRoomId ? createGameIdFooter() : null;
  if (gameIdFooter) root.append(gameIdFooter);

  const firstBtn = controlButton('|◀', 'Jump to start');
  const prevBtn = controlButton('◀', 'Previous ply');
  const playBtn = controlButton('▶ Play', 'Play');
  const nextBtn = controlButton('▶', 'Next ply');
  const lastBtn = controlButton('▶|', 'Jump to end');
  const plyLabel = document.createElement('span');
  plyLabel.className = 'replay-ply-label';

  if (showControls) {
    const controls = document.createElement('div');
    controls.className = 'replay-controls';
    controls.append(firstBtn, prevBtn, playBtn, nextBtn, lastBtn, plyLabel);
    root.append(controls);
  }

  const whiteCg = createBoard(whitePane.boardEl, 'white');
  const truthCg = createBoard(truthPane.boardEl, 'white');
  const blackCg = createBoard(blackPane.boardEl, 'black');

  let activeSample = initialSampleId;
  let events: GameEvent[] = [];
  let moveCount = 0;
  let currentPly = 0;
  let playTimer: number | null = null;
  let loopTimer: number | null = null;
  let finishedAck = false;

  function render(): void {
    const sliced = sliceToPly(events, currentPly);
    const projection = replayGameEvents(sliced);
    const state = projection.state;
    const finished = state.status.type === 'finished';

    setBoardFromState(truthCg, state);

    if (finished && reveal) {
      // Postgame reveal: collapse all three panes to truth so the viewer
      // sees the full board they couldn't see during play.
      setBoardFromState(whiteCg, state);
      setBoardFromState(blackCg, state);
    } else {
      const whiteView = fogOfWarVariant.getPlayerView(state, 'white');
      const blackView = fogOfWarVariant.getPlayerView(state, 'black');
      setBoardFromView(whiteCg, whiteView);
      setBoardFromView(blackCg, blackView);
    }

    const showRevealLabels = finished && reveal;
    whitePane.labelEl.textContent = showRevealLabels
      ? `${whiteBaseLabel} — revealed`
      : whiteBaseLabel;
    blackPane.labelEl.textContent = showRevealLabels
      ? `${blackBaseLabel} — revealed`
      : blackBaseLabel;
    whitePane.el.classList.toggle('revealed', showRevealLabels);
    blackPane.el.classList.toggle('revealed', showRevealLabels);

    if (showControls) {
      plyLabel.textContent = `Ply ${currentPly} / ${moveCount}${gameOverSuffix(state)}`;
      firstBtn.disabled = currentPly === 0;
      prevBtn.disabled = currentPly === 0;
      nextBtn.disabled = currentPly >= moveCount;
      lastBtn.disabled = currentPly >= moveCount;
    }

    if (finished) {
      applyEndGameState(state);
    } else {
      whitePane.el.classList.remove('winner', 'loser');
      blackPane.el.classList.remove('winner', 'loser');
      truthPane.el.classList.remove('finished');
      whitePane.statusEl.textContent = '';
      blackPane.statusEl.textContent = '';
      truthPane.statusEl.textContent = '';
    }

    if (finished && !finishedAck) {
      finishedAck = true;
      scheduleLoopIfNeeded();
    }
  }

  function scheduleLoopIfNeeded(): void {
    if (!loopSamples || loopSamples.length === 0) return;
    if (loopTimer !== null) return;
    loopTimer = window.setTimeout(() => {
      loopTimer = null;
      const next = pickNextSample(loopSamples, activeSample);
      void loadGame(next);
    }, betweenGameDelayMs);
  }

  function clearLoopTimer(): void {
    if (loopTimer !== null) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function stopPlay(): void {
    if (playTimer !== null) {
      window.clearTimeout(playTimer);
      playTimer = null;
    }
    playBtn.textContent = '▶ Play';
  }

  function startPlay(): void {
    if (playTimer !== null) return;
    playBtn.textContent = '⏸ Pause';
    scheduleNextPly();
  }

  function scheduleNextPly(): void {
    const nextPly = currentPly + 1;
    if (nextPly > moveCount) {
      stopPlay();
      return;
    }
    const delay = delayForPly(nextPly);
    playTimer = window.setTimeout(() => {
      currentPly = nextPly;
      render();
      scheduleNextPly();
    }, delay);
  }

  function delayForPly(ply: number): number {
    let movesSeen = 0;
    for (const event of events) {
      if (event.type !== 'move-played') continue;
      movesSeen += 1;
      if (movesSeen !== ply) continue;
      const ext = event as unknown as MovePlayedExt;
      if (typeof ext.compute_ms === 'number' && ext.compute_ms >= 0) {
        return clampPlay(ext.compute_ms * COMPUTE_SCALE);
      }
      return FALLBACK_PLAY_MS;
    }
    return FALLBACK_PLAY_MS;
  }

  function clampPlay(ms: number): number {
    return Math.min(MAX_PLAY_MS, Math.max(MIN_PLAY_MS, ms));
  }

  async function loadGame(sampleId: string): Promise<void> {
    stopPlay();
    clearLoopTimer();
    activeSample = sampleId;
    events = loaderForId
      ? await loaderForId(sampleId)
      : await loadEvents(sampleId, urlForId);
    moveCount = events.filter((e) => e.type === 'move-played').length;
    currentPly = 0;
    finishedAck = false;
    applyMetadata();
    render();
    if (autoplay) startPlay();
  }

  function applyMetadata(): void {
    const meta = metadataByRoomId?.[activeSample];
    whitePane.nameEl.textContent = meta?.whiteName ?? '';
    blackPane.nameEl.textContent = meta?.blackName ?? '';
    if (gameIdFooter) {
      gameIdFooter.textContent = meta ? `game ${activeSample}` : '';
    }
    // Reset any prior end-game state (returning to ply 0).
    whitePane.el.classList.remove('winner', 'loser');
    blackPane.el.classList.remove('winner', 'loser');
    truthPane.el.classList.remove('finished');
    whitePane.statusEl.textContent = '';
    blackPane.statusEl.textContent = '';
    truthPane.statusEl.textContent = '';
  }

  function applyEndGameState(state: GameState): void {
    if (state.status.type !== 'finished') return;
    const winner = state.status.winner;
    const reasonLabel = endGameReasonLabel(state.status.reason);

    if (winner === 'white') {
      whitePane.el.classList.add('winner');
      blackPane.el.classList.add('loser');
      whitePane.statusEl.textContent = 'WINNER';
      blackPane.statusEl.textContent = 'LOST';
    } else if (winner === 'black') {
      blackPane.el.classList.add('winner');
      whitePane.el.classList.add('loser');
      blackPane.statusEl.textContent = 'WINNER';
      whitePane.statusEl.textContent = 'LOST';
    } else {
      // Draw — neither side gets winner/loser visual state.
      whitePane.statusEl.textContent = 'DRAW';
      blackPane.statusEl.textContent = 'DRAW';
    }
    truthPane.el.classList.add('finished');
    truthPane.statusEl.textContent = reasonLabel;
  }

  function endGameReasonLabel(reason: string): string {
    if (reason === 'king-captured') return 'King captured';
    if (reason === 'timeout') return 'Timeout';
    if (reason === 'checkmate') return 'Checkmate';
    if (reason === 'draw') return 'Draw';
    return reason;
  }

  if (showControls) {
    firstBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      finishedAck = false;
      currentPly = 0;
      render();
    });
    prevBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      finishedAck = false;
      if (currentPly > 0) {
        currentPly -= 1;
        render();
      }
    });
    nextBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      if (currentPly < moveCount) {
        currentPly += 1;
        render();
      }
    });
    lastBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      currentPly = moveCount;
      render();
    });
    playBtn.addEventListener('click', () => {
      if (playTimer !== null) {
        stopPlay();
      } else if (currentPly >= moveCount) {
        finishedAck = false;
        currentPly = 0;
        render();
        startPlay();
      } else {
        startPlay();
      }
    });
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        if (currentPly > 0) {
          currentPly -= 1;
          render();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        if (currentPly < moveCount) {
          currentPly += 1;
          render();
        }
      }
    },
    { signal: abortController.signal },
  );

  await loadGame(initialSampleId);
}

function pickNextSample(pool: string[], current: string): string {
  if (pool.length <= 1) return pool[0] ?? current;
  const others = pool.filter((id) => id !== current);
  return others[Math.floor(Math.random() * others.length)] ?? pool[0];
}

function createGameIdFooter(): HTMLDivElement {
  const footer = document.createElement('div');
  footer.className = 'replay-game-id';
  return footer;
}

function createPane(label: string): {
  el: HTMLDivElement;
  boardEl: HTMLDivElement;
  labelEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  statusEl: HTMLDivElement;
} {
  const el = document.createElement('div');
  el.className = 'replay-pane';
  const labelEl = document.createElement('div');
  labelEl.className = 'replay-pane-label';
  labelEl.textContent = label;
  const nameEl = document.createElement('div');
  nameEl.className = 'replay-pane-name';
  const boardEl = document.createElement('div');
  boardEl.className = 'board replay-board';
  const statusEl = document.createElement('div');
  statusEl.className = 'replay-pane-status';
  el.append(labelEl, nameEl, boardEl, statusEl);
  return { el, boardEl, labelEl, nameEl, statusEl };
}

function controlButton(text: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'replay-button';
  btn.textContent = text;
  btn.title = title;
  return btn;
}

function sliceToPly(events: GameEvent[], ply: number): GameEvent[] {
  const result: GameEvent[] = [];
  let moves = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      if (moves >= ply) break;
      result.push(event);
      moves += 1;
    } else {
      result.push(event);
    }
  }
  return result;
}

function defaultUrlForId(sampleId: string): string {
  const safeId = sampleId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error(`invalid replay id: ${sampleId}`);
  return `/replay-samples/${safeId}.jsonl`;
}

async function loadEvents(
  sampleId: string,
  urlForId: (id: string) => string = defaultUrlForId,
): Promise<GameEvent[]> {
  const url = urlForId(sampleId);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load replay sample ${sampleId} at ${url}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

function createBoard(el: HTMLElement, orientation: Color): Api {
  return Chessground(el, {
    animation: { enabled: true, duration: 140 },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: '8/8/8/8/8/8/8/8',
    orientation,
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    viewOnly: true,
  });
}

function setBoardFromView(api: Api, view: PlayerView): void {
  const lastMove = view.lastMove
    ? ([view.lastMove.from, view.lastMove.to] as cg.Key[])
    : undefined;
  api.set({
    fen: boardFen(view.board),
    lastMove,
    highlight: { custom: hiddenSquareClasses(view), lastMove: true },
  });
}

function setBoardFromState(api: Api, state: GameState): void {
  const lastMove = state.lastMove
    ? ([state.lastMove.from, state.lastMove.to] as cg.Key[])
    : undefined;
  api.set({
    fen: boardFen(state.board),
    lastMove,
    highlight: { custom: new Map(), lastMove: true },
  });
}

function hiddenSquareClasses(view: PlayerView): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  if (view.variant !== 'fog-of-war' || view.status.type === 'finished') return classes;
  const visible = new Set(view.visibleSquares);
  for (const square of allSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
}

function boardFen(board: Board): string {
  const fenRanks = [8, 7, 6, 5, 4, 3, 2, 1];
  return fenRanks.map((rank) => boardRankFen(board, rank)).join('/');
}

function boardRankFen(board: Board, rank: number): string {
  let empty = 0;
  let fen = '';
  for (const file of files) {
    const piece = board[`${file}${rank}` as Square];
    if (!piece) {
      empty += 1;
      continue;
    }
    if (empty > 0) {
      fen += String(empty);
      empty = 0;
    }
    fen += pieceFen(piece.role, piece.color);
  }
  return empty > 0 ? `${fen}${empty}` : fen;
}

function pieceFen(role: PieceRole, color: Color): string {
  const map: Record<PieceRole, string> = {
    bishop: 'b',
    king: 'k',
    knight: 'n',
    pawn: 'p',
    queen: 'q',
    rook: 'r',
  };
  const ch = map[role];
  return color === 'white' ? ch.toUpperCase() : ch;
}

function gameOverSuffix(state: GameState): string {
  if (state.status.type !== 'finished') return '';
  const winner = state.status.winner;
  if (!winner) return ` — drawn (${state.status.reason})`;
  return ` — ${winner} wins (${state.status.reason})`;
}
