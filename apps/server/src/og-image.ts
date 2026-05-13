import type { ServerResponse } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
import type { PieceRole as GamePieceRole } from '@mistboard/game';
import {
  type FogSquare,
  renderBoardComposition,
  startingPositionFromBackRank,
} from '@mistboard/board-render';
import * as persistence from './persistence.js';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

type PieceRole = GamePieceRole;

const cache = new Map<string, Buffer>();

export async function serveGameOgImage(roomId: string, response: ServerResponse): Promise<void> {
  const cached = cache.get(roomId);
  if (cached) {
    writePng(response, cached, 'HIT');
    return;
  }

  const game = await persistence.getGameSummary(roomId);
  if (!game || !game.result) {
    redirectToDefault(response);
    return;
  }

  const svg = renderStubSvg(game);
  const png = new Resvg(svg, { background: '#0f1115' }).render().asPng();
  cache.set(roomId, png);
  writePng(response, png, 'MISS');
}

function writePng(response: ServerResponse, png: Buffer, cacheStatus: 'HIT' | 'MISS'): void {
  response.writeHead(200, {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-og-cache': cacheStatus,
  });
  response.end(png);
}

function redirectToDefault(response: ServerResponse): void {
  response.writeHead(302, { location: '/og-image.png' });
  response.end();
}

function renderStubSvg(game: persistence.GameRecord): string {
  const white = escapeXml(game.whiteName ?? 'White');
  const black = escapeXml(game.blackName ?? 'Black');
  const resultLine = escapeXml(resultLabel(game));
  const plies = game.plyCount ?? 0;
  const moves = Math.ceil(plies / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>
  <text x="60" y="80" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22" font-weight="500" letter-spacing="2">MISTBOARD · FOG OF WAR</text>
  <text x="600" y="280" text-anchor="middle" fill="#f3f4f6" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="56" font-weight="700">${resultLine}</text>
  <text x="600" y="350" text-anchor="middle" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28">${white} vs ${black} · ${moves} move${moves === 1 ? '' : 's'}</text>
  <text x="600" y="560" text-anchor="middle" fill="#6b7280" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22">mistboard.com</text>
</svg>`;
}

function resultLabel(game: persistence.GameRecord): string {
  const white = game.whiteName ?? 'White';
  const black = game.blackName ?? 'Black';
  if (game.result === 'white-wins') return `${white} wins`;
  if (game.result === 'black-wins') return `${black} wins`;
  if (game.result === 'draw') return 'Draw';
  return 'Game over';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── Default OG card: Standard vs Draft960, both fogged ─────────────────────────

const STANDARD_BACK_RANK: PieceRole[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
// A valid Chess960 starting position (bishops on opposite colors, king between rooks).
// Files a-h: Q R N B B N K R.
const DRAFT960_BACK_RANK: PieceRole[] = ['queen', 'rook', 'knight', 'bishop', 'bishop', 'knight', 'king', 'rook'];

export function renderDefaultOgSvg(): string {
  const standardPieces = startingPositionFromBackRank(STANDARD_BACK_RANK);
  const draft960Pieces = startingPositionFromBackRank(DRAFT960_BACK_RANK);
  // White-to-move fog of ranks 5-8 (top half from white's perspective).
  const fogTopHalf: FogSquare[] = [];
  for (let f = 0; f < 8; f += 1) for (let r = 4; r < 8; r += 1) fogTopHalf.push({ file: f, rank: r });

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`);
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(`<text x="80" y="80" fill="#e5e7eb" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">MISTBOARD</text>`);
  parts.push(`<text x="${OG_WIDTH - 80}" y="80" text-anchor="end" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22">Fog of War chess</text>`);
  parts.push(renderBoardComposition({
    layout: 'pair',
    canvasWidth: OG_WIDTH,
    boardY: 140,
    boardSize: 384,
    boards: [
      { pieces: standardPieces, fogSquares: fogTopHalf, label: 'STANDARD' },
      { pieces: draft960Pieces, fogSquares: fogTopHalf, label: 'DRAFT960' },
    ],
  }));
  parts.push(`<text x="${OG_WIDTH / 2}" y="568" text-anchor="middle" fill="#f3f4f6" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="600">Standard openings are solved.</text>`);
  parts.push(`<text x="${OG_WIDTH / 2}" y="602" text-anchor="middle" fill="#f3f4f6" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="600">Draft960 + Fog of War aren&apos;t.</text>`);
  parts.push(`</svg>`);
  return parts.join('');
}

export function svgToPng(svg: string, background = '#0f1115'): Buffer {
  return new Resvg(svg, { background }).render().asPng();
}
