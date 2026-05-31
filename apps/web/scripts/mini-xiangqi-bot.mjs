// Dev helper: auto-plays random legal moves for one Dark Mini Xiangqi seat, so
// you can test a live room by driving only the *other* seat in your browser.
//
//   node apps/web/scripts/mini-xiangqi-bot.mjs <roomId> [wsBase]
//
// roomId   the dmxq_… id (from the room URL, or the create response)
// wsBase   websocket base, default ws://localhost:3010 (or set MINI_BOT_WS)
//
// Typical flow:
//   1. Homepage -> Challenge a friend -> Dark Mini Xiangqi -> Create room.
//   2. node apps/web/scripts/mini-xiangqi-bot.mjs <id from the /room/ URL>
//   3. Play your side in the browser; the bot answers as the other seat.
//
// Run two bots against the same room to watch a full random game play out.
import WebSocket from 'ws';

const roomId = process.argv[2];
const wsBase = process.argv[3] ?? process.env.MINI_BOT_WS ?? 'ws://localhost:3010';
const MOVE_DELAY_MS = Number(process.env.MINI_BOT_DELAY_MS ?? 700);

if (!roomId) {
  console.error('usage: node mini-xiangqi-bot.mjs <roomId> [wsBase]');
  process.exit(1);
}

const client = `mini-bot-${Math.random().toString(36).slice(2, 8)}`;
const url = `${wsBase}?room=${encodeURIComponent(roomId)}&client=${client}`;
const ws = new WebSocket(url);

let seat = null;
let actedKey = null;

ws.on('open', () => console.log(`[mini-bot] connecting to ${roomId} at ${wsBase}`));
ws.on('close', (code, reason) => console.log(`[mini-bot] closed ${code} ${reason}`));
ws.on('error', (err) => console.error('[mini-bot] error:', err.message));

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.type === 'hello') {
    seat = msg.seat;
    console.log(`[mini-bot] seated as ${seat}`);
  }
  const state = msg.state;
  if (!seat || !state || state.status?.type !== 'playing') return;
  if (state.status.turn !== seat) return;
  const moves = state.legalMoves ?? [];
  if (moves.length === 0) return;

  // Act at most once per distinct position so a burst of frames for the same
  // turn doesn't queue duplicate (and then illegal) moves.
  const key = `${state.moveNumber}:${state.status.turn}:${state.lastMove?.to ?? ''}`;
  if (key === actedKey) return;
  actedKey = key;

  const move = moves[Math.floor(Math.random() * moves.length)];
  setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'move', from: move.from, to: move.to }));
    console.log(`[mini-bot] ${seat} plays ${move.from}-${move.to}`);
  }, MOVE_DELAY_MS);
});
