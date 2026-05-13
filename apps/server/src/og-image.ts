import type { ServerResponse } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
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
