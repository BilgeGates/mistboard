// Live multiplayer room client for standard Xiangqi (9x10) — an OPEN-INFORMATION
// tenant on the generic live-client core (variant-tenant/live-client.ts owns
// bootstrap, frame application, renderAll skeleton, the replay CAPTURE
// controller, and the two-column move list). This module keeps what is genuinely
// standard Xiangqi's: the intersection-board SVG, click/drag over pieces, and the
// pure click-to-move decision. The postgame module reuses renderXiangqiBoardSvg.
//
// Unlike Dark Xiangqi there is NO fog: every player and spectator receives the
// full truth board (plain pieces, no shrouding), so there is no fog mask, no
// shrouded entries, and no visible-square gating.

import {
  type StandardXiangqiPlayerView,
  XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { tokenPieceSize } from './board-metrics.js';
import { xiangqiEnabled } from './feature-flags.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import {
  maybePlayXiangqiSnapshotSound,
  resetXiangqiSoundState,
  soundForOwnXiangqiMove,
} from './live-xiangqi-sound.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

type XiangqiMoveEvent = TenantMovePlayed<XiangqiColor, XiangqiMove>;

const FILES = 'abcdefghi';
const FILE_COUNT = 9;
const RANK_COUNT = 10;
const CELL = 60;
const MARGIN = 36;
const WIDTH = MARGIN * 2 + (FILE_COUNT - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANK_COUNT - 1) * CELL;
// Corner rounding (viewBox units). Kept in sync with the `.xiangqi-live-board`
// container border-radius so the SVG background and the clipped container agree.
const BOARD_RADIUS = 16;
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOTTOM = MARGIN + 5 * CELL;
const PIECE_SIZE = tokenPieceSize(CELL);
const HIT_HALF = 26;

// ── Xiangqi-owned interaction/render state ───────────────────────────────────

let core: TenantLiveClientContext<XiangqiColor, StandardXiangqiPlayerView> | null = null;
let selectedSquare: XiangqiSquare | null = null;
// The square a piece is being dragged from. The renderer keeps a dim source
// shadow while the shared drag layer shows the floating ghost.
let draggingFrom: XiangqiSquare | null = null;

// ── Shared tenant room chrome config ─────────────────────────────────────────

const xiangqiWebTenant: WebVariantTenant<XiangqiColor> = {
  displayName: 'Chinese Chess',
  colors: ['red', 'black'],
  isColor: isXiangqiColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: xiangqiEnabled,
  reviewUrl: (roomId) => `/xiangqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: xiangqiReasonPhrase,
  disabledTitle: 'Chinese Chess disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Chinese Chess room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the full board.',
  selectInstruction: 'Select one of your pieces, then choose a destination.',
};

function xiangqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'general-captured':
      return 'general capture';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    case 'repetition':
      return 'threefold repetition';
    default:
      return 'the game rules';
  }
}

const client = createTenantLiveClient<XiangqiColor, StandardXiangqiPlayerView, XiangqiMove>({
  tenant: xiangqiWebTenant,
  gameSpecId: XIANGQI_SPEC_ID,
  defaultRoomId: 'xq_dev',
  boardClass: 'xiangqi-live-board',
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: XIANGQI_SPEC_ID,
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onSnapshotApplied: () => {
    if (core) maybePlayXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  resetSounds: resetXiangqiSoundState,
  resetState: () => {
    selectedSquare = null;
    draggingFrom = null;
  },
  renderBoard,
  onDisabled: () => {
    selectedSquare = null;
  },
  setup: (ctx) => {
    core = ctx;
    installXiangqiBoardInteraction(ctx.refs);
    installSelectionClickAway({
      roots: () => [core?.refs.board],
      hasSelection: () => selectedSquare !== null,
      clearSelection: () => {
        selectedSquare = null;
        draggingFrom = null;
        if (core) renderBoard(core.refs, core.displayedView());
      },
    });
  },
  moveList: {
    rowClass: 'move-row xiangqi-move-row',
    cellPrefix: 'xiangqi-move-row',
    listClass: 'xiangqi-move-list',
    masked: false,
    emptyText: 'No moves yet',
    notate: (move) => `${move.from}-${move.to}`,
    isMoveEvent: isXiangqiMoveEvent,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    plyForView: (view, ctx) => {
      if (view.status.type === 'playing') {
        const completedFullMoves = Math.max(0, view.moveNumber - 1);
        return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
      }
      if (ctx.positionChanged && view.lastMove) return ctx.latestPly + 1;
      return ctx.latestPly;
    },
  },
});

export function bootstrapXiangqiLiveRoom(): void {
  client.bootstrap();
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function renderXiangqiBoardSvg(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor = view.perspective,
): string {
  return boardSvg(view, perspective, { interactive: false });
}

function renderBoard(liveRefs: LiveRefs, view: StandardXiangqiPlayerView | null): void {
  liveRefs.board.className = 'board xiangqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Chinese Chess board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = core?.orientation() ?? view.perspective;
  liveRefs.board.innerHTML = boardSvg(view, perspective, { interactive: true });
  // Click + drag are delegated to the persistent board container once at mount
  // (installXiangqiBoardInteraction), so they survive these innerHTML re-renders.
}

function boardSvg(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor,
  options: { interactive: boolean },
): string {
  return `
    <svg class="xq-live-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect class="xq-live-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${BOARD_RADIUS}"/>
      <g class="xq-live-palace-bands">${palaceBands(perspective)}</g>
      <g class="xq-live-grid">${gridLayer()}</g>
      <g class="xq-live-palace">${palaceLayer(perspective)}</g>
      <g class="xq-live-river">${riverLayer(perspective)}</g>
      <g class="xq-live-lastmove">${lastMoveLayer(view, perspective)}</g>
      <g class="xq-live-selection">${selectionLayer(selectedSquare, perspective)}</g>
      <g class="xq-live-hints">${options.interactive ? '' : hintLayer(view, perspective)}</g>
      <g class="xq-live-pieces">${pieceLayer(view, perspective, draggingFrom)}</g>
      <g class="xq-live-clicks">${options.interactive ? clickLayer(view, perspective) : ''}</g>
    </svg>
  `;
}

function gridLayer(): string {
  const parts: string[] = [];
  const left = MARGIN;
  const right = MARGIN + (FILE_COUNT - 1) * CELL;
  const top = MARGIN;
  const bottom = MARGIN + (RANK_COUNT - 1) * CELL;
  for (let rank = 0; rank < RANK_COUNT; rank++) {
    const y = MARGIN + rank * CELL;
    parts.push(`<line class="xq-live-line" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`);
  }
  for (let file = 0; file < FILE_COUNT; file++) {
    const x = MARGIN + file * CELL;
    if (file === 0 || file === FILE_COUNT - 1) {
      parts.push(`<line class="xq-live-line" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`);
    } else {
      parts.push(`<line class="xq-live-line" x1="${x}" y1="${top}" x2="${x}" y2="${RIVER_TOP}"/>`);
      parts.push(
        `<line class="xq-live-line" x1="${x}" y1="${RIVER_BOTTOM}" x2="${x}" y2="${bottom}"/>`,
      );
    }
  }
  return parts.join('');
}

function palaceBands(perspective: XiangqiColor): string {
  return [palaceBand(3, 1, 5, 3, perspective), palaceBand(3, 8, 5, 10, perspective)].join('');
}

function palaceBand(
  fileMin: number,
  rankMin: number,
  fileMax: number,
  rankMax: number,
  perspective: XiangqiColor,
): string {
  const a = intersection(fileMin, rankMin, perspective);
  const b = intersection(fileMax, rankMax, perspective);
  return `<rect class="xq-live-palace-band" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}"/>`;
}

function palaceLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankMin: 1, rankMax: 3 },
    { fileMin: 3, fileMax: 5, rankMin: 8, rankMax: 10 },
  ]) {
    const a = intersection(palace.fileMin, palace.rankMax, perspective);
    const b = intersection(palace.fileMax, palace.rankMin, perspective);
    const c = intersection(palace.fileMax, palace.rankMax, perspective);
    const d = intersection(palace.fileMin, palace.rankMin, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function riverLayer(perspective: XiangqiColor): string {
  const y = (RIVER_TOP + RIVER_BOTTOM) / 2;
  void perspective;
  return `
    <text x="${MARGIN + 4 * CELL}" y="${y + 1}">楚 河   漢 界</text>
  `;
}

function lastMoveLayer(view: StandardXiangqiPlayerView, perspective: XiangqiColor): string {
  if (!view.lastMove) return '';
  return [view.lastMove.from, view.lastMove.to]
    .map((square) => {
      const coord = coordOf(square);
      const center = intersection(coord.file, coord.rank, perspective);
      return `<circle class="xq-live-lastmove-cell" cx="${center.x}" cy="${center.y}" r="27"/>`;
    })
    .join('');
}

function selectionLayer(square: XiangqiSquare | null, perspective: XiangqiColor): string {
  if (!square) return '';
  const coord = coordOf(square);
  const center = intersection(coord.file, coord.rank, perspective);
  return `<circle class="xq-live-selection-cell" cx="${center.x}" cy="${center.y}" r="30"/>`;
}

function hintLayer(view: StandardXiangqiPlayerView, perspective: XiangqiColor): string {
  if (!selectedSquare) return '';
  return view.legalMoves
    .filter((move) => move.from === selectedSquare)
    .map((move) => {
      const coord = coordOf(move.to);
      const center = intersection(coord.file, coord.rank, perspective);
      const occupied = view.board[move.to] !== undefined;
      return occupied
        ? `<circle class="xq-live-hint-capture" cx="${center.x}" cy="${center.y}" r="28"/>`
        : `<circle class="xq-live-hint-dot" cx="${center.x}" cy="${center.y}" r="7"/>`;
    })
    .join('');
}

function pieceLayer(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor,
  draggingFromSquare: XiangqiSquare | null,
): string {
  const parts: string[] = [];
  for (const [square, piece] of Object.entries(view.board)) {
    if (!piece) continue;
    const dragSource = square === draggingFromSquare;
    const coord = coordOf(square as XiangqiSquare);
    const center = intersection(coord.file, coord.rank, perspective);
    parts.push(
      renderXiangqiPiece(piece, {
        x: center.x - PIECE_SIZE / 2,
        y: center.y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        className: dragSource ? 'xq-piece xq-piece--drag-source' : 'xq-piece',
      }),
    );
  }
  return parts.join('');
}

function clickLayer(view: StandardXiangqiPlayerView, perspective: XiangqiColor): string {
  const targets = new Map<XiangqiSquare, { capture: boolean }>();
  if (selectedSquare) {
    for (const move of view.legalMoves) {
      if (move.from === selectedSquare) {
        targets.set(move.to, { capture: view.board[move.to] !== undefined });
      }
    }
  }
  const parts: string[] = [];
  for (let file = 0; file < FILE_COUNT; file++) {
    for (let rank = 1; rank <= RANK_COUNT; rank++) {
      const square = `${FILES[file]}${rank}` as XiangqiSquare;
      const center = intersection(file, rank, perspective);
      const target = targets.get(square);
      const marker = target
        ? target.capture
          ? `<circle class="xq-live-hint-capture" cx="${center.x}" cy="${center.y}" r="28"/>`
          : `<circle class="xq-live-hint-dot" cx="${center.x}" cy="${center.y}" r="7"/>`
        : '';
      const hover = target
        ? `<circle class="xq-live-target-hover" cx="${center.x}" cy="${center.y}" r="31"/>`
        : '';
      parts.push(
        `<g class="xq-live-hit${target ? ' xq-live-hit--target' : ''}" data-square="${square}">${hover}${marker}<rect x="${center.x - HIT_HALF}" y="${center.y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/></g>`,
      );
    }
  }
  return parts.join('');
}

// ── Interaction ──────────────────────────────────────────────────────────────

function handleSquareClick(view: StandardXiangqiPlayerView, square: XiangqiSquare): void {
  if (!core?.replay.isLive() || core.connection() !== 'connected') return;
  const result = xiangqiClickResult(view, core.state.seat, selectedSquare, square);
  if (result.kind === 'noop') return;
  if (result.kind === 'select') {
    selectedSquare = result.square;
    return;
  }
  if (result.kind === 'clear') {
    selectedSquare = null;
    return;
  }
  selectedSquare = null;
  if (core.send({ type: 'move', from: result.move.from, to: result.move.to })) {
    playSound(soundForOwnXiangqiMove(view, result.move));
  }
}

// The standalone piece SVG for the floating drag ghost (board-drag.ts mounts it
// in a sized <div>).
function xiangqiPieceGhostSvg(piece: XiangqiPiece): string {
  return renderXiangqiPiece(piece, {
    ariaLabel: `${piece.color} ${piece.role}`,
    className: 'xq-piece',
    size: PIECE_SIZE,
  });
}

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select/move; drag lifts
// one of your pieces and drops it on a legal target. A tap that never crosses the
// movement threshold falls through to the click handler.
function installXiangqiBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: PIECE_SIZE,
    onSquareClick: (square) => {
      const view = core?.state.view;
      if (!view) return;
      handleSquareClick(view, square as XiangqiSquare);
      renderBoard(liveRefs, view);
    },
    canDragFrom: (square) => canDragXiangqiPiece(square as XiangqiSquare),
    ghostHtml: (square) => {
      const piece = core?.state.view?.board[square as XiangqiSquare];
      if (!piece) return null;
      return xiangqiPieceGhostSvg(piece);
    },
    onDragStart: (from) => {
      selectedSquare = from as XiangqiSquare;
      draggingFrom = from as XiangqiSquare;
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
    onDrop: (from, to) =>
      dropXiangqiPiece(liveRefs, from as XiangqiSquare, to as XiangqiSquare | null),
  });
}

// Your own piece can be lifted on your turn. (It snaps back if dropped somewhere
// it cannot move, so any of your pieces is draggable, not just ones with a legal
// move right now.)
function canDragXiangqiPiece(square: XiangqiSquare): boolean {
  const view = core?.state.view;
  if (!view || !core?.replay.isLive() || core.connection() !== 'connected') return false;
  if (!isXiangqiColor(core.state.seat)) return false;
  if (view.status.type !== 'playing' || view.status.turn !== core.state.seat) return false;
  const piece = view.board[square];
  if (!piece) return false;
  return piece.color === view.perspective;
}

function dropXiangqiPiece(liveRefs: LiveRefs, from: XiangqiSquare, to: XiangqiSquare | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  const move = to && view ? view.legalMoves.find((m) => m.from === from && m.to === to) : undefined;
  if (move && view) {
    selectedSquare = null;
    if (core?.send({ type: 'move', from: move.from, to: move.to })) {
      playSound(soundForOwnXiangqiMove(view, move));
    }
  } else {
    selectedSquare = null;
  }
  if (core?.state.view) renderBoard(liveRefs, core.state.view);
}

export type XiangqiClickResult =
  | { kind: 'select'; square: XiangqiSquare }
  | { kind: 'clear' }
  | { kind: 'move'; move: XiangqiMove }
  | { kind: 'noop' };

// Pure click-to-move decision over an open-information view: only the seated
// player's own pieces with at least one legal move are selectable.
export function xiangqiClickResult(
  view: StandardXiangqiPlayerView,
  seat: unknown,
  selected: XiangqiSquare | null,
  square: XiangqiSquare,
): XiangqiClickResult {
  if (!canInteract(view, seat)) return { kind: 'noop' };
  if (!selected) {
    return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'noop' };
  }
  if (selected === square) return { kind: 'clear' };
  const move = view.legalMoves.find(
    (candidate) => candidate.from === selected && candidate.to === square,
  );
  if (move) return { kind: 'move', move };
  return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'clear' };
}

function canInteract(view: StandardXiangqiPlayerView, seat: unknown): boolean {
  return view.status.type === 'playing' && isXiangqiColor(seat) && view.status.turn === seat;
}

function canSelect(view: StandardXiangqiPlayerView, seat: unknown, square: XiangqiSquare): boolean {
  if (!canInteract(view, seat)) return false;
  const piece = view.board[square];
  if (!piece || piece.color !== seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

// ── Notation + replay capture key ────────────────────────────────────────────

function isXiangqiMoveEvent(event: TenantLiveEvent): event is XiangqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isXiangqiColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function replayPositionKey(view: StandardXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece.color, piece.role]);
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

// ── Geometry ─────────────────────────────────────────────────────────────────

function intersection(
  file: number,
  rank: number,
  perspective: XiangqiColor,
): { x: number; y: number } {
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + displayRankFor(rank, perspective) * CELL,
  };
}

function displayRankFor(rank: number, perspective: XiangqiColor): number {
  return perspective === 'red' ? RANK_COUNT - rank : rank - 1;
}

function coordOf(square: XiangqiSquare): { file: number; rank: number } {
  return {
    file: Math.max(0, FILES.indexOf(square[0] ?? '')),
    rank: Number(square.slice(1)),
  };
}

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}
