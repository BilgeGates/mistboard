import type { Chess960Start } from '@bichess/game';
import './styles.css';

type ServerMessage =
  | { type: 'hello'; clientId: string; roomId: string; offer: Chess960Start[]; state: unknown }
  | { type: 'room'; roomId: string; clients: number }
  | { type: 'selection'; clientId: string; startId: number }
  | { type: 'pong'; at: number };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const root = app;

const room = new URLSearchParams(window.location.search).get('room') ?? 'dev-room';
const socket = new WebSocket(`ws://localhost:3001?room=${encodeURIComponent(room)}`);

let offer: Chess960Start[] = [];
let clientId = '';
let clientCount = 0;
let selections: string[] = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as ServerMessage;
  if (message.type === 'hello') {
    clientId = message.clientId;
    offer = message.offer;
  }
  if (message.type === 'room') clientCount = message.clients;
  if (message.type === 'selection') selections = [...selections, `${message.clientId.slice(0, 8)} picked #${message.startId}`];
  render();
});

function render(): void {
  root.innerHTML = `
    <main class="shell">
      <section class="topbar">
        <div>
          <h1>Bichess</h1>
          <p>Room <code>${escapeHtml(room)}</code> · ${clientCount} connected · ${clientId ? `you ${clientId.slice(0, 8)}` : 'connecting'}</p>
        </div>
        <a href="/?room=${crypto.randomUUID()}">New room</a>
      </section>

      <section class="board-panel">
        ${renderBoard()}
        <aside>
          <h2>Draft960 Offer</h2>
          <div class="starts">
            ${offer.map((start) => `
              <button data-start="${start.id}">
                <strong>#${start.id}</strong>
                <span>${start.fenPlacement.toUpperCase()}</span>
              </button>
            `).join('')}
          </div>
          <h2>Selections</h2>
          <ul>${selections.map((selection) => `<li>${escapeHtml(selection)}</li>`).join('')}</ul>
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

function renderBoard(): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  return `
    <div class="board" aria-label="placeholder chess board">
      ${ranks.flatMap((rank) => files.map((file) => {
        const dark = (files.indexOf(file) + rank) % 2 === 1;
        return `<div class="square ${dark ? 'dark' : 'light'}">${file}${rank}</div>`;
      })).join('')}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

render();
