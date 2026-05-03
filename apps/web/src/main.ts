import type { Chess960Start, Color, Piece, PlayerView, Square } from '@bichess/game';
import './styles.css';

type Seat = Color | 'spectator';

type ServerMessage =
  | {
    type: 'hello';
    clientId: string;
    roomId: string;
    seat: Seat;
    offer: Chess960Start[];
    state: PlayerView;
  }
  | {
    type: 'snapshot';
    roomId: string;
    clients: number;
    seat: Seat;
    seats: Partial<Record<Color, string>>;
    selections: Partial<Record<Color, number>>;
    resolvedStartId: number | null;
    state: PlayerView;
  }
  | { type: 'pong'; at: number };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const root = app;

const room = new URLSearchParams(window.location.search).get('room') ?? 'dev-room';
const socket = new WebSocket(`ws://localhost:3001?room=${encodeURIComponent(room)}`);

let offer: Chess960Start[] = [];
let clientId = '';
let clientCount = 0;
let seat: Seat = 'spectator';
let selections: Partial<Record<Color, number>> = {};
let resolvedStartId: number | null = null;
let state: PlayerView | null = null;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as ServerMessage;
  if (message.type === 'hello') {
    clientId = message.clientId;
    seat = message.seat;
    offer = message.offer;
    state = message.state;
  }
  if (message.type === 'snapshot') {
    clientCount = message.clients;
    seat = message.seat;
    selections = message.selections;
    resolvedStartId = message.resolvedStartId;
    state = message.state;
  }
  render();
});

function render(): void {
  const status = state?.status.type === 'playing'
    ? `${state.status.turn} to move`
    : state?.status.type ?? 'connecting';
  root.innerHTML = `
    <main class="shell">
      <section class="topbar">
        <div>
          <h1>Bichess</h1>
          <p>Room <code>${escapeHtml(room)}</code> · ${clientCount} connected · ${seatLabel(seat)} · ${escapeHtml(status)}</p>
        </div>
        <a href="/?room=${crypto.randomUUID()}">New room</a>
      </section>

      <section class="board-panel">
        ${state ? renderBoard(state) : '<div class="board loading">Connecting</div>'}
        <aside>
          <h2>Draft960 Offer</h2>
          <div class="starts">
            ${offer.map((start) => {
              const selected = selections[seat === 'spectator' ? 'white' : seat] === start.id;
              const resolved = resolvedStartId === start.id;
              return `
              <button data-start="${start.id}" ${state?.status.type === 'pregame' && seat !== 'spectator' ? '' : 'disabled'} class="${selected ? 'selected' : ''} ${resolved ? 'resolved' : ''}">
                <strong>#${start.id}</strong>
                <span>${start.fenPlacement.toUpperCase()}</span>
              </button>
            `;
            }).join('')}
          </div>
          <h2>Selections</h2>
          <ul>
            <li>White: ${selectionLabel(selections.white)}</li>
            <li>Black: ${selectionLabel(selections.black)}</li>
            <li>Resolved: ${selectionLabel(resolvedStartId)}</li>
          </ul>
        </aside>
      </section>
    </main>
  `;

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-start]')) {
    button.addEventListener('click', () => {
      socket.send(JSON.stringify({ type: 'select-start', startId: Number(button.dataset.start) }));
    });
  }
}

function renderBoard(view: PlayerView): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = view.perspective === 'black' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const orientedFiles = view.perspective === 'black' ? [...files].reverse() : files;
  return `
    <div class="board" aria-label="chess board">
      ${ranks.flatMap((rank) => orientedFiles.map((file) => {
        const square = `${file}${rank}` as Square;
        const dark = (files.indexOf(file) + rank) % 2 === 1;
        return `
          <div class="square ${dark ? 'dark' : 'light'}">
            ${renderPiece(view.board[square])}
            <span class="coord">${file}${rank}</span>
          </div>
        `;
      })).join('')}
    </div>
  `;
}

function renderPiece(piece: Piece | undefined): string {
  if (!piece) return '';
  const label = pieceLabel(piece);
  return `<span class="piece ${piece.color}" aria-label="${piece.color} ${piece.role}">${label}</span>`;
}

function pieceLabel(piece: Piece): string {
  const labels: Record<Piece['role'], string> = {
    bishop: 'B',
    king: 'K',
    knight: 'N',
    pawn: 'P',
    queen: 'Q',
    rook: 'R',
  };
  return labels[piece.role];
}

function seatLabel(value: Seat): string {
  if (value === 'spectator') return 'spectating';
  return `playing ${value}`;
}

function selectionLabel(startId: number | null | undefined): string {
  return startId === null || startId === undefined ? 'none' : `#${startId}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

render();
