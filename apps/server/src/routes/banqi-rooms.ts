import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { BANQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { BANQI_DEFAULT_ENGINE_ID, isBanqiEngineClientId } from './../banqi-engine.js';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (banqi-registration.ts). `preferredColor` selects the
// move-order SEAT — 'red' = first mover, 'black' = second (banqi binds the actual
// ink on the first flip, so the seat is a move-order choice, not an ink choice):
// 'red' | 'black' | 'random'.
export type BanqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createBanqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black' },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'banqi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsBanqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === BANQI_SPEC_ID;
}

export async function handleBanqiCreate(
  ctx: BanqiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== BANQI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'banqi_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'banqi_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseBanqiRoomMode(body);
  const preferredSeat = parseBanqiPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode === null || body.rated === true) {
    writeJson(response, 501, { error: 'banqi_unsupported_surface' });
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

  // PvE: seat a MistyBanqi engine (Tier-B UCI). The human takes their preferred seat;
  // the engine takes the other. 'red' = first mover, so a human on 'black' makes the
  // engine open.
  let engine: { engineId: string; seat: 'red' | 'black' } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0 ? body.engineId : BANQI_DEFAULT_ENGINE_ID;
    if (!isBanqiEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanSeat = banqiPveHumanSeat(preferredSeat);
    engine = { engineId, seat: humanSeat === 'red' ? 'black' : 'red' };
  }

  const created = await ctx.createBanqiRoom(timeControl ?? undefined, preferredSeat, engine);
  if (!created.ok) {
    const status =
      created.error === 'banqi_disabled'
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
export function banqiPveHumanSeat(
  preferredSeat: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredSeat === 'black') return 'black';
  if (preferredSeat === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}

function parseBanqiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseBanqiPreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}
