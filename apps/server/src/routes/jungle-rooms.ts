import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { JUNGLE_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { isJungleEngineClientId, JUNGLE_DEFAULT_ENGINE_ID } from './../server-jungle-engine.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (jungle-registration.ts). `preferredColor` selects the
// move-order seat — 'red' = first mover (and the red pieces), 'black' = second.
export type JungleCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createJungleRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'jungle_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsJungle(body: Record<string, unknown>): boolean {
  return body.gameSpecId === JUNGLE_SPEC_ID;
}

export async function handleJungleCreate(
  ctx: JungleCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== JUNGLE_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'jungle_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'jungle_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseJungleRoomMode(body);
  const preferredColor = parseJunglePreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  // PvP + PvE (the in-process Misty Jungle engine). Rated is still unsupported.
  if (mode === null || body.rated === true) {
    writeJson(response, 501, { error: 'jungle_unsupported_surface' });
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

  // PvE: seat the Misty Jungle engine opposite the human. 'red' = first mover, so a
  // human on 'black' makes the engine open.
  const botId = typeof body.botId === 'string' ? body.botId : undefined;
  let engine: { engineId: string; seat: 'red' | 'black'; botId?: string } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : JUNGLE_DEFAULT_ENGINE_ID;
    if (!isJungleEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanSeat = junglePveHumanSeat(preferredColor);
    engine = {
      engineId,
      seat: humanSeat === 'red' ? 'black' : 'red',
      ...(botId ? { botId } : {}),
    };
  }

  const created = await ctx.createJungleRoom(timeControl ?? undefined, preferredColor, engine);
  if (!created.ok) {
    const status =
      created.error === 'jungle_disabled'
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

function parseJungleRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseJunglePreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}

// Red is the first mover; the human's default seat is red. Picking black puts the
// engine on red so it opens immediately.
export function junglePveHumanSeat(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredColor === 'black') return 'black';
  if (preferredColor === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}
