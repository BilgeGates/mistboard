// Shared standard-Xiangqi board: intersection-board SVG geometry, the layer
// renderers, the pure click-to-move decision, and an INSTANCE-BASED interactive
// board. Both the live room (live-xiangqi.ts) and the analysis board consume the
// same factory — neither owns a module-level singleton. Selection/drag state
// lives per instance; the caller supplies policies (whose seat is interactive,
// when interaction is enabled) and an onMove sink (live: send to server;
// analysis: append to the move tree).
//
// The render-only renderXiangqiBoardSvg (postgame / replay / broadcast reuse it)
// also lives here; live-xiangqi.ts re-exports it for its existing importers.

import type {
  StandardXiangqiPlayerView,
  XiangqiColor,
  XiangqiMove,
  XiangqiPiece,
  XiangqiSquare,
} from '@mistboard/game';
import { tokenPieceSize } from './board-metrics.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

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
const NON_SELECTABLE_RIVER_ATTRS =
  'aria-hidden="true" pointer-events="none" style="-webkit-user-select: none; user-select: none;"';

// ── Rendering ────────────────────────────────────────────────────────────────

/** Render-only board SVG (no click layer). Reused by postgame / replay /
 *  broadcast / analysis-review surfaces. */
export function renderXiangqiBoardSvg(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor = view.perspective,
): string {
  return boardSvg(view, perspective, {
    interactive: false,
    selectedSquare: null,
    draggingFrom: null,
  });
}

interface BoardSvgState {
  interactive: boolean;
  selectedSquare: XiangqiSquare | null;
  draggingFrom: XiangqiSquare | null;
}

function boardSvg(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor,
  state: BoardSvgState,
): string {
  return `
    <svg class="xq-live-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect class="xq-live-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${BOARD_RADIUS}"/>
      <g class="xq-live-palace-bands">${palaceBands(perspective)}</g>
      <g class="xq-live-grid">${gridLayer()}</g>
      <g class="xq-live-palace">${palaceLayer(perspective)}</g>
      <g class="xq-live-river" ${NON_SELECTABLE_RIVER_ATTRS}>${riverLayer(perspective)}</g>
      <g class="xq-live-lastmove">${lastMoveLayer(view, perspective)}</g>
      <g class="xq-live-selection">${selectionLayer(state.selectedSquare, perspective)}</g>
      <g class="xq-live-hints">${state.interactive ? '' : hintLayer(view, perspective, state.selectedSquare)}</g>
      <g class="xq-live-pieces">${pieceLayer(view, perspective, state.draggingFrom)}</g>
      <g class="xq-live-clicks">${state.interactive ? clickLayer(view, perspective, state.selectedSquare) : ''}</g>
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
    <text class="xq-live-river-label" x="${MARGIN + 4 * CELL}" y="${y + 1}">楚 河   漢 界</text>
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

function hintLayer(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor,
  selectedSquare: XiangqiSquare | null,
): string {
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

function clickLayer(
  view: StandardXiangqiPlayerView,
  perspective: XiangqiColor,
  selectedSquare: XiangqiSquare | null,
): string {
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

// The standalone piece SVG for the floating drag ghost (board-drag.ts mounts it
// in a sized <div>).
function xiangqiPieceGhostSvg(piece: XiangqiPiece): string {
  return renderXiangqiPiece(piece, {
    ariaLabel: `${piece.color} ${piece.role}`,
    className: 'xq-piece',
    size: PIECE_SIZE,
  });
}

// ── Pure click-to-move decision ──────────────────────────────────────────────

export type XiangqiClickResult =
  | { kind: 'select'; square: XiangqiSquare }
  | { kind: 'clear' }
  | { kind: 'move'; move: XiangqiMove }
  | { kind: 'noop' };

// Pure click-to-move decision over an open-information view: only the interacting
// seat's own pieces with at least one legal move are selectable. Live passes the
// player's fixed seat; analysis passes the side to move (so both colours play).
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

// ── Instance-based interactive board ─────────────────────────────────────────

export interface XiangqiInteractiveBoardOptions {
  /** Persistent board host; click + drag are delegated here once so they survive
   *  innerHTML re-renders. */
  board: HTMLElement;
  /** View used for click/drag legality at event time (live: room truth; analysis:
   *  the current tree node's truth view). */
  getInteractionView: () => StandardXiangqiPlayerView | null;
  /** Board orientation. */
  getPerspective: () => XiangqiColor;
  /** Whose pieces are interactive for a view. Live: the player's fixed seat;
   *  analysis: `view.status.turn` (the side to move). Return null = nobody. */
  seatFor: (view: StandardXiangqiPlayerView) => XiangqiColor | null;
  /** Outer gate. Live: connected AND not scrubbing history; analysis: always true. */
  enabled: () => boolean;
  /** A legal move was chosen (click or drop). Caller applies it — live sends to
   *  the server (and may play a sound); analysis appends to the move tree. */
  onMove: (move: XiangqiMove, view: StandardXiangqiPlayerView) => void;
}

export interface XiangqiInteractiveBoard {
  /** Re-render for a display view (tenant frame / analysis node change). */
  render(view: StandardXiangqiPlayerView | null, perspective: XiangqiColor): void;
  /** Clear the current selection (no render). */
  clearSelection(): void;
}

export function createXiangqiInteractiveBoard(
  opts: XiangqiInteractiveBoardOptions,
): XiangqiInteractiveBoard {
  let selectedSquare: XiangqiSquare | null = null;
  let draggingFrom: XiangqiSquare | null = null;

  function render(view: StandardXiangqiPlayerView | null, perspective: XiangqiColor): void {
    if (!view) {
      opts.board.replaceChildren();
      return;
    }
    opts.board.innerHTML = boardSvg(view, perspective, {
      interactive: true,
      selectedSquare,
      draggingFrom,
    });
  }

  // Re-render from the live interaction view after a click/drag mutation.
  function rerender(): void {
    render(opts.getInteractionView(), opts.getPerspective());
  }

  function clearSelection(): void {
    selectedSquare = null;
    draggingFrom = null;
  }

  function handleClick(square: XiangqiSquare): void {
    if (opts.enabled()) {
      const view = opts.getInteractionView();
      if (view) {
        const result = xiangqiClickResult(view, opts.seatFor(view), selectedSquare, square);
        if (result.kind === 'select') {
          selectedSquare = result.square;
        } else if (result.kind === 'clear') {
          selectedSquare = null;
        } else if (result.kind === 'move') {
          selectedSquare = null;
          opts.onMove(result.move, view);
        }
      }
    }
    rerender();
  }

  function canDrag(square: XiangqiSquare): boolean {
    if (!opts.enabled()) return false;
    const view = opts.getInteractionView();
    if (!view) return false;
    const seat = opts.seatFor(view);
    if (!isXiangqiColor(seat)) return false;
    if (view.status.type !== 'playing' || view.status.turn !== seat) return false;
    const piece = view.board[square];
    if (!piece) return false;
    return piece.color === seat;
  }

  function handleDrop(from: XiangqiSquare, to: XiangqiSquare | null): void {
    draggingFrom = null;
    const view = opts.getInteractionView();
    const move =
      to && view ? view.legalMoves.find((m) => m.from === from && m.to === to) : undefined;
    selectedSquare = null;
    if (move && view) opts.onMove(move, view);
    rerender();
  }

  installBoardDrag({
    board: opts.board,
    ghostSizePx: PIECE_SIZE,
    onSquareClick: (square) => handleClick(square as XiangqiSquare),
    canDragFrom: (square) => canDrag(square as XiangqiSquare),
    ghostHtml: (square) => {
      const piece = opts.getInteractionView()?.board[square as XiangqiSquare];
      return piece ? xiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      selectedSquare = from as XiangqiSquare;
      draggingFrom = from as XiangqiSquare;
      rerender();
    },
    onDrop: (from, to) => handleDrop(from as XiangqiSquare, to as XiangqiSquare | null),
  });

  installSelectionClickAway({
    roots: () => [opts.board],
    hasSelection: () => selectedSquare !== null,
    clearSelection: () => {
      clearSelection();
      rerender();
    },
  });

  return { render, clearSelection };
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

export function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}
