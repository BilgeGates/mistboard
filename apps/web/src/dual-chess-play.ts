// Local perfect-information Dual Chess: a self-contained play surface.
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
import { renderDualChessBoardSvg } from './dual-chess-render.js';

type Opponent = 'human' | 'computer';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY: Record<Difficulty, { skill: number; movetime: number }> = {
  easy: { skill: 1, movetime: 200 },
  medium: { skill: 6, movetime: 400 },
  hard: { skill: 14, movetime: 700 },
};

const ACCENT = '#3f86c4';

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

  container.classList.add('dual-play');
  container.style.cssText =
    'max-width:380px;margin:24px auto;font-family:system-ui,sans-serif;text-align:center';

  const heading = document.createElement('h2');
  heading.textContent = 'Dual Chess';
  heading.style.cssText = 'margin:0 0 2px;font-size:22px';
  const subtitle = document.createElement('div');
  subtitle.textContent = 'Perfect information · learn the pieces in the clear';
  subtitle.style.cssText = 'color:#888;font-size:13px;margin-bottom:14px';

  const statusEl = document.createElement('div');
  statusEl.className = 'dual-play-status';
  statusEl.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:12px;min-height:1.4em';
  const boardHost = document.createElement('div');
  boardHost.className = 'dual-play-board';
  boardHost.style.cssText = 'width:330px;margin:0 auto';
  const controls = document.createElement('div');
  controls.className = 'dual-play-controls';
  controls.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:8px';

  container.append(heading, subtitle, statusEl, boardHost, controls);

  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]');
    const square = hit?.getAttribute('data-square') as DualChessSquare | undefined;
    if (square) onSquareClick(square);
  });

  function isVsComputer(): boolean {
    return opponent === 'computer';
  }
  function humanColor(): DualChessColor {
    return humanSide;
  }
  function humanToMove(): boolean {
    return (
      state.status.type === 'playing' &&
      !botThinking &&
      (!isVsComputer() || state.status.turn === humanColor())
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
    // FSF opens when the human chose to play Red.
    if (isVsComputer() && state.status.type === 'playing' && state.status.turn !== humanColor()) {
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
    if (isVsComputer() && state.status.type === 'playing' && state.status.turn !== humanColor()) {
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
    renderControls();
  }

  function renderControls(): void {
    controls.replaceChildren();
    controls.append(
      toggleRow(
        'Opponent',
        [
          { value: 'human', label: 'Hot-seat' },
          { value: 'computer', label: 'vs Computer' },
        ],
        opponent,
        (value) => {
          opponent = value as Opponent;
          startGame();
        },
      ),
    );
    if (isVsComputer()) {
      controls.append(
        toggleRow(
          'Your side',
          [
            { value: 'white', label: 'White' },
            { value: 'red', label: 'Red' },
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
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ],
          difficulty,
          (value) => {
            difficulty = value as Difficulty;
            startGame();
          },
        ),
      );
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:4px';
    actions.append(
      button('New game', () => startGame()),
      button('Flip board', () => {
        perspective = perspective === 'white' ? 'red' : 'white';
        render();
      }),
    );
    controls.append(actions);
  }

  render();
}

function toggleRow(
  label: string,
  options: { value: string; label: string }[],
  active: string,
  onPick: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center';
  const caption = document.createElement('span');
  caption.textContent = label;
  caption.style.cssText = 'color:#888;font-size:13px;min-width:64px;text-align:right';
  row.append(caption);
  for (const option of options) {
    const btn = button(option.label, () => onPick(option.value));
    btn.dataset.value = option.value;
    if (option.value === active) {
      btn.style.background = ACCENT;
      btn.style.color = '#fff';
      btn.style.borderColor = ACCENT;
    }
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
  el.style.cssText = 'padding:5px 12px;cursor:pointer;border:1px solid #ccc;border-radius:5px';
  el.addEventListener('click', onClick);
  return el;
}
