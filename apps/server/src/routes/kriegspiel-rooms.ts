import type { ServerResponse } from 'node:http';
import { KRIEGSPIEL_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { gateGameSpecRequest } from './../game-spec-request-gate.js';
import * as persistence from './../persistence.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

export type KriegspielCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createKriegspielRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'black' | 'white' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'kriegspiel_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

export function requestsKriegspiel(body: Record<string, unknown>): boolean {
  return body.gameSpecId === KRIEGSPIEL_SPEC_ID;
}

export async function handleKriegspielCreate(
  ctx: KriegspielCreateContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const gameSpecGate = gateGameSpecRequest({ gameSpecId: body.gameSpecId, variant: body.variant });
  if (body.gameSpecId !== KRIEGSPIEL_SPEC_ID) {
    if (gameSpecGate.type === 'reject') {
      writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
      return;
    }
    writeJson(response, 501, { error: 'kriegspiel_not_integrated' });
    return;
  }
  if (gameSpecGate.type === 'reject' && gameSpecGate.error === 'kriegspiel_disabled') {
    writeJson(response, gameSpecGate.httpStatus, { error: gameSpecGate.error });
    return;
  }
  const mode = parseKriegspielRoomMode(body);
  const preferredColor = parseKriegspielPreferredColor(body.preferredColor);
  const timeControl =
    body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
  if (body.timeControl !== undefined && !timeControl) {
    writeJson(response, 400, { error: 'invalid_time_control' });
    return;
  }
  if (mode !== 'pvp' || body.rated === true || body.engineId !== undefined) {
    writeJson(response, 501, { error: 'kriegspiel_unsupported_surface' });
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

  const created = await ctx.createKriegspielRoom(timeControl ?? undefined, preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'kriegspiel_disabled'
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

function parseKriegspielRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parseKriegspielPreferredColor(value: unknown): 'black' | 'white' | 'random' | undefined {
  if (value === 'black' || value === 'white' || value === 'random') return value;
  return undefined;
}
