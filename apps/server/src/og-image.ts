import type { ServerResponse } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
import * as persistence from './persistence.js';
import { PIECE_SVGS } from './og-piece-svgs.js';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

type PieceRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
type PieceOnBoard = { file: number; rank: number; color: 'white' | 'black'; role: PieceRole };
type FogSquare = { file: number; rank: number };

const LIGHT_SQUARE = '#f0d9b5';
const DARK_SQUARE = '#b58863';
const FOG_FILL = '#1a1a1a';
const FOG_OPACITY = 0.78;

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

  const boardSize = 384;
  const leftBoardX = 144;
  const rightBoardX = 1200 - 144 - boardSize;
  const boardY = 140;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`);
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(`<text x="80" y="80" fill="#e5e7eb" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">MISTBOARD</text>`);
  parts.push(`<text x="${OG_WIDTH - 80}" y="80" text-anchor="end" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22">Fog of War chess</text>`);
  parts.push(`<text x="${leftBoardX + boardSize / 2}" y="120" text-anchor="middle" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22" letter-spacing="2">STANDARD</text>`);
  parts.push(`<text x="${rightBoardX + boardSize / 2}" y="120" text-anchor="middle" fill="#9ca3af" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22" letter-spacing="2">DRAFT960</text>`);
  parts.push(renderBoardSvg(standardPieces, fogTopHalf, leftBoardX, boardY, boardSize));
  parts.push(renderBoardSvg(draft960Pieces, fogTopHalf, rightBoardX, boardY, boardSize));
  parts.push(`<text x="${OG_WIDTH / 2}" y="568" text-anchor="middle" fill="#f3f4f6" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="600">Standard openings are solved.</text>`);
  parts.push(`<text x="${OG_WIDTH / 2}" y="602" text-anchor="middle" fill="#f3f4f6" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="600">Draft960 + Fog of War aren&apos;t.</text>`);
  parts.push(`</svg>`);
  return parts.join('');
}

function startingPositionFromBackRank(backRank: PieceRole[]): PieceOnBoard[] {
  const pieces: PieceOnBoard[] = [];
  for (let f = 0; f < 8; f += 1) {
    pieces.push({ file: f, rank: 0, color: 'white', role: backRank[f]! });
    pieces.push({ file: f, rank: 1, color: 'white', role: 'pawn' });
    pieces.push({ file: f, rank: 6, color: 'black', role: 'pawn' });
    pieces.push({ file: f, rank: 7, color: 'black', role: backRank[f]! });
  }
  return pieces;
}

function renderBoardSvg(
  pieces: PieceOnBoard[],
  fogSquares: FogSquare[],
  x: number,
  y: number,
  size: number,
): string {
  const sq = size / 8;
  const out: string[] = [];
  out.push(`<g>`);
  // Squares
  for (let f = 0; f < 8; f += 1) {
    for (let r = 0; r < 8; r += 1) {
      const isLight = (f + r) % 2 === 1;
      const sx = x + f * sq;
      const sy = y + (7 - r) * sq;
      out.push(`<rect x="${sx}" y="${sy}" width="${sq}" height="${sq}" fill="${isLight ? LIGHT_SQUARE : DARK_SQUARE}"/>`);
    }
  }
  // Pieces (only those not fogged)
  const fogSet = new Set(fogSquares.map((s) => `${s.file},${s.rank}`));
  for (const piece of pieces) {
    if (fogSet.has(`${piece.file},${piece.rank}`)) continue;
    const svg = PIECE_SVGS[`${piece.color}:${piece.role}`];
    if (!svg) continue;
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const px = x + piece.file * sq;
    const py = y + (7 - piece.rank) * sq;
    out.push(`<svg x="${px}" y="${py}" width="${sq}" height="${sq}" viewBox="0 0 45 45">${inner}</svg>`);
  }
  // Fog overlay
  for (const fog of fogSquares) {
    const fx = x + fog.file * sq;
    const fy = y + (7 - fog.rank) * sq;
    out.push(`<rect x="${fx}" y="${fy}" width="${sq}" height="${sq}" fill="${FOG_FILL}" fill-opacity="${FOG_OPACITY}"/>`);
  }
  // Border
  out.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="#2a2f37" stroke-width="2"/>`);
  out.push(`</g>`);
  return out.join('');
}

export function svgToPng(svg: string, background = '#0f1115'): Buffer {
  return new Resvg(svg, { background }).render().asPng();
}
