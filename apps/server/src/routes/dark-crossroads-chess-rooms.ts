import type { ServerResponse } from 'node:http';
import { DARK_CROSSROADS_CHESS_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (dark-crossroads-chess-registration.ts).
export type DarkCrossroadsChessCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDarkCrossroadsChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'red' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'dark_crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsDarkCrossroadsChess(body: Record<string, unknown>): boolean {
  return body.gameSpecId === DARK_CROSSROADS_CHESS_SPEC_ID;
}

export async function handleDarkCrossroadsChessCreate(
  ctx: DarkCrossroadsChessCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({
    gameSpecId: body.gameSpecId,
    variant: body.variant,
  });
  if (body.gameSpecId !== DARK_CROSSROADS_CHESS_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'dark_crossroads_chess_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'dark_crossroads_chess_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseDarkCrossroadsChessRoomMode(body);
  const preferredColor = parseDarkCrossroadsChessPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode !== 'pvp' || body.rated === true || body.engineId !== undefined) {
    writeJson(response, 501, { error: 'dark_crossroads_chess_unsupported_surface' });
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

  const created = await ctx.createDarkCrossroadsChessRoom(timeControl ?? undefined, preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'dark_crossroads_chess_disabled'
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
    mode: 'pvp',
    gameSpecId: created.room.gameSpecId,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
  });
}

function parseDarkCrossroadsChessRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseDarkCrossroadsChessPreferredColor(
  value: unknown,
): 'white' | 'red' | 'random' | undefined {
  if (value === 'white' || value === 'red' || value === 'random') return value;
  return undefined;
}
