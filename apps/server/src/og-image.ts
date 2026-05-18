import type { ServerResponse } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
import type { Color, Square } from '@mistboard/game';
import {
  type PieceOnBoard,
  renderBoardComposition,
} from '@mistboard/board-render';
import * as persistence from './persistence.js';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

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

// ── Default OG card: single hero board, mid-game position, fog visible ────────
//
// Architecture: a small curated pool of mid-game positions. `renderDefaultOgSvg`
// picks one randomly per invocation. Re-run `npm run og:default --workspace
// @mistboard/server` to bake a fresh pick into `apps/web/public/og-image.png`.
// (Scrapers cache OG images aggressively, so request-time randomization gives
// you exactly one variant per shared URL — bake-time is the right grain.)

type DefaultOgPosition = {
  pieces: PieceOnBoard[];
  fogSquares: Square[];
  orientation: Color;
};

function defaultOgPositionPool(): DefaultOgPosition[] {
  return [positionMidgameDeveloped()];
}

// Hand-crafted believable mid-game position, white POV. White has castled
// kingside and developed minor pieces; black has castled kingside, advanced a
// pair of central pawns to c5/d5, and parked a knight on e5. Everything in
// black's half except those three pieces is fogged.
function positionMidgameDeveloped(): DefaultOgPosition {
  const pieces: PieceOnBoard[] = [
    // White
    { color: 'white', role: 'rook',   file: 0, rank: 0 }, // a1
    { color: 'white', role: 'bishop', file: 2, rank: 0 }, // c1
    { color: 'white', role: 'queen',  file: 3, rank: 1 }, // d2
    { color: 'white', role: 'bishop', file: 4, rank: 1 }, // e2
    { color: 'white', role: 'rook',   file: 5, rank: 0 }, // f1
    { color: 'white', role: 'king',   file: 6, rank: 0 }, // g1
    { color: 'white', role: 'knight', file: 2, rank: 2 }, // c3
    { color: 'white', role: 'knight', file: 5, rank: 2 }, // f3
    { color: 'white', role: 'pawn',   file: 0, rank: 1 }, // a2
    { color: 'white', role: 'pawn',   file: 1, rank: 1 }, // b2
    { color: 'white', role: 'pawn',   file: 2, rank: 3 }, // c4
    { color: 'white', role: 'pawn',   file: 3, rank: 3 }, // d4
    { color: 'white', role: 'pawn',   file: 4, rank: 2 }, // e3
    { color: 'white', role: 'pawn',   file: 5, rank: 1 }, // f2
    { color: 'white', role: 'pawn',   file: 6, rank: 1 }, // g2
    { color: 'white', role: 'pawn',   file: 7, rank: 1 }, // h2
    // Black — the renderer skips pieces on fogged squares, so most of these
    // are silent (they're "there" but the viewer doesn't see them).
    { color: 'black', role: 'rook',   file: 0, rank: 7 }, // a8
    { color: 'black', role: 'bishop', file: 2, rank: 7 }, // c8
    { color: 'black', role: 'queen',  file: 3, rank: 7 }, // d8
    { color: 'black', role: 'bishop', file: 4, rank: 6 }, // e7
    { color: 'black', role: 'rook',   file: 5, rank: 7 }, // f8
    { color: 'black', role: 'king',   file: 6, rank: 7 }, // g8
    { color: 'black', role: 'knight', file: 2, rank: 6 }, // c7
    { color: 'black', role: 'knight', file: 4, rank: 4 }, // e5 — visible
    { color: 'black', role: 'pawn',   file: 0, rank: 6 }, // a7
    { color: 'black', role: 'pawn',   file: 1, rank: 5 }, // b6
    { color: 'black', role: 'pawn',   file: 2, rank: 4 }, // c5 — visible
    { color: 'black', role: 'pawn',   file: 3, rank: 4 }, // d5 — visible
    { color: 'black', role: 'pawn',   file: 4, rank: 5 }, // e6
    { color: 'black', role: 'pawn',   file: 5, rank: 6 }, // f7
    { color: 'black', role: 'pawn',   file: 6, rank: 6 }, // g7
    { color: 'black', role: 'pawn',   file: 7, rank: 6 }, // h7
  ];

  // White POV: visible rank-5 squares are b5/c5/d5/e5/g5 (knight jumps + pawn
  // captures). Ranks 6-8 fully fogged; a5/f5/h5 also fogged.
  const fogSquares: Square[] = [
    'a5', 'f5', 'h5',
    'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
    'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
  ];

  return { pieces, fogSquares, orientation: 'white' };
}

export function renderDefaultOgSvg(): string {
  const pool = defaultOgPositionPool();
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  const boardSize = 440;
  const boardY = 120;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`);
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(`<text x="80" y="80" fill="#e5e7eb" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">MISTBOARD</text>`);
  parts.push(renderBoardComposition({
    layout: 'single',
    canvasWidth: OG_WIDTH,
    boardY,
    boardSize,
    boards: [{ pieces: pick.pieces, fogSquares: pick.fogSquares, orientation: pick.orientation }],
  }));
  parts.push(`<text x="${OG_WIDTH / 2}" y="600" text-anchor="middle" fill="#e5e7eb" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="26" font-weight="500">Chess where you only see what your pieces see.</text>`);
  parts.push(`</svg>`);
  return parts.join('');
}

export function svgToPng(svg: string, background = '#0f1115'): Buffer {
  return new Resvg(svg, { background }).render().asPng();
}
