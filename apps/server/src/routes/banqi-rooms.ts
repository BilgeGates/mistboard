import type { ServerResponse } from 'node:http';
import { BANQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
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
  if (mode !== 'pvp' || body.rated === true || body.engineId !== undefined) {
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

  const created = await ctx.createBanqiRoom(timeControl ?? undefined, preferredSeat);
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
    mode: 'pvp',
    gameSpecId: created.room.gameSpecId,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
  });
}

function parseBanqiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseBanqiPreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}
