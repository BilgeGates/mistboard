// Perfect-information Dual Chess play page.
//   - Opponent: hot-seat (both sides) or vs Computer (Fairy-Stockfish, server-side).
//   - vs Computer: pick your side (White/Red) and a difficulty (FSF Skill Level).
// No fog — this is the "learn in the clear" mode. Bot moves come from
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
import './dual-chess-play.css';
import { renderDualChessBoardSvg } from './dual-chess-render.js';
import { buildNav } from './site-shell.js';

type Opponent = 'human' | 'computer';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY: Record<Difficulty, { skill: number; movetime: number }> = {
  easy: { skill: 1, movetime: 200 },
  medium: { skill: 6, movetime: 400 },
  hard: { skill: 14, movetime: 700 },
};

export function mountDualChessPlay(container: HTMLElement): void {
  let opponent: Opponent = 'human';
  let humanSide: DualChessColor = 'white';
  let difficulty: Difficulty = 'medium';

  let state = createInitialDualChessState('local-dual-chess');
  let selected: DualChessSquare | null = null;
  let perspective: DualChessColor = 'white';
  let history: string[] = []; // UCI moves from the start, for the engine
  let botThinking = false;
  let engineError: string | null = null;

  // Site nav above the app root (matches the other prelaunch surfaces).
  if (container.parentNode) container.before(buildNav());

  const page = document.createElement('main');
  page.className = 'dual-play-page';
  page.innerHTML = `
    <div class="dual-play-head">
      <h1>Dual Chess</h1>
      <div class="dual-play-tagline">Perfect information · learn the pieces in the clear</div>
    </div>
    <div class="dual-play-layout">
      <div class="dual-play-board" data-board></div>
      <aside class="dual-play-side">
        <div class="dual-play-status" data-status></div>
        <div class="dual-play-setup" data-setup></div>
        <div class="dual-play-moves" data-moves></div>
        <div class="dual-play-actions" data-actions></div>
      </aside>
    </div>`;
  container.append(page);

  const boardHost = page.querySelector<HTMLElement>('[data-board]')!;
  const statusEl = page.querySelector<HTMLElement>('[data-status]')!;
  const setupEl = page.querySelector<HTMLElement>('[data-setup]')!;
  const movesEl = page.querySelector<HTMLElement>('[data-moves]')!;
  const actionsEl = page.querySelector<HTMLElement>('[data-actions]')!;

  actionsEl.append(
    button('New game', () => startGame()),
    button('Flip board', () => {
      perspective = perspective === 'white' ? 'red' : 'white';
      render();
    }),
  );

  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]');
    const square = hit?.getAttribute('data-square') as DualChessSquare | undefined;
    if (square) onSquareClick(square);
  });

  function isVsComputer(): boolean {
    return opponent === 'computer';
  }
  function humanToMove(): boolean {
    return (
      state.status.type === 'playing' &&
      !botThinking &&
      (!isVsComputer() || state.status.turn === humanSide)
    );
  }

  function startGame(): void {
    state = createInitialDualChessState('local-dual-chess');
    selected = null;
    history = [];
    botThinking = false;
    engineError = null;
    perspective = humanSide;
    render();
    if (isVsComputer() && state.status.type === 'playing' && state.status.turn !== humanSide) {
      void botMove();
    }
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
    if (isVsComputer() && state.status.type === 'playing' && state.status.turn !== humanSide) {
      void botMove();
    }
  }

  async function botMove(): Promise<void> {
    if (botThinking) return;
    botThinking = true;
    engineError = null;
    render();
    const { skill, movetime } = DIFFICULTY[difficulty];
    try {
      const res = await fetch('/api/dual-chess/engine-move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moves: history, movetime, skill }),
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
    renderSetup();
    renderMoves();
  }

  function renderSetup(): void {
    setupEl.replaceChildren();
    setupEl.append(
      toggleRow(
        'Opponent',
        [
          ['human', 'Hot-seat'],
          ['computer', 'vs Computer'],
        ],
        opponent,
        (value) => {
          opponent = value as Opponent;
          startGame();
        },
      ),
    );
    if (isVsComputer()) {
      setupEl.append(
        toggleRow(
          'Your side',
          [
            ['white', 'White'],
            ['red', 'Red'],
          ],
          humanSide,
          (value) => {
            humanSide = value as DualChessColor;
            startGame();
          },
        ),
        toggleRow(
          'Level',
          [
            ['easy', 'Easy'],
            ['medium', 'Medium'],
            ['hard', 'Hard'],
          ],
          difficulty,
          (value) => {
            difficulty = value as Difficulty;
            startGame();
          },
        ),
      );
    }
  }

  function renderMoves(): void {
    movesEl.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dual-play-moves-empty';
      empty.textContent = 'No moves yet';
      movesEl.append(empty);
      return;
    }
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'dual-play-move-row';
      row.innerHTML = `<span class="num">${i / 2 + 1}.</span><span class="ply">${history[i]}</span><span class="ply">${history[i + 1] ?? ''}</span>`;
      movesEl.append(row);
    }
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  render();
}

function toggleRow(
  label: string,
  options: [value: string, label: string][],
  active: string,
  onPick: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dual-play-row';
  const caption = document.createElement('span');
  caption.className = 'dual-play-label';
  caption.textContent = label;
  row.append(caption);
  for (const [value, text] of options) {
    const btn = button(text, () => onPick(value));
    if (value === active) btn.classList.add('is-active');
    row.append(btn);
  }
  return row;
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
