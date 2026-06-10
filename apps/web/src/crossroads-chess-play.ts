// Perfect-information Crossroads Chess play page.
//   - Opponent: hot-seat (both sides) or vs Computer (Fairy-Stockfish, server-side).
//   - vs Computer: pick your side (White/Red) and a difficulty (FSF Skill Level).
// No fog — this is the "learn in the clear" mode. Bot moves come from
// POST /api/crossroads-chess/engine-move (needs the dev server, not just vite).

import {
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  getCrossroadsChessOpenLegalMovesFrom,
  getCrossroadsChessOpenView,
} from '@mistboard/game';
import './crossroads-chess-play.css';
import { renderCrossroadsChessBoardSvg } from './crossroads-chess-render.js';
import { buildNav } from './site-shell.js';

type Opponent = 'human' | 'computer';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY: Record<Difficulty, { skill: number; movetime: number }> = {
  easy: { skill: 1, movetime: 200 },
  medium: { skill: 6, movetime: 400 },
  hard: { skill: 14, movetime: 700 },
};

const CROSSROADS_LIVE_TIME_CONTROL = { initialMs: 300_000, incrementMs: 5_000 } as const;

export function mountCrossroadsChessPlay(container: HTMLElement): void {
  let opponent: Opponent = 'human';
  let humanSide: CrossroadsChessColor = 'white';
  let difficulty: Difficulty = 'medium';

  let state = createInitialCrossroadsChessState('local-crossroads-chess');
  let selected: CrossroadsChessSquare | null = null;
  let perspective: CrossroadsChessColor = 'white';
  let history: string[] = []; // UCI moves from the start, for the engine
  let botThinking = false;
  let engineError: string | null = null;

  const page = document.createElement('main');
  page.className = 'crossroads-play-page';
  page.innerHTML = `
    <header class="crossroads-play-head">
      <div>
        <h1>Crossroads Chess</h1>
        <div class="crossroads-play-tagline">Perfect information · learn the pieces in the clear</div>
      </div>
      <a class="crossroads-play-review-link" href="/rules/crossroads-chess">Rules</a>
    </header>
    <div class="crossroads-play-layout">
      <section class="crossroads-play-board-panel" aria-label="Crossroads Chess board">
        <div class="crossroads-play-board" data-board></div>
      </section>
      <aside class="crossroads-play-side">
        <section class="crossroads-play-section">
          <div class="crossroads-play-status" data-status></div>
        </section>
        <section class="crossroads-play-section">
          <h2>Setup</h2>
          <div class="crossroads-play-setup" data-setup></div>
        </section>
        <section class="crossroads-play-section">
          <h2>Moves</h2>
          <div class="crossroads-play-moves" data-moves></div>
        </section>
        <div class="crossroads-play-actions" data-actions></div>
      </aside>
    </div>`;
  container.replaceChildren(buildNav(), page);

  const boardHost = page.querySelector<HTMLElement>('[data-board]')!;
  const statusEl = page.querySelector<HTMLElement>('[data-status]')!;
  const setupEl = page.querySelector<HTMLElement>('[data-setup]')!;
  const movesEl = page.querySelector<HTMLElement>('[data-moves]')!;
  const actionsEl = page.querySelector<HTMLElement>('[data-actions]')!;

  const liveRoomButton = button('Play a friend 5+5', () => void createLiveRoom());
  liveRoomButton.classList.add('is-primary');
  actionsEl.append(
    liveRoomButton,
    button('New game', () => startGame()),
    button('Flip board', () => {
      perspective = perspective === 'white' ? 'red' : 'white';
      render();
    }),
  );

  // Create a live PvP room and walk into it. The friend joins by opening the same
  // /room/dchess_... URL. Server-gated by MISTBOARD_CROSSROADS_CHESS_ENABLED.
  async function createLiveRoom(): Promise<void> {
    statusEl.textContent = 'Creating a live room…';
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameSpecId: CROSSROADS_CHESS_SPEC_ID,
          mode: 'pvp',
          timeControl: CROSSROADS_LIVE_TIME_CONTROL,
        }),
      });
      if (!res.ok) {
        statusEl.textContent =
          res.status === 404
            ? 'Live Crossroads Chess is not enabled on this server.'
            : 'Could not create a live room.';
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.assign(data.url);
    } catch {
      statusEl.textContent = 'Could not reach the server.';
    }
  }

  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]');
    const square = hit?.getAttribute('data-square') as CrossroadsChessSquare | undefined;
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
    state = createInitialCrossroadsChessState('local-crossroads-chess');
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

  function targetsFor(from: CrossroadsChessSquare): CrossroadsChessSquare[] {
    return getCrossroadsChessOpenLegalMovesFrom(state, from).map((move) => move.to);
  }

  function onSquareClick(square: CrossroadsChessSquare): void {
    if (!humanToMove()) return;
    const turn = state.status.type === 'playing' ? state.status.turn : null;
    if (selected) {
      const legal = getCrossroadsChessOpenLegalMovesFrom(state, selected).find(
        (m) => m.to === square,
      );
      if (legal) {
        playMove(legal);
        return;
      }
    }
    const piece = state.board[square];
    selected = piece && piece.color === turn && square !== selected ? square : null;
    render();
  }

  function playMove(move: CrossroadsChessMove): void {
    state = applyCrossroadsChessOpenMove(state, move);
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
      const res = await fetch('/api/crossroads-chess/engine-move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moves: history, movetime, skill }),
      });
      const data = (await res.json()) as { move?: string | null };
      if (state.status.type === 'playing' && typeof data.move === 'string') {
        state = applyCrossroadsChessOpenMove(state, uciToMove(data.move));
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
    const view = getCrossroadsChessOpenView(state, perspective);
    boardHost.innerHTML = renderCrossroadsChessBoardSvg(view, {
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
            humanSide = value as CrossroadsChessColor;
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
      empty.className = 'crossroads-play-moves-empty';
      empty.textContent = 'No moves yet';
      movesEl.append(empty);
      return;
    }
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'crossroads-play-move-row';
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
  row.className = 'crossroads-play-row';
  const caption = document.createElement('span');
  caption.className = 'crossroads-play-label';
  caption.textContent = label;
  row.append(caption);
  for (const [value, text] of options) {
    const btn = button(text, () => onPick(value));
    if (value === active) btn.classList.add('is-active');
    row.append(btn);
  }
  return row;
}

function statusText(state: CrossroadsChessGameState): string {
  if (state.status.type === 'playing') return `${capitalize(state.status.turn)} to move`;
  if (state.status.type === 'aborted') return 'Game aborted';
  const { winner, reason } = state.status;
  const who = winner ? capitalize(winner) : null;
  switch (reason) {
    case 'checkmate':
      return `Checkmate: ${who} wins`;
    case 'stalemate':
      return `Stalemate: ${who} wins`;
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

function moveToUci(move: CrossroadsChessMove): string {
  return `${move.from}${move.to}${move.promotion ? 'q' : ''}`;
}

function uciToMove(uci: string): CrossroadsChessMove {
  const from = uci.slice(0, 2) as CrossroadsChessSquare;
  const to = uci.slice(2, 4) as CrossroadsChessSquare;
  return uci.length > 4 ? { from, to, promotion: 'queen' } : { from, to };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'crossroads-play-btn';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
