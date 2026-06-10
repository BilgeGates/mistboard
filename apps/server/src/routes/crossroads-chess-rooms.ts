import type { ServerResponse } from 'node:http';
import { CROSSROADS_CHESS_SPEC_ID, maybeGameSpecForId } from '@mistboard/game';
import { crossroadsChessEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import type { HttpApiContext } from './lib.js';
import { parseRoomTimeControl, writeJson } from './lib.js';

export function requestsCrossroadsChess(body: Record<string, unknown>): boolean {
  return (
    typeof body.gameSpecId === 'string' &&
    maybeGameSpecForId(body.gameSpecId)?.id === CROSSROADS_CHESS_SPEC_ID
  );
}

// Create a perfect-information Crossroads Chess live room. PvP only (no in-room engine),
// flag-gated, not rated.
export async function handleCrossroadsChessCreate(
  ctx: HttpApiContext,
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  if (!crossroadsChessEnabled()) {
    writeJson(response, 404, { error: 'crossroads_chess_disabled' });
    return;
  }
  if (body.mode !== 'pvp' || body.rated === true) {
    writeJson(response, 501, { error: 'crossroads_chess_unsupported_surface' });
    return;
  }
  const preferredColor = parseCrossroadsChessPreferredColor(body.preferredColor);
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

  const created = await ctx.createCrossroadsChessRoom(timeControl ?? undefined, preferredColor);
  if (!created.ok) {
    const status =
      created.error === 'crossroads_chess_disabled'
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

function parseCrossroadsChessPreferredColor(
  value: unknown,
): 'white' | 'red' | 'random' | undefined {
  if (value === 'white' || value === 'red' || value === 'random') return value;
  return undefined;
}
