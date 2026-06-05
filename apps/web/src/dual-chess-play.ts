// Local hot-seat perfect-information Dual Chess. A self-contained controller:
// click a piece to see its legal moves, click a target to play, both sides on
// one board. No server, no fog — this is the perfect-info "learn in the clear"
// surface and the front-end the Fairy-Stockfish bot will later plug into.

import {
  applyDualChessOpenMove,
  createInitialDualChessState,
  type DualChessColor,
  type DualChessGameState,
  type DualChessSquare,
  getDualChessOpenLegalMovesFrom,
  getDualChessOpenView,
} from '@mistboard/game';
import { renderDualChessBoardSvg } from './dual-chess-render.js';

export function mountDualChessPlay(container: HTMLElement): void {
  let state = createInitialDualChessState('local-dual-chess');
  let selected: DualChessSquare | null = null;
  let perspective: DualChessColor = 'white';

  container.classList.add('dual-play');
  container.style.cssText =
    'max-width:380px;margin:24px auto;font-family:system-ui,sans-serif;text-align:center';
  const boardHost = document.createElement('div');
  boardHost.className = 'dual-play-board';
  boardHost.style.cssText = 'width:330px;margin:0 auto';
  const statusEl = document.createElement('div');
  statusEl.className = 'dual-play-status';
  statusEl.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:12px';
  const controls = document.createElement('div');
  controls.className = 'dual-play-controls';
  controls.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:center';

  const resetBtn = button('New game', () => {
    state = createInitialDualChessState('local-dual-chess');
    selected = null;
    render();
  });
  const flipBtn = button('Flip board', () => {
    perspective = perspective === 'white' ? 'red' : 'white';
    render();
  });
  controls.append(resetBtn, flipBtn);
  container.append(statusEl, boardHost, controls);

  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]');
    const square = hit?.getAttribute('data-square') as DualChessSquare | undefined;
    if (square) onSquareClick(square);
  });

  function targetsFor(from: DualChessSquare): DualChessSquare[] {
    return getDualChessOpenLegalMovesFrom(state, from).map((move) => move.to);
  }

  function onSquareClick(square: DualChessSquare): void {
    if (state.status.type !== 'playing') return;
    const turn = state.status.turn;

    if (selected && targetsFor(selected).includes(square)) {
      state = applyDualChessOpenMove(state, { from: selected, to: square });
      selected = null;
      render();
      return;
    }

    const piece = state.board[square];
    selected = piece && piece.color === turn && square !== selected ? square : null;
    render();
  }

  function render(): void {
    const view = getDualChessOpenView(state, perspective);
    boardHost.innerHTML = renderDualChessBoardSvg(view, {
      perspective,
      showFog: false,
      interactive: state.status.type === 'playing',
      selected,
      targets: selected ? targetsFor(selected) : [],
    });
    statusEl.textContent = statusText(state);
  }

  render();
}

function statusText(state: DualChessGameState): string {
  if (state.status.type === 'playing') {
    return `${capitalize(state.status.turn)} to move`;
  }
  if (state.status.type === 'aborted') return 'Game aborted';
  const { winner, reason } = state.status;
  const who = winner ? capitalize(winner) : null;
  switch (reason) {
    case 'checkmate':
      return `Checkmate — ${who} wins`;
    case 'stalemate':
      return `Stalemate — ${who} wins`;
    case 'race':
      return `${who} wins the race (Try)`;
    case 'repetition':
      return `${who} wins (forced repetition)`;
    case 'progress-clock':
      return 'Draw (no progress)';
    default:
      return who ? `${who} wins (${reason})` : `Game over (${reason})`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dual-play-btn';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
