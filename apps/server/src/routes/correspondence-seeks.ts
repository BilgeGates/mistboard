import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DARK_CHESS_SPEC_ID } from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { createDarkChessCorrespondenceGameForSeek } from './../dark-chess-registration.js';
import { correspondenceEnabled } from './../feature-flags.js';
import type { UserAccount } from './../persistence.js';
import * as persistence from './../persistence.js';
import {
  CORRESPONDENCE_ELIGIBLE_SPECS,
  parseCorrespondenceTimeControl,
  parsePreferredColor,
} from './correspondence-rooms.js';
import {
  type HttpApiContext,
  readJsonBody,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

// Cap on simultaneously-open seeks per account — bounds board spam while still
// leaving room to offer a few time controls / colors at once.
const MAX_OPEN_SEEKS_PER_USER = 6;

// The open async-seek board (C3): standing correspondence invitations anyone can
// accept later, so games form without both players ever being online together
// (the cold-start lever). Account-only on every verb, mirroring the
// correspondence create + games gates.
//   GET    /api/correspondence/seeks            list open seeks (+ isMine)
//   POST   /api/correspondence/seeks            post a seek
//   POST   /api/correspondence/seeks/:id/accept accept → create + seat a game
//   DELETE /api/correspondence/seeks/:id        cancel your own seek
export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (
    pathname !== '/api/correspondence/seeks' &&
    !pathname.startsWith('/api/correspondence/seeks/')
  ) {
    return false;
  }
  if (!correspondenceEnabled()) {
    writeJson(response, 404, { error: 'correspondence_disabled' });
    return true;
  }
  if (!requirePersistence(response)) return true;
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }

  if (pathname === '/api/correspondence/seeks') {
    const method = request.method ?? 'GET';
    if (method === 'GET') return listOpenSeeks(user, response);
    if (method === 'POST') return createSeek(ctx, user, request, response);
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  const acceptMatch = pathname.match(/^\/api\/correspondence\/seeks\/([^/]+)\/accept$/);
  if (acceptMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    return acceptSeek(ctx, user, decodeURIComponent(acceptMatch[1]!), response);
  }

  const idMatch = pathname.match(/^\/api\/correspondence\/seeks\/([^/]+)$/);
  if (idMatch) {
    if (!requireMethod(request, response, 'DELETE')) return true;
    return cancelSeek(user, decodeURIComponent(idMatch[1]!), response);
  }

  writeJson(response, 404, { error: 'not_found' });
  return true;
}

async function listOpenSeeks(user: UserAccount, response: ServerResponse): Promise<boolean> {
  const seeks = await persistence.listOpenCorrespondenceSeeks();
  writeJson(response, 200, {
    seeks: seeks.map((seek) => ({
      id: seek.id,
      gameSpecId: seek.gameSpecId,
      daysPerMove: seek.daysPerMove,
      preferredColor: seek.preferredColor,
      creatorName: seek.creatorName,
      createdAt: seek.createdAt.toISOString(),
      isMine: seek.creatorUserId === user.id,
    })),
  });
  return true;
}

async function createSeek(
  ctx: HttpApiContext,
  user: UserAccount,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const body = await readJsonBody(request);
  const gameSpecId = typeof body.gameSpecId === 'string' ? body.gameSpecId : DARK_CHESS_SPEC_ID;
  // Fork-6 fail-closed allowlist — the same set the create route enforces.
  if (!CORRESPONDENCE_ELIGIBLE_SPECS.has(gameSpecId)) {
    writeJson(response, 501, { error: 'correspondence_unsupported_spec' });
    return true;
  }
  const timeControl = parseCorrespondenceTimeControl(body.daysPerMove);
  const daysPerMove = timeControl?.daysPerMove;
  if (!timeControl || daysPerMove === undefined) {
    writeJson(response, 400, { error: 'invalid_days_per_move' });
    return true;
  }
  const preferredColor = parsePreferredColor(body.preferredColor) ?? 'random';
  if (ctx.isDraining()) {
    writeJson(response, 503, { error: 'server_draining', restartAt: ctx.drainDeadlineMs() });
    return true;
  }
  // Cap is best-effort under concurrency (no unique constraint); a racing pair of
  // creates could both pass at exactly the limit. Acceptable for a spam bound.
  const open = await persistence.countOpenSeeksForUser(user.id);
  if (open >= MAX_OPEN_SEEKS_PER_USER) {
    writeJson(response, 409, { error: 'seek_limit_reached', limit: MAX_OPEN_SEEKS_PER_USER });
    return true;
  }
  const id = `seek_${randomUUID()}`;
  await persistence.createCorrespondenceSeek({
    id,
    creatorUserId: user.id,
    gameSpecId,
    daysPerMove,
    preferredColor,
  });
  writeJson(response, 201, {
    seek: { id, gameSpecId, daysPerMove, preferredColor },
  });
  return true;
}

async function acceptSeek(
  ctx: HttpApiContext,
  user: UserAccount,
  seekId: string,
  response: ServerResponse,
): Promise<boolean> {
  if (ctx.isDraining()) {
    writeJson(response, 503, { error: 'server_draining', restartAt: ctx.drainDeadlineMs() });
    return true;
  }
  const seek = await persistence.getCorrespondenceSeek(seekId);
  if (!seek) {
    writeJson(response, 404, { error: 'seek_not_found' });
    return true;
  }
  if (seek.creatorUserId === user.id) {
    writeJson(response, 409, { error: 'cannot_accept_own_seek' });
    return true;
  }
  if (!CORRESPONDENCE_ELIGIBLE_SPECS.has(seek.gameSpecId)) {
    writeJson(response, 501, { error: 'correspondence_unsupported_spec' });
    return true;
  }
  const timeControl = parseCorrespondenceTimeControl(seek.daysPerMove);
  if (!timeControl) {
    writeJson(response, 500, { error: 'invalid_seek' });
    return true;
  }
  // The DB decides the race: deleteCorrespondenceSeek removes the row once, so
  // exactly one of two simultaneous accepters proceeds to create the game; the
  // loser gets 409 and the row is already gone.
  const won = await persistence.deleteCorrespondenceSeek(seekId);
  if (!won) {
    writeJson(response, 409, { error: 'seek_taken' });
    return true;
  }
  // Creator's color is honored; the accepter takes the other (random → coin flip).
  const creatorColor =
    seek.preferredColor === 'random'
      ? randomBytes(1)[0]! < 128
        ? 'white'
        : 'black'
      : seek.preferredColor;
  const accepterColor = creatorColor === 'white' ? 'black' : 'white';
  const created = await createDarkChessCorrespondenceGameForSeek({
    timeControl,
    white: { userId: creatorColor === 'white' ? seek.creatorUserId : user.id },
    black: { userId: creatorColor === 'black' ? seek.creatorUserId : user.id },
  });
  if (!created.ok) {
    // The seek row is already deleted, so a failure here is a rare persistence
    // error rather than a lost race — surface it; the creator can re-post.
    const status = created.error === 'disabled' ? 404 : 503;
    writeJson(response, status, { error: created.error });
    return true;
  }
  writeJson(response, 201, {
    roomId: created.room.id,
    url: `/room/${encodeURIComponent(created.room.id)}`,
    seat: accepterColor,
    gameSpecId: created.room.gameSpecId,
  });
  return true;
}

async function cancelSeek(
  user: UserAccount,
  seekId: string,
  response: ServerResponse,
): Promise<boolean> {
  // Owner-scoped: deletes only when the seek belongs to this account.
  const deleted = await persistence.deleteCorrespondenceSeek(seekId, user.id);
  if (!deleted) {
    writeJson(response, 404, { error: 'seek_not_found' });
    return true;
  }
  writeJson(response, 200, { ok: true });
  return true;
}
