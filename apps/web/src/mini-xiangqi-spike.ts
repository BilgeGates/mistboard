import {
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiLegalMoves,
  getMiniXiangqiLegalMovesFrom,
  getMiniXiangqiPlayerView,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import {
  installMiniXiangqiBoardStyles,
  miniXiangqiTruthView,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';

type Perspective = MiniXiangqiColor | 'god';

let stylesInstalled = false;

export function mountMiniXiangqiSpike(root: HTMLElement): void {
  installMiniXiangqiSpikeStyles();

  let state = createInitialMiniXiangqiState('mini-xiangqi-spike');
  let perspective: Perspective = 'red';
  let selection: MiniXiangqiSquare | null = null;

  const render = (): void => {
    const activePerspective = perspective === 'god' ? currentTurnOrRed(state) : perspective;
    const view =
      perspective === 'god'
        ? miniXiangqiTruthView(state)
        : getMiniXiangqiPlayerView(state, activePerspective);
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
            ${renderMiniXiangqiBoardSvg(view, activePerspective, {
              interactive: true,
              showFog: perspective !== 'god',
              selectedSquare: selection,
              legalMoves: legalFromSelection,
            })}
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
  installMiniXiangqiBoardStyles();
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
      max-width: 568px;
      overflow-x: auto;
      padding-bottom: 6px;
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
