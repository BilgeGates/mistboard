import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { JUNGLE_FLIP_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import {
  isJungleFlipEngineClientId,
  JUNGLE_FLIP_DEFAULT_ENGINE_ID,
} from './../jungle-flip-engine.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// `preferredColor` selects the move-order SEAT — 'red' = first mover (the flip game
// binds the actual ink on the first flip, so this is a move-order choice, not an ink
// choice).
export type JungleFlipCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createJungleFlipRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'jungle_flip_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsJungleFlip(body: Record<string, unknown>): boolean {
  return body.gameSpecId === JUNGLE_FLIP_SPEC_ID;
}

export async function handleJungleFlipCreate(
  ctx: JungleFlipCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== JUNGLE_FLIP_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'jungle_flip_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'jungle_flip_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseJungleFlipRoomMode(body);
  const preferredColor = parseJungleFlipPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  // PvP + PvE (the Tier-B MistyJungleFlip UCI engine). Rated is still unsupported.
  if (mode === null || body.rated === true) {
    writeJson(response, 501, { error: 'jungle_flip_unsupported_surface' });
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

  // PvE: seat the MistyJungleFlip engine opposite the human. 'red' = first mover, so a
  // human on 'black' makes the engine open.
  const botId = typeof body.botId === 'string' ? body.botId : undefined;
  let engine: { engineId: string; seat: 'red' | 'black'; botId?: string } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : JUNGLE_FLIP_DEFAULT_ENGINE_ID;
    if (!isJungleFlipEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanSeat = jungleFlipPveHumanSeat(preferredColor);
    engine = {
      engineId,
      seat: humanSeat === 'red' ? 'black' : 'red',
      ...(botId ? { botId } : {}),
    };
  }

  const created = await ctx.createJungleFlipRoom(timeControl ?? undefined, preferredColor, engine);
  if (!created.ok) {
    const status =
      created.error === 'jungle_flip_disabled'
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

function parseJungleFlipRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseJungleFlipPreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}

// The human's move-order seat for PvE. Default 'red' (the human opens); 'random' picks
// uniformly. The engine takes the other seat.
export function jungleFlipPveHumanSeat(
  preferredSeat: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredSeat === 'black') return 'black';
  if (preferredSeat === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}
