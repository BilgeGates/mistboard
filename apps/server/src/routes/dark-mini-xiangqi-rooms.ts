import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { DARK_MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import {
  DARK_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  isDarkMiniXiangqiEngineClientId,
} from './../engines/registry.js';
import { ratedEnabled } from './../feature-flags.js';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import type { UserAccount } from './../persistence.js';
import * as persistence from './../persistence.js';
import { isAllowedRatedTimeControl, parseRoomTimeControl, writeJson } from './lib.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (dark-mini-xiangqi-registration.ts).
export type DarkMiniXiangqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  reserveLiveEngineSeat(engineId: string, color: 'white' | 'black'): Promise<string | null>;
  createDarkMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black'; reservationId: string; botId?: string },
    rated?: boolean,
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string; rated: boolean } }
    | {
        ok: false;
        error: 'dark_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

export function requestsDarkMiniXiangqi(body: Record<string, unknown>): boolean {
  return body.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID;
}

export async function handleDarkMiniXiangqiCreate(
  ctx: DarkMiniXiangqiCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
  accountUser: UserAccount | null = null,
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
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode === null) {
    writeJson(response, 501, { error: 'dark_mini_xiangqi_unsupported_surface' });
    return;
  }
  const wantsRated = body.rated === true;
  if (wantsRated && mode !== 'pvp') {
    writeJson(response, 501, { error: 'dark_mini_xiangqi_unsupported_surface' });
    return;
  }
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
  const rated = wantsRated && mode === 'pvp';
  const botId = typeof body.botId === 'string' ? body.botId : undefined;
  let engine:
    | { engineId: string; seat: 'red' | 'black'; reservationId: string; botId?: string }
    | undefined;
  if (mode === 'pve') {
    const engineId =
      typeof body.engineId === 'string' && body.engineId.length > 0
        ? body.engineId
        : DARK_MINI_XIANGQI_DEFAULT_ENGINE_ID;
    if (!isDarkMiniXiangqiEngineClientId(engineId)) {
      writeJson(response, 400, { error: 'invalid_engine' });
      return;
    }
    // The engine takes the opposite of the human's preferred color. Pre-seated at
    // creation; the human takes the only empty seat.
    const humanColor = darkMiniXiangqiPveHumanColor(preferredColor);
    const engineSeat: 'red' | 'black' = humanColor === 'red' ? 'black' : 'red';
    // Hold an engine-service seat (the global cap). Released on game end; the
    // engine service 409s every turn without it. red = the protocol white slot.
    let reservationId: string | null = null;
    try {
      reservationId = await ctx.reserveLiveEngineSeat(
        engineId,
        engineSeat === 'red' ? 'white' : 'black',
      );
    } catch {
      reservationId = null;
    }
    if (!reservationId) {
      writeJson(response, 503, { error: 'engine_unavailable' });
      return;
    }
    engine = { engineId, seat: engineSeat, reservationId, ...(botId ? { botId } : {}) };
  }
  if (ctx.databaseRequired && !persistence.isInitialized()) {
    writeJson(response, 503, { error: 'persistence_disabled' });
    return;
  }
  if (ctx.isDraining()) {
    writeJson(response, 503, { error: 'server_draining', restartAt: ctx.drainDeadlineMs() });
    return;
  }

  const created = await ctx.createDarkMiniXiangqiRoom(
    timeControl ?? undefined,
    preferredColor,
    engine,
    rated,
  );
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
    mode,
    gameSpecId: created.room.gameSpecId,
    rated: created.room.rated,
    region: 'global',
    ...(timeControl ? { timeControl } : {}),
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

export function darkMiniXiangqiPveHumanColor(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte = randomBytes(1)[0]!,
): 'red' | 'black' {
  if (preferredColor === 'black') return 'black';
  if (preferredColor === 'random') return randomByte < 128 ? 'red' : 'black';
  return 'red';
}
