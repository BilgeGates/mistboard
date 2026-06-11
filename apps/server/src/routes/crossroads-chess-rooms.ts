import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import {
  CROSSROADS_CHESS_SPEC_ID,
  maybeGameSpecForId,
  type RoomTimeControl,
} from '@mistboard/game';
import {
  CROSSROADS_CHESS_DEFAULT_ENGINE_ID,
  isCrossroadsChessEngineClientId,
} from './../crossroads-chess-engine.js';
import { crossroadsChessEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (crossroads-chess-registration.ts).
export type CrossroadsChessCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createCrossroadsChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'red' | 'random',
    engine?: { engineId: string; seat: 'white' | 'red' },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsCrossroadsChess(body: Record<string, unknown>): boolean {
  return (
    typeof body.gameSpecId === 'string' &&
    maybeGameSpecForId(body.gameSpecId)?.id === CROSSROADS_CHESS_SPEC_ID
  );
}

// Create a perfect-information Crossroads Chess live room. Supports PvP and
// server-owned Fairy-Stockfish PvE, flag-gated, not rated.
export async function handleCrossroadsChessCreate(
  ctx: CrossroadsChessCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  if (!crossroadsChessEnabled()) {
    writeJson(response, 404, { error: 'crossroads_chess_disabled' });
    return;
  }
  const mode = parseCrossroadsChessRoomMode(body);
  if (mode === null || body.rated === true) {
    writeJson(response, 501, { error: 'crossroads_chess_unsupported_surface' });
    return;
  }
  const preferredColor = parseCrossroadsChessPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
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

  let engine: { engineId: string; seat: 'white' | 'red' } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : CROSSROADS_CHESS_DEFAULT_ENGINE_ID;
    if (!isCrossroadsChessEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanColor = crossroadsChessPveHumanColor(preferredColor);
    engine = { engineId, seat: humanColor === 'white' ? 'red' : 'white' };
  }

  const created = await ctx.createCrossroadsChessRoom(
    timeControl ?? undefined,
    preferredColor,
    engine,
  );
  if (!created.ok) {
    const status =
      created.error === 'crossroads_chess_disabled'
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

function parseCrossroadsChessRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseCrossroadsChessPreferredColor(
  value: unknown,
): 'white' | 'red' | 'random' | undefined {
  if (value === 'white' || value === 'red' || value === 'random') return value;
  if (value === 'black') return 'red';
  return undefined;
}

export function crossroadsChessPveHumanColor(
  preferredColor: 'white' | 'red' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'white' | 'red' {
  if (preferredColor === 'red') return 'red';
  if (preferredColor === 'random') return randomByte < 128 ? 'white' : 'red';
  return 'white';
}
