import type { ServerResponse } from 'node:http';
import {
  ARTICLE_OG_POSITIONS,
  type ArticleOgPosition,
  boardToPieces,
  fogSquaresFromVisible,
  GREEN_PALETTE,
  type PieceOnBoard,
  renderBoardComposition,
} from '@mistboard/board-render';
import {
  applyGameEvent,
  darkChessVariant,
  type GameEvent,
  initialGameProjection,
  type Square,
  variantForId,
} from '@mistboard/game';
import { Resvg } from '@resvg/resvg-js';
import * as persistence from './persistence.js';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
export const GAME_OG_IMAGE_VERSION = 4;

// Bounded LRU of rendered per-game PNGs. Each card is rendered once on first
// scraper fetch, then served from here (and from the scraper/CDN cache, via the
// immutable Cache-Control header) — so this rarely sees repeat traffic per
// game. The cap keeps memory bounded regardless of how many distinct games get
// shared: at ~100-150 KB per PNG, 1000 entries is ~100-150 MB worst case.
// Eviction is simplest-possible LRU: a Map keeps insertion order, so reads
// re-insert (mark as recent) and writes drop the oldest key when over cap.
const MAX_CACHE_ENTRIES = 1000;
const cache = new Map<string, Buffer>();

function cacheGet(roomId: string): Buffer | undefined {
  const hit = cache.get(roomId);
  if (hit) {
    cache.delete(roomId);
    cache.set(roomId, hit); // move to most-recently-used end
  }
  return hit;
}

function cacheSet(roomId: string, png: Buffer): void {
  cache.set(roomId, png);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function serveGameOgImage(roomId: string, response: ServerResponse): Promise<void> {
  const cacheKey = `game:v${GAME_OG_IMAGE_VERSION}:${roomId}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    writePng(response, cached, 'HIT');
    return;
  }

  const game = await persistence.getGameSummary(roomId);
  if (!game?.result) {
    redirectToDefault(response);
    return;
  }

  // Prefer the game-record card built from the finished position. If the event
  // log is missing or replay throws, fall back to a text card so a shared link
  // always resolves to *some* image.
  let svg: string;
  try {
    const position = await reconstructOgPosition(roomId);
    svg = position ? renderGameOgSvg(game, position) : renderStubSvg(game);
  } catch {
    svg = renderStubSvg(game);
  }
  const png = svgToPng(svg);
  cacheSet(cacheKey, png);
  writePng(response, png, 'MISS');
}

type OgPosition = { pieces: PieceOnBoard[]; whiteFog: Square[]; blackFog: Square[] };

// Replay the completed event log to the final position, then compute each side's
// fog there. Game OG images are only served for completed games, so this does
// not expose live hidden information.
async function reconstructOgPosition(roomId: string): Promise<OgPosition | null> {
  const events = await persistence.loadRoom(roomId);
  if (!events || events.length === 0) return null;

  let projection = initialGameProjection(events[0]?.roomId ?? roomId);
  let pliesApplied = 0;
  for (const event of events as GameEvent[]) {
    projection = applyGameEvent(projection, event);
    if (event.type === 'move-played') {
      pliesApplied += 1;
    }
  }
  if (pliesApplied === 0) return null;

  const variant = variantForId(projection.variant);
  const state = projection.state;
  const pieces = boardToPieces(state.board);
  const whiteFog = fogSquaresFromVisible(variant.getPlayerView(state, 'white').visibleSquares);
  const blackFog = fogSquaresFromVisible(variant.getPlayerView(state, 'black').visibleSquares);
  return { pieces, whiteFog, blackFog };
}

// Clean game-record card: Mistboard branding, player pairing, and the same
// finished position from both player views.
function renderGameOgSvg(game: persistence.GameRecord, position: OgPosition): string {
  const boardSize = 300;
  const boardY = 262;
  const white = truncateName(displayNameForColor(game, 'white'));
  const black = truncateName(displayNameForColor(game, 'black'));
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
  );
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(`<rect x="84" y="64" width="1032" height="534" fill="none" stroke="#253023"/>`);
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="125" text-anchor="middle" fill="#f4f6ef" font-family="${FONT}" font-size="52" font-weight="900" letter-spacing="8">MISTBOARD</text>`,
  );
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="164" text-anchor="middle" fill="#9ba39a" font-family="${FONT}" font-size="22" font-weight="700">Dark Chess replay</text>`,
  );
  parts.push(
    renderBoardComposition({
      layout: 'pair',
      canvasWidth: OG_WIDTH,
      boardY,
      boardSize,
      gap: 104,
      labelY: 236,
      labelFill: '#e1e6da',
      labelFontSize: 24,
      labelLetterSpacing: 0,
      palette: GREEN_PALETTE,
      fogStyle: 'solid',
      boards: [
        {
          pieces: position.pieces,
          fogSquares: position.whiteFog,
          orientation: 'white',
          label: white,
        },
        {
          pieces: position.pieces,
          fogSquares: position.blackFog,
          orientation: 'black',
          label: black,
        },
      ],
    }),
  );
  parts.push(`</svg>`);
  return parts.join('');
}

function truncateName(name: string): string {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

function displayNameForColor(game: persistence.GameRecord, color: 'white' | 'black'): string {
  return (
    game.participants.find((participant) => participant.color === color)?.displayName ??
    (color === 'white' ? game.whiteName : game.blackName) ??
    (color === 'white' ? 'White' : 'Black')
  );
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

// Per-article share card: the article's thumbnail position (the same one the
// /articles list shows, via ARTICLE_OG_POSITIONS) rendered green/solid, with
// the article title below. Title is passed in by the route handler, which owns
// the slug→title map. Falls back to the default card if the slug has no
// thumbnail position.
export function serveArticleOgImage(slug: string, title: string, response: ServerResponse): void {
  const key = `article:${slug}`;
  const cached = cacheGet(key);
  if (cached) {
    writePng(response, cached, 'HIT');
    return;
  }
  const position = ARTICLE_OG_POSITIONS[slug];
  if (!position) {
    redirectToDefault(response);
    return;
  }
  const png = svgToPng(renderArticleOgSvg(title, position));
  cacheSet(key, png);
  writePng(response, png, 'MISS');
}

function renderArticleOgSvg(title: string, position: ArticleOgPosition): string {
  const boardSize = 360;
  const boardY = 130;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
  );
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="80" text-anchor="middle" fill="#9ca3af" font-family="${FONT}" font-size="24" font-weight="600" letter-spacing="3">MISTBOARD · DARK CHESS</text>`,
  );
  parts.push(
    renderBoardComposition({
      layout: 'single',
      canvasWidth: OG_WIDTH,
      boardY,
      boardSize,
      palette: GREEN_PALETTE,
      fogStyle: 'solid',
      boards: [
        {
          pieces: position.pieces,
          fogSquares: position.fogSquares,
          orientation: position.orientation ?? 'white',
        },
      ],
    }),
  );
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="${boardY + boardSize + 56}" text-anchor="middle" fill="#f3f4f6" font-family="${FONT}" font-size="34" font-weight="700">${escapeXml(title)}</text>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

function renderStubSvg(game: persistence.GameRecord): string {
  const white = escapeXml(truncateName(displayNameForColor(game, 'white')));
  const black = escapeXml(truncateName(displayNameForColor(game, 'black')));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>
  <rect x="84" y="64" width="1032" height="534" fill="none" stroke="#253023"/>
  <text x="600" y="170" text-anchor="middle" fill="#f4f6ef" font-family="${FONT}" font-size="56" font-weight="900" letter-spacing="8">MISTBOARD</text>
  <text x="600" y="214" text-anchor="middle" fill="#9ba39a" font-family="${FONT}" font-size="24" font-weight="700">Dark Chess replay</text>
  <text x="600" y="316" text-anchor="middle" fill="#e1e6da" font-family="${FONT}" font-size="40" font-weight="800">${white} vs ${black}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Default OG card: two starting-position boards, one per POV ────────────────
//
// The card shows the same opening position twice, side by side: the left board
// is White's POV (Black's half fogged), the right is Black's POV (White's half
// fogged). Fog is computed from the engine's real opening visibility, never
// hand-faked, so the card always matches the game's rules. Green palette +
// solid fog mirror the in-app default theme (apps/web/src/theme.ts). Re-run
// `npm run og:default --workspace @mistboard/server` to re-bake
// `apps/web/public/og-image.png`.

const FONT = 'system-ui, -apple-system, Helvetica, Arial, sans-serif';

// Standard starting position plus each side's real opening fog.
function openingBoards(): { pieces: PieceOnBoard[]; whiteFog: Square[]; blackFog: Square[] } {
  const state = darkChessVariant.createInitialState('og-default');
  const pieces = boardToPieces(state.board);
  const whiteFog = fogSquaresFromVisible(
    darkChessVariant.getPlayerView(state, 'white').visibleSquares,
  );
  const blackFog = fogSquaresFromVisible(
    darkChessVariant.getPlayerView(state, 'black').visibleSquares,
  );
  return { pieces, whiteFog, blackFog };
}

export function renderDefaultOgSvg(): string {
  const { pieces, whiteFog, blackFog } = openingBoards();
  const boardSize = 360;
  const boardY = 150;
  const labelY = boardY + boardSize + 40;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
  );
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  // Brand wordmark — large, centered.
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="92" text-anchor="middle" fill="#f3f4f6" font-family="${FONT}" font-size="56" font-weight="800" letter-spacing="6">MISTBOARD</text>`,
  );
  parts.push(
    renderBoardComposition({
      layout: 'pair',
      canvasWidth: OG_WIDTH,
      boardY,
      boardSize,
      gap: 96,
      palette: GREEN_PALETTE,
      fogStyle: 'solid',
      boards: [
        { pieces, fogSquares: whiteFog, orientation: 'white' },
        { pieces, fogSquares: blackFog, orientation: 'black' },
      ],
    }),
  );
  // Per-board POV captions, just under each board.
  const xs = [OG_WIDTH / 2 - boardSize / 2 - 48, OG_WIDTH / 2 + boardSize / 2 + 48];
  parts.push(
    `<text x="${xs[0]}" y="${labelY}" text-anchor="middle" fill="#9ca3af" font-family="${FONT}" font-size="22" letter-spacing="1">White's view</text>`,
  );
  parts.push(
    `<text x="${xs[1]}" y="${labelY}" text-anchor="middle" fill="#9ca3af" font-family="${FONT}" font-size="22" letter-spacing="1">Black's view</text>`,
  );
  // Tagline — slightly larger than before.
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="600" text-anchor="middle" fill="#e5e7eb" font-family="${FONT}" font-size="30" font-weight="500">Chess where you only see what your pieces see.</text>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

// Render at 2x the SVG's nominal dimensions so the resulting PNG stays crisp
// on retina displays and survives scraper recompression.
export function svgToPng(svg: string, background = '#0f1115'): Buffer {
  return new Resvg(svg, {
    background,
    fitTo: { mode: 'zoom', value: 2 },
  })
    .render()
    .asPng();
}
