import {
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiLegalMoves,
  getMiniXiangqiLegalMovesFrom,
  getMiniXiangqiPlayerView,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPiece,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  miniXiangqiCoordOf,
  miniXiangqiSquareOf,
} from '@mistboard/game';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

const CELL = 72;
const MARGIN = 42;
const PIECE_SIZE = 54;
const FILES = 7;
const RANKS = 7;
const WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const FOG_RADIUS = 28;
const HIT_HALF = 31;

type Perspective = MiniXiangqiColor | 'god';

let stylesInstalled = false;

export function mountMiniXiangqiSpike(root: HTMLElement): void {
  installMiniXiangqiSpikeStyles();

  let state = createInitialMiniXiangqiState('mini-xiangqi-spike');
  let perspective: Perspective = 'red';
  let selection: MiniXiangqiSquare | null = null;

  const render = (): void => {
    const activePerspective = perspective === 'god' ? currentTurnOrRed(state) : perspective;
    const view = getMiniXiangqiPlayerView(state, activePerspective);
    const legalFromSelection = selection ? getMiniXiangqiLegalMovesFrom(state, selection) : [];

    root.innerHTML = `
      <main class="mini-xq-page">
        <section class="mini-xq-shell">
          <header class="mini-xq-header">
            <div>
              <p class="mini-xq-kicker">Hidden local spike</p>
              <h1>Dark Mini Xiangqi</h1>
            </div>
            <div class="mini-xq-status">${statusLabel(state)}</div>
          </header>
          <div class="mini-xq-toolbar" role="toolbar" aria-label="Mini Xiangqi controls">
            ${perspectiveButton('red', perspective)}
            ${perspectiveButton('black', perspective)}
            ${perspectiveButton('god', perspective)}
            <button type="button" class="mini-xq-button" data-action="random">Random move</button>
            <button type="button" class="mini-xq-button" data-action="reset">Reset</button>
          </div>
          <div class="mini-xq-board-wrap">
            ${boardSvg(state, view, perspective, selection, legalFromSelection)}
          </div>
          <div class="mini-xq-meta">
            <span>${turnLabel(state)}</span>
            <span>${moveLabel(state)}</span>
            <span>${selection ? `Selected ${selection}` : 'No selection'}</span>
          </div>
        </section>
      </main>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-perspective]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.perspective;
        if (next === 'red' || next === 'black' || next === 'god') {
          perspective = next;
          selection = null;
          render();
        }
      });
    });
    root
      .querySelector<HTMLButtonElement>('[data-action="reset"]')
      ?.addEventListener('click', () => {
        state = createInitialMiniXiangqiState(`mini-xiangqi-spike-${Date.now()}`);
        selection = null;
        render();
      });
    root
      .querySelector<HTMLButtonElement>('[data-action="random"]')
      ?.addEventListener('click', () => {
        const moves = getMiniXiangqiLegalMoves(state);
        if (moves.length === 0) return;
        const move = moves[Math.floor(Math.random() * moves.length)];
        state = applyMiniXiangqiMove(state, move);
        selection = null;
        render();
      });
    root.querySelectorAll<SVGGElement>('[data-square]').forEach((target) => {
      target.addEventListener('click', () => {
        const square = target.dataset.square as MiniXiangqiSquare | undefined;
        if (!square || state.status.type !== 'playing') return;
        const selectedMove = selection
          ? getMiniXiangqiLegalMovesFrom(state, selection).find((move) => move.to === square)
          : null;
        if (selectedMove) {
          state = applyMiniXiangqiMove(state, selectedMove);
          selection = null;
          render();
          return;
        }
        const piece = state.board[square];
        selection = piece?.color === state.status.turn ? square : null;
        render();
      });
    });
  };

  render();
}

function boardSvg(
  state: MiniXiangqiGameState,
  view: MiniXiangqiPlayerView,
  perspective: Perspective,
  selection: MiniXiangqiSquare | null,
  legalMoves: MiniXiangqiMove[],
): string {
  const boardPerspective = perspective === 'god' ? currentTurnOrRed(state) : perspective;
  return `
    <svg class="mini-xq-board" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Dark Mini Xiangqi board">
      <rect class="mini-xq-board-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="10"/>
      ${palaceBands(boardPerspective)}
      <g class="mini-xq-grid">${gridLines()}${palaceCrosses(boardPerspective)}</g>
      ${lastMoveMarkers(view, boardPerspective)}
      ${selectionRing(selection, boardPerspective)}
      ${moveHints(legalMoves, boardPerspective)}
      ${pieceLayer(state, view, perspective, boardPerspective)}
      ${perspective === 'god' ? '' : fogLayer(view, boardPerspective)}
      ${hitLayer(boardPerspective)}
    </svg>
  `;
}

function gridLines(): string {
  const parts: string[] = [];
  for (let r = 0; r < RANKS; r += 1) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + (FILES - 1) * CELL}" y2="${y}"/>`);
  }
  for (let f = 0; f < FILES; f += 1) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  return parts.join('');
}

function palaceBands(perspective: MiniXiangqiColor): string {
  const red = palaceRect(1, 3, perspective);
  const black = palaceRect(5, 7, perspective);
  return [
    `<rect class="mini-xq-palace-band" x="${red.x}" y="${red.y}" width="${red.width}" height="${red.height}"/>`,
    `<rect class="mini-xq-palace-band" x="${black.x}" y="${black.y}" width="${black.width}" height="${black.height}"/>`,
  ].join('');
}

function palaceRect(
  rankA: number,
  rankB: number,
  perspective: MiniXiangqiColor,
): { x: number; y: number; width: number; height: number } {
  const a = intersection(2, rankA, perspective);
  const b = intersection(4, rankB, perspective);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function palaceCrosses(perspective: MiniXiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { bottom: 1, top: 3 },
    { bottom: 5, top: 7 },
  ]) {
    const a = intersection(2, palace.top, perspective);
    const b = intersection(4, palace.bottom, perspective);
    const c = intersection(4, palace.top, perspective);
    const d = intersection(2, palace.bottom, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function pieceLayer(
  state: MiniXiangqiGameState,
  view: MiniXiangqiPlayerView,
  perspective: Perspective,
  boardPerspective: MiniXiangqiColor,
): string {
  const entries =
    perspective === 'god'
      ? Object.entries(state.board).map(([sq, piece]) => ({
          sq: sq as MiniXiangqiSquare,
          entry: piece ? ({ piece, shrouded: false } as const) : null,
        }))
      : Object.entries(view.board).map(([sq, entry]) => ({
          sq: sq as MiniXiangqiSquare,
          entry,
        }));
  return entries
    .map(({ sq, entry }) => {
      if (!entry) return '';
      const { file, rank } = miniXiangqiCoordOf(sq);
      const { x, y } = intersection(file, rank, boardPerspective);
      const piece =
        entry.shrouded === true
          ? ({ color: entry.color, role: 'soldier' } satisfies MiniXiangqiPiece)
          : entry.piece;
      return renderXiangqiPiece(piece, {
        ariaLabel: entry.shrouded ? `${entry.color} hidden piece` : `${piece.color} ${piece.role}`,
        className: 'mini-xq-piece',
        shrouded: entry.shrouded,
        x: x - PIECE_SIZE / 2,
        y: y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
      });
    })
    .join('');
}

function fogLayer(view: MiniXiangqiPlayerView, perspective: MiniXiangqiColor): string {
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let f = 0; f < FILES; f += 1) {
    for (let r = 1; r <= RANKS; r += 1) {
      const sq = miniXiangqiSquareOf(f, r);
      if (visible.has(sq)) continue;
      const { x, y } = intersection(f, r, perspective);
      parts.push(`<circle class="mini-xq-fog" cx="${x}" cy="${y}" r="${FOG_RADIUS}"/>`);
    }
  }
  return parts.join('');
}

function selectionRing(selection: MiniXiangqiSquare | null, perspective: MiniXiangqiColor): string {
  if (!selection) return '';
  const { file, rank } = miniXiangqiCoordOf(selection);
  const { x, y } = intersection(file, rank, perspective);
  return `<circle class="mini-xq-selection" cx="${x}" cy="${y}" r="33"/>`;
}

function moveHints(moves: readonly MiniXiangqiMove[], perspective: MiniXiangqiColor): string {
  return moves
    .map((move) => {
      const { file, rank } = miniXiangqiCoordOf(move.to);
      const { x, y } = intersection(file, rank, perspective);
      return `<circle class="mini-xq-hint" cx="${x}" cy="${y}" r="10"/>`;
    })
    .join('');
}

function lastMoveMarkers(view: MiniXiangqiPlayerView, perspective: MiniXiangqiColor): string {
  if (!view.lastMove) return '';
  const visible = new Set(view.visibleSquares);
  return [view.lastMove.from, view.lastMove.to]
    .filter((sq) => visible.has(sq))
    .map((sq) => {
      const { file, rank } = miniXiangqiCoordOf(sq);
      const { x, y } = intersection(file, rank, perspective);
      return `<circle class="mini-xq-last" cx="${x}" cy="${y}" r="31"/>`;
    })
    .join('');
}

function hitLayer(perspective: MiniXiangqiColor): string {
  const parts: string[] = [];
  for (let f = 0; f < FILES; f += 1) {
    for (let r = 1; r <= RANKS; r += 1) {
      const sq = miniXiangqiSquareOf(f, r);
      const { x, y } = intersection(f, r, perspective);
      parts.push(
        `<g data-square="${sq}" class="mini-xq-hit"><rect x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"><title>${sq}</title></rect></g>`,
      );
    }
  }
  return parts.join('');
}

function intersection(
  file: number,
  rank: number,
  perspective: MiniXiangqiColor,
): { x: number; y: number } {
  const displayRank = perspective === 'red' ? RANKS - rank : rank - 1;
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + displayRank * CELL,
  };
}

function perspectiveButton(value: Perspective, selected: Perspective): string {
  const active = value === selected ? ' aria-pressed="true"' : ' aria-pressed="false"';
  return `<button type="button" class="mini-xq-button" data-perspective="${value}"${active}>${labelForPerspective(value)}</button>`;
}

function labelForPerspective(value: Perspective): string {
  if (value === 'god') return 'Truth';
  return value[0].toUpperCase() + value.slice(1);
}

function currentTurnOrRed(state: MiniXiangqiGameState): MiniXiangqiColor {
  return state.status.type === 'playing' ? state.status.turn : 'red';
}

function statusLabel(state: MiniXiangqiGameState): string {
  if (state.status.type === 'playing') return `${labelForPerspective(state.status.turn)} to move`;
  if (state.status.type === 'aborted') return `Aborted: ${state.status.reason}`;
  return state.status.winner
    ? `${labelForPerspective(state.status.winner)} wins by ${state.status.reason}`
    : `Draw by ${state.status.reason}`;
}

function turnLabel(state: MiniXiangqiGameState): string {
  return state.status.type === 'playing' ? `Turn: ${state.status.turn}` : 'Game finished';
}

function moveLabel(state: MiniXiangqiGameState): string {
  return `Move ${state.moveNumber}`;
}

function installMiniXiangqiSpikeStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.textContent = `
    .mini-xq-page {
      min-height: 100vh;
      padding: 24px;
      background: #f5f1e8;
      color: #22211e;
    }
    .mini-xq-shell {
      max-width: 720px;
      margin: 0 auto;
    }
    .mini-xq-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 14px;
    }
    .mini-xq-kicker {
      margin: 0 0 4px;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #746857;
    }
    .mini-xq-header h1 {
      margin: 0;
      font-size: 1.65rem;
      letter-spacing: 0;
    }
    .mini-xq-status {
      font-size: 0.95rem;
      font-weight: 700;
      text-align: right;
      color: #4b3c2a;
    }
    .mini-xq-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .mini-xq-button {
      min-height: 36px;
      border: 1px solid #9b8c72;
      border-radius: 6px;
      padding: 0 12px;
      background: #fffaf0;
      color: #2f2a22;
      font: inherit;
      cursor: pointer;
    }
    .mini-xq-button[aria-pressed="true"] {
      background: #22211e;
      color: #fffaf0;
      border-color: #22211e;
    }
    .mini-xq-board-wrap {
      overflow-x: auto;
      padding-bottom: 6px;
    }
    .mini-xq-board {
      display: block;
      width: min(100%, 568px);
      min-width: 430px;
      height: auto;
      touch-action: manipulation;
    }
    .mini-xq-board-bg {
      fill: #d9bd82;
    }
    .mini-xq-palace-band {
      fill: rgba(255, 255, 255, 0.17);
    }
    .mini-xq-grid line {
      stroke: #4b3c2a;
      stroke-width: 2;
      stroke-linecap: round;
    }
    .mini-xq-fog {
      fill: rgba(46, 43, 37, 0.74);
      stroke: rgba(255, 255, 255, 0.18);
      stroke-width: 1;
      pointer-events: none;
    }
    .mini-xq-selection {
      fill: none;
      stroke: #f59e0b;
      stroke-width: 4;
      pointer-events: none;
    }
    .mini-xq-hint {
      fill: #1d4ed8;
      opacity: 0.78;
      pointer-events: none;
    }
    .mini-xq-last {
      fill: rgba(250, 204, 21, 0.22);
      stroke: rgba(180, 83, 9, 0.55);
      stroke-width: 2;
      pointer-events: none;
    }
    .mini-xq-piece {
      pointer-events: none;
      filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2));
    }
    .mini-xq-hit rect {
      fill: transparent;
      cursor: pointer;
    }
    .mini-xq-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
      color: #5f5548;
      font-size: 0.9rem;
    }
    @media (max-width: 560px) {
      .mini-xq-page {
        padding: 16px;
      }
      .mini-xq-header {
        display: block;
      }
      .mini-xq-status {
        margin-top: 8px;
        text-align: left;
      }
    }
  `;
  document.head.append(style);
}
