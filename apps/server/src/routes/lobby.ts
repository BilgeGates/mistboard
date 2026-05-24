import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomTimeControl } from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { ratedEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import type { LobbyTicket, Room } from './../server-types.js';
import {
  type HttpApiContext,
  parseHiddenDraft960,
  parseRoomTimeControl,
  readJsonBody,
  requireMethod,
  writeJson,
} from './lib.js';

const lobbyTicketTtlMs = 5 * 60 * 1000;
const lobbyPollAfterMs = 1_000;

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const method = request.method ?? 'GET';

  if (pathname === '/api/lobby') {
    if (method === 'GET') {
      pruneLobbyTickets(ctx);
      writeJson(response, 200, { requests: lobbyOpenRequests(ctx) });
      return true;
    }
    if (!requireMethod(request, response, 'POST')) return true;
    const body = await readJsonBody(request);
    const hiddenDraft960 = parseHiddenDraft960(body.hiddenDraft960);
    const timeControl =
      body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
    // Rated requires the flag on AND a signed-in requester. A guest (or anyone
    // when the flag is off) silently gets a casual ticket. Both sides of a match
    // are rated tickets, and the game-end account-gate is the final backstop.
    const lobbyRated =
      ratedEnabled() && body.rated === true && (await currentAccountUser(request)) !== null;
    if (body.timeControl !== undefined && !timeControl) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_time_control' }));
      return true;
    }
    if (ctx.databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return true;
    }
    if (ctx.isDraining()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'server_draining', restartAt: ctx.drainDeadlineMs() }));
      return true;
    }
    const ticket = await joinLobby(ctx, hiddenDraft960, timeControl ?? undefined, lobbyRated);
    writeJson(response, ticket.roomId ? 201 : 202, lobbyTicketResponse(ticket));
    return true;
  }

  const lobbyMatch = pathname.match(/^\/api\/lobby\/([^/]+)$/);
  if (lobbyMatch) {
    pruneLobbyTickets(ctx);
    const ticketId = decodeURIComponent(lobbyMatch[1]!);
    const ticket = ctx.lobbyTickets.get(ticketId);
    if (!ticket) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'GET') {
      writeJson(response, 200, lobbyTicketResponse(ticket));
      return true;
    }
    if (method === 'DELETE') {
      cancelLobbyTicket(ctx, ticketId);
      writeJson(response, 200, { ok: true });
      return true;
    }
    response.writeHead(405, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'method_not_allowed' }));
    return true;
  }

  return false;
}

async function joinLobby(
  ctx: HttpApiContext,
  hiddenDraft960: boolean,
  timeControl: RoomTimeControl | undefined,
  rated = false,
): Promise<LobbyTicket> {
  pruneLobbyTickets(ctx);
  const timeKey = timeControlKey(timeControl);
  const matchedTicket = ctx.lobbyQueue.find(
    (ticket) =>
      ticket.roomId === null &&
      ticket.hiddenDraft960 === hiddenDraft960 &&
      ticket.rated === rated &&
      timeControlKey(ticket.timeControl) === timeKey,
  );
  const ticket: LobbyTicket = {
    id: randomUUID(),
    createdAt: Date.now(),
    hiddenDraft960,
    rated,
    matchedAt: null,
    roomId: null,
    timeControl,
  };
  ctx.lobbyTickets.set(ticket.id, ticket);

  if (!matchedTicket) {
    ctx.lobbyQueue.push(ticket);
    return ticket;
  }

  let room: Room;
  try {
    room = await ctx.createRoom(
      'pvp',
      'dark-chess',
      ctx.pveBuiltinEngineClientId,
      hiddenDraft960,
      timeControl,
      rated,
      { randomSeating: true },
    );
  } catch (err) {
    ctx.lobbyTickets.delete(ticket.id);
    throw err;
  }
  const matchedAt = Date.now();
  matchedTicket.matchedAt = matchedAt;
  matchedTicket.roomId = room.id;
  ticket.matchedAt = matchedAt;
  ticket.roomId = room.id;
  const matchedIndex = ctx.lobbyQueue.findIndex((candidate) => candidate.id === matchedTicket.id);
  if (matchedIndex >= 0) ctx.lobbyQueue.splice(matchedIndex, 1);
  return ticket;
}

function cancelLobbyTicket(ctx: HttpApiContext, ticketId: string): void {
  const ticket = ctx.lobbyTickets.get(ticketId);
  if (!ticket || ticket.roomId !== null) return;
  ctx.lobbyTickets.delete(ticketId);
  const queueIndex = ctx.lobbyQueue.findIndex((candidate) => candidate.id === ticketId);
  if (queueIndex >= 0) ctx.lobbyQueue.splice(queueIndex, 1);
}

function pruneLobbyTickets(ctx: HttpApiContext, now = Date.now()): void {
  for (const [ticketId, ticket] of ctx.lobbyTickets) {
    if (now - ticket.createdAt >= lobbyTicketTtlMs) {
      ctx.lobbyTickets.delete(ticketId);
    }
  }
  for (let index = ctx.lobbyQueue.length - 1; index >= 0; index -= 1) {
    const ticket = ctx.lobbyQueue[index];
    if (!ticket || !ctx.lobbyTickets.has(ticket.id) || ticket.roomId !== null) {
      ctx.lobbyQueue.splice(index, 1);
    }
  }
}

function lobbyTicketResponse(ticket: LobbyTicket): Record<string, unknown> {
  return {
    ticketId: ticket.id,
    status: ticket.roomId ? 'matched' : 'waiting',
    pollAfterMs: lobbyPollAfterMs,
    ...(ticket.roomId
      ? {
          roomId: ticket.roomId,
          url: `/room/${encodeURIComponent(ticket.roomId)}`,
        }
      : {}),
  };
}

function lobbyOpenRequests(ctx: HttpApiContext): Array<Record<string, unknown>> {
  const now = Date.now();
  return ctx.lobbyQueue
    .filter((ticket) => ticket.roomId === null)
    .slice(0, 20)
    .map((ticket) => ({
      hiddenDraft960: ticket.hiddenDraft960,
      rated: ticket.rated,
      timeControl: ticket.timeControl ?? {
        initialMs: ctx.liveClockInitialMs,
        incrementMs: ctx.liveClockIncrementMs,
      },
      waitingMs: Math.max(0, now - ticket.createdAt),
    }));
}

function timeControlKey(timeControl: RoomTimeControl | undefined): string {
  return timeControl ? `${timeControl.initialMs}:${timeControl.incrementMs}` : 'default';
}
