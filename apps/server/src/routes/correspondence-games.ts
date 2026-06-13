import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

// GET /api/correspondence/games — the signed-in player's in-flight
// correspondence games, your-move-first, plus the your-move count that drives
// the nav badge. Reads the room_deadlines index
// (listCorrespondenceGamesForUser); account-only, mirroring the create gate.
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/correspondence/games') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const games = await persistence.listCorrespondenceGamesForUser(user.id);
  writeJson(response, 200, {
    games: games.map((game) => ({
      roomId: game.roomId,
      url: `/room/${encodeURIComponent(game.roomId)}`,
      gameSpecId: game.gameSpecId,
      mySeat: game.mySeat,
      isYourMove: game.isYourMove,
      opponentName: game.opponentName,
      dueAt: game.dueAt.toISOString(),
    })),
    yourMoveCount: games.reduce((count, game) => count + (game.isYourMove ? 1 : 0), 0),
  });
  return true;
}
