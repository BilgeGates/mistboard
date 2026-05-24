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
  const cached = cacheGet(roomId);
  if (cached) {
    writePng(response, cached, 'HIT');
    return;
  }

  const game = await persistence.getGameSummary(roomId);
  if (!game?.result) {
    redirectToDefault(response);
    return;
  }

  // Prefer the rich two-board card built from a real mid-game position. If the
  // event log is missing or the replay throws, fall back to the text stub so a
  // shared link always resolves to *some* card.
  let svg: string;
  try {
    const position = await reconstructOgPosition(roomId, game.plyCount ?? 0);
    svg = position ? renderGameOgSvg(game, position) : renderStubSvg(game);
  } catch {
    svg = renderStubSvg(game);
  }
  const png = svgToPng(svg);
  cacheSet(roomId, png);
  writePng(response, png, 'MISS');
}

type OgPosition = { pieces: PieceOnBoard[]; whiteFog: Square[]; blackFog: Square[] };

// Replay the event log to a position 40-70% through the game, then compute each
// side's fog there. The ply is randomized per render but the result is cached
// immutably, so a given game link freezes on one position after its first
// fetch (a share card shouldn't change every refresh). Returns null when there
// are no moves to show, so the caller falls back to the text stub.
async function reconstructOgPosition(roomId: string, plyCount: number): Promise<OgPosition | null> {
  if (plyCount < 1) return null;
  const events = await persistence.loadRoom(roomId);
  if (!events || events.length === 0) return null;

  const fraction = 0.4 + Math.random() * 0.3; // [0.4, 0.7]
  const targetPly = Math.max(1, Math.round(plyCount * fraction));

  let projection = initialGameProjection(events[0]?.roomId ?? roomId);
  let pliesApplied = 0;
  for (const event of events as GameEvent[]) {
    projection = applyGameEvent(projection, event);
    if (event.type === 'move-played') {
      pliesApplied += 1;
      if (pliesApplied >= targetPly) break;
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

// Two boards of the same mid-game position — White's POV left, Black's POV
// right — with each player's name under their board and the result below.
function renderGameOgSvg(game: persistence.GameRecord, position: OgPosition): string {
  const boardSize = 360;
  const boardY = 140;
  const labelY = boardY + boardSize + 40;
  const white = escapeXml(truncateName(game.whiteName ?? 'White'));
  const black = escapeXml(truncateName(game.blackName ?? 'Black'));
  const plies = game.plyCount ?? 0;
  const moves = Math.ceil(plies / 2);
  const resultLine = `${escapeXml(resultLabel(game))} · ${moves} move${moves === 1 ? '' : 's'}`;

  const xs = [OG_WIDTH / 2 - boardSize / 2 - 48, OG_WIDTH / 2 + boardSize / 2 + 48];
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
  );
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f1115"/>`);
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="86" text-anchor="middle" fill="#9ca3af" font-family="${FONT}" font-size="24" font-weight="600" letter-spacing="3">MISTBOARD · DARK CHESS</text>`,
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
        { pieces: position.pieces, fogSquares: position.whiteFog, orientation: 'white' },
        { pieces: position.pieces, fogSquares: position.blackFog, orientation: 'black' },
      ],
    }),
  );
  parts.push(
    `<text x="${xs[0]}" y="${labelY}" text-anchor="middle" fill="#e5e7eb" font-family="${FONT}" font-size="26" font-weight="600">${white}</text>`,
  );
  parts.push(
    `<text x="${xs[1]}" y="${labelY}" text-anchor="middle" fill="#e5e7eb" font-family="${FONT}" font-size="26" font-weight="600">${black}</text>`,
  );
  parts.push(
    `<text x="${OG_WIDTH / 2}" y="600" text-anchor="middle" fill="#9ca3af" font-family="${FONT}" font-size="26">${resultLine}</text>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

function truncateName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
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
