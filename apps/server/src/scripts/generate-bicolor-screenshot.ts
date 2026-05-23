import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fogOfWarVariant,
  replayGameEvents,
  type Board,
  type GameEvent,
  type Square,
} from '@mistboard/game';
import { renderBoardComposition, type PieceOnBoard } from '@mistboard/board-render';
import { svgToPng } from '../og-image.js';

// CLI: tsx generate-bicolor-screenshot.ts [sampleName] [targetPly]
//   sampleName  defaults to "sample-1"
//   targetPly   defaults to 24 (half-moves played)

const here = dirname(fileURLToPath(import.meta.url));
const sampleName = process.argv[2] ?? 'sample-1';
const targetPly = Number(process.argv[3] ?? 24);
const samplePath = resolve(here, '..', '..', '..', 'web', 'public', 'replay-samples', `${sampleName}.jsonl`);
const outPath = resolve(here, '..', '..', '..', 'web', 'public', 'screenshot-bicolor.png');

const text = await fs.readFile(samplePath, 'utf8');
const allEvents: GameEvent[] = text
  .trim()
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as GameEvent);

let moveCount = 0;
const truncated: GameEvent[] = [];
for (const ev of allEvents) {
  truncated.push(ev);
  if (ev.type === 'move-played') {
    moveCount += 1;
    if (moveCount >= targetPly) break;
  }
}

const projection = replayGameEvents(truncated);
const state = projection.state;

const ALL_SQUARES: Square[] = [];
for (const file of 'abcdefgh') {
  for (let rank = 1; rank <= 8; rank += 1) {
    ALL_SQUARES.push(`${file}${rank}` as Square);
  }
}

function boardToPieces(board: Board): PieceOnBoard[] {
  const out: PieceOnBoard[] = [];
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece) continue;
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    out.push({ file, rank, color: piece.color, role: piece.role });
  }
  return out;
}

const pieces = boardToPieces(state.board);
const whiteView = fogOfWarVariant.getPlayerView(state, 'white');
const blackView = fogOfWarVariant.getPlayerView(state, 'black');
const whiteVisible = new Set(whiteView.visibleSquares);
const blackVisible = new Set(blackView.visibleSquares);
const whiteFog = ALL_SQUARES.filter((s) => !whiteVisible.has(s));
const blackFog = ALL_SQUARES.filter((s) => !blackVisible.has(s));

const W = 1800;
const H = 900;
const boardSize = 580;
const gap = 120;
const boardY = 220;

const parts: string[] = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
parts.push(`<rect width="${W}" height="${H}" fill="#0f1115"/>`);
parts.push(`<text x="80" y="100" fill="#e5e7eb" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="32" font-weight="700" letter-spacing="3">MISTBOARD</text>`);
parts.push(
  renderBoardComposition({
    layout: 'pair',
    canvasWidth: W,
    boardY,
    boardSize,
    gap,
    labelY: boardY - 30,
    labelFontSize: 26,
    boards: [
      { pieces, fogSquares: whiteFog, orientation: 'white', label: "WHITE'S VIEW" },
      { pieces, fogSquares: blackFog, orientation: 'black', label: "BLACK'S VIEW" },
    ],
  }),
);
parts.push(
  `<text x="${W / 2}" y="850" text-anchor="middle" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="26" font-weight="500">The same position. Two players. Two views.</text>`,
);
parts.push(`</svg>`);

const svg = parts.join('');
const png = svgToPng(svg);
await fs.writeFile(outPath, png);
console.log(`wrote ${outPath} (${png.byteLength} bytes), source=${sampleName}, ply=${targetPly}, visible: white=${whiteView.visibleSquares.length}, black=${blackView.visibleSquares.length}`);
