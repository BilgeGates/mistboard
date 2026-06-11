import type { IncomingMessage, ServerResponse } from 'node:http';
import { recordRoomLifecycleAuditSafe } from './room-lifecycle-audit.js';
import { readJsonBody, writeJson } from './routes/lib.js';
import { clientIpForRateLimit, isDrainToken, isProductionLikeRuntime } from './server-policy.js';
import type { Room } from './server-types.js';
import { variantTenantActiveGameCount, variantTenantBroadcast } from './variant-tenant/registry.js';

export type DrainController = {
  activeGameCount(): number;
  drainDeadlineMs(): number | null;
  handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void>;
  isDraining(): boolean;
};

export type DrainControllerOptions = {
  drainWindowDefaultMs: number;
  drainWindowMaxMs: number;
  rooms: Map<string, Room>;
};

type DrainState = {
  restartAt: number | null;
};

const drainRateLimit = 10;
const drainRateWindowMs = 60_000;

export function createDrainController(options: DrainControllerOptions): DrainController {
  const drainState: DrainState = { restartAt: null };
  const drainRateBuckets = new Map<string, number[]>();

  function isDraining(): boolean {
    return drainState.restartAt !== null && drainState.restartAt > Date.now();
  }

  function drainDeadlineMs(): number | null {
    return isDraining() ? drainState.restartAt : null;
  }

  // Number of rooms with a live in-progress game (playing state, not paused),
  // across the chess map AND every registered variant tenant. Used by safe
  // deploys and /api/server-status to gate deploys behind a drain window;
  // counts trend to zero as games finish or get paused. Without the tenant
  // sum, a live DMX/Crossroads game is invisible to the gate and a deploy
  // can land mid-game.
  function activeGameCount(): number {
    let count = variantTenantActiveGameCount();
    for (const room of options.rooms.values()) {
      if (room.projection.state.status.type === 'playing' && !room.projection.paused) count += 1;
    }
    return count;
  }

  function drainRateAllowed(ip: string): boolean {
    const now = Date.now();
    const bucket = drainRateBuckets.get(ip) ?? [];
    const fresh = bucket.filter((t) => now - t < drainRateWindowMs);
    if (fresh.length >= drainRateLimit) {
      drainRateBuckets.set(ip, fresh);
      return false;
    }
    fresh.push(now);
    drainRateBuckets.set(ip, fresh);
    return true;
  }

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const ip = clientIpForRateLimit(request);
    if (!drainRateAllowed(ip)) {
      writeJson(response, 429, { error: 'rate_limited' });
      return;
    }
    // Token check: only validate in production-like runtimes so local dev
    // doesn't require setting MISTBOARD_DRAIN_TOKEN.
    if (isProductionLikeRuntime() && !isDrainToken(bearerToken(request))) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }

    if (pathname === '/admin/drain/cancel') {
      const wasActive = isDraining();
      const cancelledAt = Date.now();
      const restartAt = drainState.restartAt;
      drainState.restartAt = null;
      if (wasActive) broadcastDrainCancel(options.rooms);
      await recordRoomLifecycleAuditSafe({
        kind: 'drain_cancelled',
        atMs: cancelledAt,
        payload: {
          wasActive,
          restartAt,
          rooms: options.rooms.size,
          activeGames: activeGameCount(),
        },
      });
      console.log(JSON.stringify({ level: 'info', kind: 'drain_cancelled', at: cancelledAt }));
      writeJson(response, 200, { ok: true, draining: false });
      return;
    }

    // /admin/drain: idempotent activation. If already draining, return the
    // existing deadline rather than extending it.
    if (isDraining()) {
      writeJson(response, 200, {
        ok: true,
        draining: true,
        restartAt: drainState.restartAt,
        idempotent: true,
      });
      return;
    }

    const body = await readJsonBody(request);
    const requestedWindowMs =
      typeof body.windowMs === 'number'
        ? body.windowMs
        : typeof body.windowMinutes === 'number'
          ? body.windowMinutes * 60_000
          : options.drainWindowDefaultMs;
    if (!Number.isFinite(requestedWindowMs) || requestedWindowMs <= 0) {
      writeJson(response, 400, { error: 'invalid_window' });
      return;
    }
    const windowMs = Math.min(requestedWindowMs, options.drainWindowMaxMs);
    const activatedAt = Date.now();
    drainState.restartAt = activatedAt + windowMs;
    broadcastDrainSchedule(options.rooms, drainState.restartAt);
    await recordRoomLifecycleAuditSafe({
      kind: 'drain_activated',
      atMs: activatedAt,
      payload: {
        windowMs,
        restartAt: drainState.restartAt,
        requestedWindowMs,
        rooms: options.rooms.size,
        activeGames: activeGameCount(),
      },
    });
    console.log(
      JSON.stringify({
        level: 'info',
        kind: 'drain_activated',
        windowMs,
        restartAt: drainState.restartAt,
        at: activatedAt,
      }),
    );
    writeJson(response, 200, {
      ok: true,
      draining: true,
      restartAt: drainState.restartAt,
      idempotent: false,
    });
  }

  return {
    activeGameCount,
    drainDeadlineMs,
    handleRequest,
    isDraining,
  };
}

function bearerToken(request: IncomingMessage): string | undefined {
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
}

// Broadcast 'server_restart_scheduled' to every connected WS client — chess
// rooms and every registered variant tenant's rooms. Triggered on drain
// activation. Clients render a countdown banner from `restartAt`. Sending it
// as a stand-alone message (not inside a snapshot) avoids waking up every
// game's snapshot-broadcast path.
function broadcastDrainSchedule(rooms: Map<string, Room>, restartAt: number): void {
  const message = JSON.stringify({ type: 'server_restart_scheduled', restartAt });
  sendDrainMessage(rooms, message);
}

function broadcastDrainCancel(rooms: Map<string, Room>): void {
  sendDrainMessage(rooms, JSON.stringify({ type: 'server_restart_cancelled' }));
}

function sendDrainMessage(rooms: Map<string, Room>, message: string): void {
  for (const room of rooms.values()) {
    for (const client of room.clients) {
      try {
        client.socket.send(message);
      } catch {
        /* socket closed */
      }
    }
  }
  variantTenantBroadcast(message);
}
