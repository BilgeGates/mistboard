import type { ServerResponse } from 'node:http';
import { REVEAL_CHESS_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (reveal-chess-registration.ts). Reveal Chess is
// PvP-only (no engine/bot), so there is no PvE branch and no engine seat.
export type RevealChessCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createRevealChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'black' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'reveal_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsRevealChess(body: Record<string, unknown>): boolean {
  return body.gameSpecId === REVEAL_CHESS_SPEC_ID;
}

export async function handleRevealChessCreate(
  ctx: RevealChessCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== REVEAL_CHESS_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'reveal_chess_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'reveal_chess_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseRevealChessRoomMode(body);
  const preferredColor = parseRevealChessPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  // PvP only (no engine/bot) and rated still gated: reject every other surface.
  if (mode !== 'pvp' || body.rated === true) {
    writeJson(response, 501, { error: 'reveal_chess_unsupported_surface' });
    return;
  }
  if (ctx.databaseRequired && !persistence.isInitialized()) {
    writeJson(response, 503, { error: 'persistence_disabled' });
    return;
  }
  if (ctx.isDraining()) {
    writeJson(response, 503, { error: 'server_draining', restartAt: ctx.drainDeadlineMs() });
    return;
  }

  const created = await ctx.createRevealChessRoom(timeControl ?? undefined, preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'reveal_chess_disabled'
        ? 404
        : created.error === 'persistence_failure'
          ? 503
          : 500;
    writeJson(response, status, { error: created.error });
    return;
  }
  writeJson(response, 201, {
    roomId: created.room.id,
    url: `/room/${encodeURIComponent(created.room.id)}`,
    mode,
    gameSpecId: created.room.gameSpecId,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
  });
}

function parseRevealChessRoomMode(body: Record<string, unknown>): 'pvp' | null {
  return body.mode === 'pvp' ? 'pvp' : null;
}

function parseRevealChessPreferredColor(value: unknown): 'white' | 'black' | 'random' | undefined {
  if (value === 'white' || value === 'black' || value === 'random') return value;
  return undefined;
}
