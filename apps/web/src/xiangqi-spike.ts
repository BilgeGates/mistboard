// FoW Xiangqi spike — hidden local-only playable surface.
// See docs-private/fog-of-war/library/variants/fow-xiangqi.md (Phase A).
//
// Phase A scope (this file):
//   - 9×10 board with palace cross-lines and river band
//   - Pieces placed on intersections via getPlayerView
//   - Fog dots at intersections the perspective player cannot see
//   - Click-to-move (Step 7)
//   - POV switcher: red / black / god-view (Step 7)
//   - Cannon-vision mode toggle: A / B / C (Step 8)

import {
  applyMove,
  coordOf,
  createInitialXiangqiState,
  getLegalMovesFrom,
  getPlayerView,
  squareOf,
  type XiangqiBoard,
  type XiangqiCannonVisionMode,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// ── Geometry ───────────────────────────────────────────────────────────────

const CELL = 60;
const MARGIN = 36;
const PIECE_SIZE = 52;
const FILES = 9;
const RANKS = 10;
const WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOT = MARGIN + 5 * CELL;
const FOG_RADIUS = 22;
const HIT_HALF = 24;       // half-width of the per-intersection click target

type Perspective = XiangqiColor | 'god';

function intersection(file: number, rank: number, perspective: XiangqiColor): { x: number; y: number } {
  const rDisplay = perspective === 'red' ? RANKS - rank : rank - 1;
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + rDisplay * CELL,
  };
}

// ── Static board layers ────────────────────────────────────────────────────

function gridLines(): string {
  const parts: string[] = [];
  for (let r = 0; r < RANKS; r++) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + (FILES - 1) * CELL}" y2="${y}"/>`);
  }
  for (const f of [0, FILES - 1]) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  for (let f = 1; f < FILES - 1; f++) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${RIVER_TOP}"/>`);
    parts.push(`<line x1="${x}" y1="${RIVER_BOT}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  return parts.join('');
}

function palaceCrosses(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankBack: 1 },
    { fileMin: 3, fileMax: 5, rankBack: 8 },
  ]) {
    const top = palace.rankBack === 1 ? 3 : 10;
    const bot = palace.rankBack;
    const a = intersection(palace.fileMin, top, perspective);
    const b = intersection(palace.fileMax, bot, perspective);
    const c = intersection(palace.fileMax, top, perspective);
    const d = intersection(palace.fileMin, bot, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function positionMarks(perspective: XiangqiColor): string {
  const marks: Array<{ file: number; rank: number }> = [];
  for (const r of [3, 8]) for (const f of [1, 7]) marks.push({ file: f, rank: r });
  for (const r of [4, 7]) for (const f of [0, 2, 4, 6, 8]) marks.push({ file: f, rank: r });
  return marks.map(({ file, rank }) => {
    const { x, y } = intersection(file, rank, perspective);
    const off = 9;
    const len = 5;
    const bits: string[] = [];
    const corners = [
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    for (const c of corners) {
      if (file === 0 && c.dx === -1) continue;
      if (file === FILES - 1 && c.dx === 1) continue;
      const px = x + c.dx * off;
      const py = y + c.dy * off;
      bits.push(`<line x1="${px}" y1="${py}" x2="${px - c.dx * len}" y2="${py}"/>`);
      bits.push(`<line x1="${px}" y1="${py}" x2="${px}" y2="${py - c.dy * len}"/>`);
    }
    return bits.join('');
  }).join('');
}

function riverLabel(perspective: XiangqiColor): string {
  const midY = (RIVER_TOP + RIVER_BOT) / 2;
  const leftX = MARGIN + 2 * CELL;
  const rightX = MARGIN + 6 * CELL;
  const left = perspective === 'red' ? '楚 河' : '漢 界';
  const right = perspective === 'red' ? '漢 界' : '楚 河';
  return [
    `<text x="${leftX}" y="${midY}" class="xq-river-label">${left}</text>`,
    `<text x="${rightX}" y="${midY}" class="xq-river-label">${right}</text>`,
  ].join('');
}

// ── Dynamic layers (depend on game state / view) ───────────────────────────

function fogLayer(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const sq = squareOf(f, r);
      if (visible.has(sq)) continue;
      const { x, y } = intersection(f, r, perspective);
      parts.push(`<circle class="xq-fog" cx="${x}" cy="${y}" r="${FOG_RADIUS}"/>`);
    }
  }
  return parts.join('');
}

function selectionRing(selection: XiangqiSquare | null, perspective: XiangqiColor): string {
  if (!selection) return '';
  const { file, rank } = coordOf(selection);
  const { x, y } = intersection(file, rank, perspective);
  return `<circle class="xq-selection-ring" cx="${x}" cy="${y}" r="29"/>`;
}

function moveHints(
  selection: XiangqiSquare | null,
  state: XiangqiGameState,
  perspective: XiangqiColor,
): string {
  if (!selection || state.status.type !== 'playing') return '';
  const moves = getLegalMovesFrom(state, selection);
  return moves.map((m) => {
    const c = coordOf(m.to);
    const { x, y } = intersection(c.file, c.rank, perspective);
    const occupied = state.board[m.to] !== undefined;
    return occupied
      ? `<circle class="xq-hint-capture" cx="${x}" cy="${y}" r="27"/>`
      : `<circle class="xq-hint-dot" cx="${x}" cy="${y}" r="7"/>`;
  }).join('');
}

function piecesLayer(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const sq in view.board) {
    const entry = view.board[sq as XiangqiSquare];
    if (!entry) continue;
    const file = 'abcdefghi'.indexOf(sq[0]);
    const rank = Number(sq.slice(1));
    const { x, y } = intersection(file, rank, perspective);
    parts.push(renderXiangqiPiece(entry.piece, {
      x: x - PIECE_SIZE / 2,
      y: y - PIECE_SIZE / 2,
      size: PIECE_SIZE,
      shrouded: entry.shrouded,
      className: 'xq-piece',
    }));
  }
  return parts.join('');
}

function clickLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const sq = squareOf(f, r);
      const { x, y } = intersection(f, r, perspective);
      parts.push(`<rect class="xq-hit" data-square="${sq}" x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/>`);
    }
  }
  return parts.join('');
}

function renderBoardSvg(
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  state: XiangqiGameState,
  selection: XiangqiSquare | null,
): string {
  return [
    `<svg class="xq-board-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" class="xq-board-bg"/>`,
    `<g class="xq-grid">${gridLines()}</g>`,
    `<g class="xq-palace">${palaceCrosses(perspective)}</g>`,
    `<g class="xq-marks">${positionMarks(perspective)}</g>`,
    `<g class="xq-river-text">${riverLabel(perspective)}</g>`,
    `<g class="xq-fog-layer">${fogLayer(view, perspective)}</g>`,
    `<g class="xq-selection">${selectionRing(selection, perspective)}</g>`,
    `<g class="xq-hints">${moveHints(selection, state, perspective)}</g>`,
    `<g class="xq-pieces">${piecesLayer(view, perspective)}</g>`,
    `<g class="xq-clicks">${clickLayer(perspective)}</g>`,
    `</svg>`,
  ].join('');
}

// ── God view: bypass FoW filter ────────────────────────────────────────────

function buildGodView(state: XiangqiGameState, mode: XiangqiCannonVisionMode): XiangqiPlayerView {
  const board: Record<string, { piece: XiangqiPiece; shrouded: boolean }> = {};
  const visibleSquares: XiangqiSquare[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      visibleSquares.push(squareOf(f, r));
    }
  }
  for (const [sq, piece] of Object.entries(state.board)) {
    if (piece) board[sq] = { piece, shrouded: false };
  }
  const legalMoves = state.status.type === 'playing'
    ? getPlayerView(state, state.status.turn, mode).legalMoves
    : [];
  return {
    id: state.id,
    perspective: state.status.type === 'playing' ? state.status.turn : 'red',
    board: board as XiangqiPlayerView['board'],
    visibleSquares: visibleSquares.sort(),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

// ── Mount + handlers ───────────────────────────────────────────────────────

interface SpikeState {
  game: XiangqiGameState;
  perspective: Perspective;
  mode: XiangqiCannonVisionMode;
  selection: XiangqiSquare | null;
}

function viewForState(s: SpikeState): { view: XiangqiPlayerView; orient: XiangqiColor } {
  if (s.perspective === 'god') {
    return { view: buildGodView(s.game, s.mode), orient: 'red' };
  }
  return { view: getPlayerView(s.game, s.perspective, s.mode), orient: s.perspective };
}

function canSelect(s: SpikeState, square: XiangqiSquare): boolean {
  if (s.game.status.type !== 'playing') return false;
  const piece = s.game.board[square];
  if (!piece || piece.color !== s.game.status.turn) return false;
  // Under a color POV, only your own pieces are clickable (and they must
  // already be visible — your own pieces always are).
  if (s.perspective === 'red' || s.perspective === 'black') {
    if (piece.color !== s.perspective) return false;
  }
  return true;
}

function handleSquareClick(s: SpikeState, square: XiangqiSquare): SpikeState {
  if (s.game.status.type !== 'playing') return s;
  const piece = s.game.board[square];

  if (s.selection === null) {
    if (canSelect(s, square)) return { ...s, selection: square };
    return s;
  }

  if (s.selection === square) {
    return { ...s, selection: null };
  }

  const legal = getLegalMovesFrom(s.game, s.selection);
  if (legal.some((m) => m.to === square)) {
    const next = applyMove(s.game, { from: s.selection, to: square });
    return { ...s, game: next, selection: null };
  }

  // Click on a non-destination square: reselect if it's another own piece,
  // else clear selection.
  if (piece && canSelect(s, square)) return { ...s, selection: square };
  return { ...s, selection: null };
}

function controlsHtml(s: SpikeState): string {
  const povBtn = (pov: Perspective, label: string) =>
    `<button data-pov="${pov}" class="xq-btn${s.perspective === pov ? ' on' : ''}">${label}</button>`;
  const modeBtn = (mode: XiangqiCannonVisionMode, label: string) =>
    `<button data-mode="${mode}" class="xq-btn${s.mode === mode ? ' on' : ''}">${label}</button>`;
  return `
    <div class="xq-controls">
      <div class="xq-control-row">
        <span class="xq-control-label">POV</span>
        ${povBtn('red', 'Red')}
        ${povBtn('black', 'Black')}
        ${povBtn('god', 'God')}
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Cannon vision</span>
        ${modeBtn('A', 'A · full reveal')}
        ${modeBtn('B', 'B · both shrouded')}
        ${modeBtn('C', 'C · screen full, target shrouded')}
      </div>
      <div class="xq-control-row">
        <button data-action="reset" class="xq-btn">Reset</button>
      </div>
    </div>
  `;
}

function statusHtml(s: SpikeState): string {
  const game = s.game;
  let line: string;
  if (game.status.type === 'finished') {
    const winner = game.status.winner ? `${game.status.winner} wins` : 'draw';
    line = `Game over — ${winner} (${game.status.reason}) · move ${game.moveNumber}`;
  } else {
    line = `Move ${game.moveNumber} · ${game.status.turn} to move`;
  }
  return `<div class="xq-status">${line}</div>`;
}

let active: { root: HTMLElement; state: SpikeState } | null = null;

function rerender(): void {
  if (!active) return;
  const { root, state } = active;
  const { view, orient } = viewForState(state);

  root.replaceChildren();
  const container = document.createElement('div');
  container.className = 'xq-spike-root';
  container.innerHTML = `
    <style>${STYLE}</style>
    <h1>FoW Xiangqi spike</h1>
    <p class="xq-spike-sub">Phase A · interactive · ${state.perspective} POV · cannon-vision mode ${state.mode}</p>
    ${controlsHtml(state)}
    ${statusHtml(state)}
    <div class="xq-board-wrap">${renderBoardSvg(view, orient, state.game, state.selection)}</div>
  `;
  root.append(container);
  attachHandlers(container);
}

function attachHandlers(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-pov]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const pov = btn.dataset.pov as Perspective;
      active.state = { ...active.state, perspective: pov, selection: null };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const mode = btn.dataset.mode as XiangqiCannonVisionMode;
      active.state = { ...active.state, mode };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-action="reset"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      active.state = {
        ...active.state,
        game: createInitialXiangqiState('xq-spike'),
        selection: null,
      };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!active) return;
      const sq = el.dataset.square as XiangqiSquare;
      active.state = handleSquareClick(active.state, sq);
      rerender();
    });
  });
}

const STYLE = `
  .xq-spike-root {
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
    color: var(--text-primary, #1f2521);
    font-family: system-ui, -apple-system, sans-serif;
  }
  .xq-spike-root h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .xq-spike-sub { color: #6b6b6b; margin: 0 0 1rem; font-size: 0.95rem; }
  .xq-controls { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
  .xq-control-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .xq-control-label { font-size: 0.85rem; color: #6b6b6b; min-width: 110px; }
  .xq-btn {
    appearance: none;
    border: 1px solid #d1d1d1;
    background: #fafafa;
    color: #1f2521;
    padding: 0.35rem 0.7rem;
    font-size: 0.9rem;
    border-radius: 5px;
    cursor: pointer;
  }
  .xq-btn:hover { background: #efefef; }
  .xq-btn.on { background: #1f2521; color: #f7e8c5; border-color: #1f2521; }
  .xq-status {
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
    color: #444;
  }
  .xq-board-wrap { display: flex; justify-content: center; }
  .xq-board-svg {
    width: 100%;
    max-width: ${WIDTH}px;
    height: auto;
    background: transparent;
  }
  .xq-board-bg { fill: #f5dca8; }
  .xq-grid line, .xq-palace line, .xq-marks line { stroke: #5a3a14; }
  .xq-grid line, .xq-palace line { stroke-width: 1.2; }
  .xq-marks line { stroke-width: 1.0; }
  .xq-river-label {
    font-family: serif;
    font-size: 22px;
    fill: #5a3a14;
    text-anchor: middle;
    dominant-baseline: central;
    letter-spacing: 4px;
  }
  .xq-fog { fill: #2a2218; opacity: 0.55; }
  .xq-selection-ring { fill: none; stroke: #f59e0b; stroke-width: 3; }
  .xq-hint-dot { fill: #15803d; opacity: 0.85; }
  .xq-hint-capture { fill: none; stroke: #b91c1c; stroke-width: 3; opacity: 0.85; stroke-dasharray: 5 4; }
  .xq-hit { fill: transparent; cursor: pointer; }
`;

export function mountXiangqiSpike(root: HTMLElement): void {
  active = {
    root,
    state: {
      game: createInitialXiangqiState('xq-spike'),
      perspective: 'red',
      mode: 'C',
      selection: null,
    },
  };
  rerender();
}

// Exported for content-scenario tools that want to render a known position
// without the interactive mount lifecycle.
export { renderBoardSvg };
