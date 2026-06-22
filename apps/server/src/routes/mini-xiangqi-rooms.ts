import type { ServerResponse } from 'node:http';
import { MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

export type MiniXiangqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    rated?: boolean,
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string; rated: boolean } }
    | {
        ok: false;
        error: 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsMiniXiangqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === MINI_XIANGQI_SPEC_ID;
}

export async function handleMiniXiangqiCreate(
  ctx: MiniXiangqiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({
    gameSpecId: body.gameSpecId,
    variant: body.variant,
  });
  if (body.gameSpecId !== MINI_XIANGQI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'mini_xiangqi_not_integrated' });
    return;
  }

  const mode = parseMiniXiangqiRoomMode(body);
  if (mode !== 'pvp') {
    writeJson(response, 501, { error: 'mini_xiangqi_unsupported_surface' });
    return;
  }
  if (body.rated === true) {
    writeJson(response, 501, { error: 'rated_unsupported_surface' });
    return;
  }
  const preferredColor = parseMiniXiangqiPreferredColor(body.preferredColor);
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

  const created = await ctx.createMiniXiangqiRoom(timeControl ?? undefined, preferredColor, false);
  if (!created.ok) {
    const status = created.error === 'persistence_failure' ? 503 : 500;
    writeJson(response, status, { error: created.error });
    return;
  }
  writeJson(response, 201, {
    roomId: created.room.id,
    url: `/room/${encodeURIComponent(created.room.id)}`,
    mode,
    gameSpecId: created.room.gameSpecId,
    rated: created.room.rated,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
  });
}

function parseMiniXiangqiRoomMode(body: Record<string, unknown>): 'pvp' | null {
  return body.mode === 'pvp' ? 'pvp' : null;
}

function parseMiniXiangqiPreferredColor(value: unknown): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}
