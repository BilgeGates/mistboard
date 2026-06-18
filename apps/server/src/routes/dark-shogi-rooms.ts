import type { ServerResponse } from 'node:http';
import { DARK_SHOGI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

export type DarkShogiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDarkShogiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'black' | 'white' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'dark_shogi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsDarkShogi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === DARK_SHOGI_SPEC_ID;
}

export async function handleDarkShogiCreate(
  ctx: DarkShogiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== DARK_SHOGI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'dark_shogi_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'dark_shogi_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseDarkShogiRoomMode(body);
  const preferredColor = parseDarkShogiPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode !== 'pvp' || body.rated === true || body.engineId !== undefined) {
    writeJson(response, 501, { error: 'dark_shogi_unsupported_surface' });
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

  const created = await ctx.createDarkShogiRoom(timeControl ?? undefined, preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'dark_shogi_disabled'
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

function parseDarkShogiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseDarkShogiPreferredColor(value: unknown): 'black' | 'white' | 'random' | undefined {
  if (value === 'black' || value === 'white' || value === 'random') return value;
  return undefined;
}
