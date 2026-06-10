// HTTP API dispatcher. All route logic lives under apps/server/src/routes/.
// Each route module exports `tryHandle(ctx, request, response, pathname, parsedUrl)`
// returning `true` if it handled the request (response was written) or `false`
// to let the next module try. http-api.ts walks the module list in a documented
// order and falls back to 404 when no module claims the request.
//
// Re-exports the public surface (HttpApiContext, parse helpers, readJsonBody,
// writeJson, requireMethod, requirePersistence) so existing consumers like
// index.ts don't need to know things moved.

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as accountRoute from './routes/account.js';
import * as annotationsRoute from './routes/annotations.js';
import * as authRoute from './routes/auth.js';
import * as crossroadsChessRoute from './routes/crossroads-chess.js';
import * as darkMiniXiangqiGamesRoute from './routes/dark-mini-xiangqi-games.js';
import * as darkXiangqiGamesRoute from './routes/dark-xiangqi-games.js';
import * as enginesRoute from './routes/engines.js';
import * as feedbackRoute from './routes/feedback.js';
import * as gamesRoute from './routes/games.js';
import * as leaderboardRoute from './routes/leaderboard.js';
import type { HttpApiContext } from './routes/lib.js';
import * as lobbyRoute from './routes/lobby.js';
import * as metaRoute from './routes/meta.js';
import * as roomsRoute from './routes/rooms.js';
import * as usersRoute from './routes/users.js';

// Public re-exports: keep import sites in index.ts and elsewhere stable.
export {
  type HttpApiContext,
  isAllowedTimeControl,
  parseHiddenDraft960,
  parseRoomTimeControl,
  parseVariantId,
  readJsonBody,
  requireMethod,
  requirePersistence,
  writeJson,
} from './routes/lib.js';

// Route modules listed in dispatch order. Earlier modules win — order matters
// for path patterns that could overlap (e.g. /api/games vs /api/games/recent).
type RouteModule = {
  tryHandle(
    ctx: HttpApiContext,
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
    parsedUrl: URL,
  ): Promise<boolean>;
};

const routes: RouteModule[] = [
  annotationsRoute,
  authRoute,
  accountRoute,
  enginesRoute,
  feedbackRoute,
  metaRoute,
  roomsRoute,
  lobbyRoute,
  darkMiniXiangqiGamesRoute,
  darkXiangqiGamesRoute,
  crossroadsChessRoute,
  gamesRoute,
  usersRoute,
  leaderboardRoute,
];

export async function handleApiRequest(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = request.url ?? '/';
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  for (const route of routes) {
    if (await route.tryHandle(ctx, request, response, pathname, parsedUrl)) return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
}
