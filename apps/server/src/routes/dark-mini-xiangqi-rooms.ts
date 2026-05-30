import type { ServerResponse } from 'node:http';
import { DARK_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import type { HttpApiContext } from './lib.js';
import { writeJson } from './lib.js';

export function requestsDarkMiniXiangqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID;
}

export async function handleDarkMiniXiangqiCreate(
  ctx: HttpApiContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({
    gameSpecId: body.gameSpecId,
    variant: body.variant,
  });
  if (body.gameSpecId !== DARK_MINI_XIANGQI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'dark_mini_xiangqi_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'dark_mini_xiangqi_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseDarkMiniXiangqiRoomMode(body);
  const preferredColor = parseDarkMiniXiangqiPreferredColor(body.preferredColor);
  if (
    mode !== 'pvp' ||
    body.rated === true ||
    body.engineId !== undefined ||
    body.timeControl !== undefined
  ) {
    writeJson(response, 501, { error: 'dark_mini_xiangqi_unsupported_surface' });
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

  const created = await ctx.createDarkMiniXiangqiRoom(preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'dark_mini_xiangqi_disabled'
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
  });
}

function parseDarkMiniXiangqiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseDarkMiniXiangqiPreferredColor(
  value: unknown,
): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}
