// Local perfect-information Dual Chess. Two modes:
//   - Hot-seat: click a piece, click a target, both sides on one board.
//   - vs Computer: you play White; Fairy-Stockfish (server-side) replies as Red.
// No fog — this is the "learn in the clear" surface. The bot move comes from
// POST /api/dual-chess/engine-move (needs the dev server, not just vite).

import {
  applyDualChessOpenMove,
  createInitialDualChessState,
  type DualChessColor,
  type DualChessGameState,
  type DualChessMove,
  type DualChessSquare,
  getDualChessOpenLegalMovesFrom,
  getDualChessOpenView,
} from '@mistboard/game';
import { renderDualChessBoardSvg } from './dual-chess-render.js';

type Mode = 'hotseat' | 'vs-computer';

export function mountDualChessPlay(container: HTMLElement): void {
  let state = createInitialDualChessState('local-dual-chess');
  let selected: DualChessSquare | null = null;
  let perspective: DualChessColor = 'white';
  let mode: Mode = 'hotseat';
  const humanColor: DualChessColor = 'white';
  let history: string[] = []; // UCI moves from the start position, for the engine
  let botThinking = false;
  let engineError: string | null = null;

  container.classList.add('dual-play');
  container.style.cssText =
    'max-width:380px;margin:24px auto;font-family:system-ui,sans-serif;text-align:center';
  const statusEl = document.createElement('div');
  statusEl.className = 'dual-play-status';
  statusEl.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:12px;min-height:1.4em';
  const boardHost = document.createElement('div');
  boardHost.className = 'dual-play-board';
  boardHost.style.cssText = 'width:330px;margin:0 auto';
  const controls = document.createElement('div');
  controls.className = 'dual-play-controls';
  controls.style.cssText =
    'margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap';

  const hotseatBtn = button('Hot-seat', () => startGame('hotseat'));
  const vsBotBtn = button('vs Computer', () => startGame('vs-computer'));
  const resetBtn = button('New game', () => startGame(mode));
  const flipBtn = button('Flip board', () => {
    perspective = perspective === 'white' ? 'red' : 'white';
    render();
  });
  controls.append(hotseatBtn, vsBotBtn, resetBtn, flipBtn);
  container.append(statusEl, boardHost, controls);

  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]');
    const square = hit?.getAttribute('data-square') as DualChessSquare | undefined;
    if (square) onSquareClick(square);
  });

  function startGame(next: Mode): void {
    mode = next;
    state = createInitialDualChessState('local-dual-chess');
    selected = null;
    history = [];
    botThinking = false;
    engineError = null;
    render();
  }

  function humanToMove(): boolean {
    return (
      state.status.type === 'playing' &&
      !botThinking &&
      (mode === 'hotseat' || state.status.turn === humanColor)
    );
  }

  function targetsFor(from: DualChessSquare): DualChessSquare[] {
    return getDualChessOpenLegalMovesFrom(state, from).map((move) => move.to);
  }

  function onSquareClick(square: DualChessSquare): void {
    if (!humanToMove()) return;
    const turn = state.status.type === 'playing' ? state.status.turn : null;

    if (selected) {
      const legal = getDualChessOpenLegalMovesFrom(state, selected).find((m) => m.to === square);
      if (legal) {
        playMove(legal);
        return;
      }
    }

    const piece = state.board[square];
    selected = piece && piece.color === turn && square !== selected ? square : null;
    render();
  }

  function playMove(move: DualChessMove): void {
    state = applyDualChessOpenMove(state, move);
    history.push(moveToUci(move));
    selected = null;
    render();
    if (
      mode === 'vs-computer' &&
      state.status.type === 'playing' &&
      state.status.turn !== humanColor
    ) {
      void botMove();
    }
  }

  async function botMove(): Promise<void> {
    if (botThinking) return;
    botThinking = true;
    engineError = null;
    render();
    try {
      const res = await fetch('/api/dual-chess/engine-move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moves: history, movetime: 500 }),
      });
      const data = (await res.json()) as { move?: string | null };
      if (state.status.type === 'playing' && typeof data.move === 'string') {
        state = applyDualChessOpenMove(state, uciToMove(data.move));
        history.push(data.move);
      } else if (!data.move) {
        engineError = 'Engine returned no move';
      }
    } catch {
      engineError = 'Computer unavailable (is the dev server running?)';
    } finally {
      botThinking = false;
      render();
    }
  }

  function render(): void {
    const view = getDualChessOpenView(state, perspective);
    boardHost.innerHTML = renderDualChessBoardSvg(view, {
      perspective,
      showFog: false,
      interactive: humanToMove(),
      selected,
      targets: selected ? targetsFor(selected) : [],
    });
    statusEl.textContent = engineError ?? (botThinking ? 'Computer thinking…' : statusText(state));
  }

  render();
}

function statusText(state: DualChessGameState): string {
  if (state.status.type === 'playing') return `${capitalize(state.status.turn)} to move`;
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

function moveToUci(move: DualChessMove): string {
  return `${move.from}${move.to}${move.promotion ? 'q' : ''}`;
}

function uciToMove(uci: string): DualChessMove {
  const from = uci.slice(0, 2) as DualChessSquare;
  const to = uci.slice(2, 4) as DualChessSquare;
  return uci.length > 4 ? { from, to, promotion: 'queen' } : { from, to };
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
