import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import { playableLiveEngines } from './../engine-registry.js';
import { ratedEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import {
  type HttpApiContext,
  isPveAllowedTimeControl,
  parseHiddenDraft960,
  parseRoomTimeControl,
  parseVariantId,
  readJsonBody,
  requireMethod,
  writeJson,
} from './lib.js';

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/rooms') {
    if (!requireMethod(request, response, 'POST')) return true;
    const body = await readJsonBody(request);
    const mode = parseRoomMode(body);
    const variant = parseVariantId(typeof body.variant === 'string' ? body.variant : null);
    const hiddenDraft960 = parseHiddenDraft960(body.hiddenDraft960);
    const engineId = mode === 'pve' ? parsePlayablePveEngineId(body.engineId) : null;
    // preferredColor: caller's requested side. Three explicit values
    // ('white' | 'black' | 'random') OR omitted entirely:
    //   - 'white' / 'black' → deterministic. PvE pre-seats engine on the
    //     opposite side; PvP stores creatorPreference so first arrival
    //     gets the requested color and second arrival gets the other.
    //   - 'random' → coinflip. PvE picks engine seat at creation; PvP
    //     uses randomSeating on connect.
    //   - omitted → backward-compat. Legacy first-come-first-served:
    //     creator (first arrival) gets white, invitee gets black. PvE
    //     falls through to the legacy engineColor body field (still
    //     accepted for smoke scripts/bots).
    // Distinguishing omitted from explicit 'random' is load-bearing for
    // the documented backward-compat contract.
    const preferredColor: 'white' | 'black' | 'random' | undefined =
      body.preferredColor === 'white' ||
      body.preferredColor === 'black' ||
      body.preferredColor === 'random'
        ? body.preferredColor
        : undefined;
    let engineColor: 'white' | 'black';
    if (mode === 'pve') {
      if (preferredColor === 'white') engineColor = 'black';
      else if (preferredColor === 'black') engineColor = 'white';
      else if (preferredColor === 'random')
        engineColor = randomBytes(1)[0]! < 128 ? 'white' : 'black';
      else if (body.engineColor === 'white') engineColor = 'white';
      else if (body.engineColor === 'black') engineColor = 'black';
      else engineColor = randomBytes(1)[0]! < 128 ? 'white' : 'black';
    } else {
      engineColor = 'black';
    }
    const pvpRandomSeating = mode === 'pvp' && preferredColor === 'random';
    const pvpCreatorPreference: 'white' | 'black' | undefined =
      mode === 'pvp' && (preferredColor === 'white' || preferredColor === 'black')
        ? preferredColor
        : undefined;
    const timeControl =
      body.timeControl === undefined ? undefined : parseRoomTimeControl(body.timeControl);
    if (!mode) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_mode' }));
      return true;
    }
    // Engine games are never rated. Direct PvP room creation follows the same
    // launch + account gate as lobby matchmaking; game-end account binding is
    // still the authoritative final backstop.
    const rated =
      mode === 'pve'
        ? false
        : ratedEnabled() && body.rated !== false && (await currentAccountUser(request)) !== null;
    if (body.timeControl !== undefined && !timeControl) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_time_control' }));
      return true;
    }
    if (mode === 'pve' && body.engineId !== undefined && !engineId) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_engine' }));
      return true;
    }
    // PvE is scoped to 3+2 until the engine can hold its per-move budget at
    // shorter time controls (currently Tier1 p99 ~12s on Railway prod). UI
    // already disables non-3+2 presets for PvE; this is defense in depth
    // against direct API calls. PvP keeps the full preset range — humans
    // set their own pace.
    if (mode === 'pve' && timeControl && !isPveAllowedTimeControl(timeControl)) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'time_control_unsupported_for_pve' }));
      return true;
    }
    if (ctx.databaseRequired && !persistence.isInitialized()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'persistence_disabled' }));
      return true;
    }
    if (ctx.isDraining()) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'server_draining', restartAt: ctx.drainDeadlineMs() }));
      return true;
    }
    const room = await ctx.createRoom(
      mode,
      variant,
      engineId ?? ctx.pveBuiltinEngineClientId,
      hiddenDraft960,
      timeControl ?? undefined,
      rated,
      {
        engineColor,
        ...(pvpRandomSeating ? { randomSeating: true } : {}),
        ...(pvpCreatorPreference ? { creatorPreference: pvpCreatorPreference } : {}),
      },
    );
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        roomId: room.id,
        url: `/room/${encodeURIComponent(room.id)}`,
        mode: room.mode,
        gameSpecId: room.gameSpecId,
      }),
    );
    return true;
  }

  const abandonMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/abandon$/);
  if (abandonMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    const roomId = decodeURIComponent(abandonMatch[1]!);
    const body = await readJsonBody(request);
    const seatToken = typeof body.seatToken === 'string' ? body.seatToken : '';
    if (!seatToken) {
      writeJson(response, 400, { error: 'missing_seat_token' });
      return true;
    }
    const result = await ctx.abandonRoom(roomId, seatToken);
    if (result.ok) {
      writeJson(response, 200, { ok: true });
      return true;
    }
    const statusByError = { not_found: 404, unauthorized: 401, already_terminal: 409 } as const;
    writeJson(response, statusByError[result.error], { error: result.error });
    return true;
  }

  return false;
}

function parseRoomMode(body: Record<string, unknown>): 'pvp' | 'pve' | null {
  if (body.mode === 'pvp' || body.mode === 'pve') return body.mode;
  return null;
}

function parsePlayablePveEngineId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return playableLiveEngines().some((engine) => engine.id === value) ? value : null;
}
