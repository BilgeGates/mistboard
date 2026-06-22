import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { DROP_MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { ratedEnabled } from './../feature-flags.js';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import type { UserAccount } from './../persistence.js';
import * as persistence from './../persistence.js';
import {
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  isDropMiniXiangqiEngineClientId,
} from './../server-drop-mini-xiangqi-engine.js';
import { isAllowedRatedTimeControl, parseRoomTimeControl, writeJson } from './lib.js';

export type DropMiniXiangqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDropMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    rated?: boolean,
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string; rated: boolean } }
    | {
        ok: false;
        error: 'drop_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsDropMiniXiangqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === DROP_MINI_XIANGQI_SPEC_ID;
}

export async function handleDropMiniXiangqiCreate(
  ctx: DropMiniXiangqiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
  accountUser: UserAccount | null = null,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({
    gameSpecId: body.gameSpecId,
    variant: body.variant,
  });
  if (body.gameSpecId !== DROP_MINI_XIANGQI_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'drop_mini_xiangqi_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'drop_mini_xiangqi_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }

  const mode = parseDropMiniXiangqiRoomMode(body);
  if (mode === null || (mode === 'pve' && body.rated === true)) {
    writeJson(response, 501, { error: 'drop_mini_xiangqi_unsupported_surface' });
    return;
  }
  const preferredColor = parseDropMiniXiangqiPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }

  const wantsRated = mode === 'pvp' && body.rated === true;
  if (wantsRated && !ratedEnabled()) {
    writeJson(response, 403, { error: 'rated_disabled' });
    return;
  }
  if (wantsRated && !accountUser) {
    writeJson(response, 401, { error: 'rated_requires_account' });
    return;
  }
  if (wantsRated && timeControl && !isAllowedRatedTimeControl(timeControl)) {
    writeJson(response, 400, { error: 'rated_time_control_unsupported' });
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

  const botId = typeof body.botId === 'string' ? body.botId : undefined;
  let engine: { engineId: string; seat: 'red' | 'black'; botId?: string } | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID;
    if (!isDropMiniXiangqiEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    const humanColor = dropMiniXiangqiPveHumanColor(preferredColor);
    engine = {
      engineId,
      seat: humanColor === 'red' ? 'black' : 'red',
      ...(botId ? { botId } : {}),
    };
  }

  const created = await ctx.createDropMiniXiangqiRoom(
    timeControl ?? undefined,
    preferredColor,
    wantsRated,
    engine,
  );
  if (!created.ok) {
    const status =
      created.error === 'drop_mini_xiangqi_disabled'
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
    rated: created.room.rated,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
  });
}

function parseDropMiniXiangqiRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseDropMiniXiangqiPreferredColor(
  value: unknown,
): 'red' | 'black' | 'random' | undefined {
  if (value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}

export function dropMiniXiangqiPveHumanColor(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredColor === 'black') return 'black';
  if (preferredColor === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}
