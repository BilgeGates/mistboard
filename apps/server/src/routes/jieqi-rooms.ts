import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { JIEQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import { isJieqiEngineClientId, JIEQI_DEFAULT_ENGINE_ID } from './../jieqi-engine.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (jieqi-registration.ts).
export type JieqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createJieqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black' },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'jieqi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsJieqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === JIEQI_SPEC_ID;
}

export async function handleJieqiCreate(
  ctx: JieqiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== JIEQI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'jieqi_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'jieqi_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseJieqiRoomMode(body);
  const preferredColor = parseJieqiPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode === null || body.rated === true) {
    writeJson(response, 501, { error: 'jieqi_unsupported_surface' });
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

  // PvE: seat a PikaJieQi engine (Tier-B UCI). Red is the first mover; the human
  // takes their preferred color and the engine takes the other seat.
  let engine: { engineId: string; seat: 'red' | 'black' } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : JIEQI_DEFAULT_ENGINE_ID;
    if (!isJieqiEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanColor = jieqiPveHumanColor(preferredColor);
    engine = { engineId, seat: humanColor === 'red' ? 'black' : 'red' };
  }

  const created = await ctx.createJieqiRoom(timeControl ?? undefined, preferredColor, engine);
  if (!created.ok) {
    const status =
      created.error === 'jieqi_disabled'
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

// Red is the first mover; the human's default seat is red. Picking black puts the
// engine on red so it opens immediately.
export function jieqiPveHumanColor(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredColor === 'black') return 'black';
  if (preferredColor === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}

function parseJieqiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseJieqiPreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}
