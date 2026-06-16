import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BANQI_SPEC_ID,
  type BanqiPlayerView,
  type BanqiSeat,
  banqiTruthView,
  oppositeBanqiSeat,
} from '@mistboard/game';
import type { BanqiEvent } from './../banqi-runtime.js';
import { banqiTenant } from './../banqi-tenant.js';
import { banqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

// Banqi postgame review. Banqi is SYMMETRIC-information: a face-down tile is
// hidden from BOTH seats equally, and every capture is of an already-revealed
// (face-up) piece, so neither seat ever holds private knowledge the other lacks.
// That collapses jieqi's per-seat (red/black) split — the two masked views would
// be identical — to a SINGLE truth review surface. The web postgame keys off
// `view` + `history.truth` and renders one board with a working per-ply replay.

type BanqiPostgameSnapshot = {
  ply: number;
  view: BanqiPlayerView;
};

type BanqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: BanqiSeat;
  move: { from: string; to: string };
  ply: number;
};

type BanqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'seat-resigned'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'seat-forfeited'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database, mirroring
// the jieqi route.
export type BanqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<BanqiEvent[] | null>;
};

const defaultPersistence: BanqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<BanqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/banqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!banqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await banqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function banqiPostgameForApi(
  roomId: string,
  deps: BanqiPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== BANQI_SPEC_ID) return null;
  if (!events || !isTenantEventLog(banqiTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here. Banqi has no private capture
  // knowledge, so the truth view IS the review surface.
  const projection = replayTenantEvents(banqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: {
      roomId: game.roomId,
      variant: game.variant,
      mode: game.mode,
      result: game.result,
      termination: game.termination,
      plyCount: game.plyCount,
      startedAt: game.startedAt.toISOString(),
      endedAt: game.endedAt.toISOString(),
      rated: game.rated,
      visibility: game.visibility,
      initialMs: game.initialMs,
      incrementMs: game.incrementMs,
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: banqiPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    view: banqiTruthView(projection.state),
    // Single 'truth' history so the replay slider can step through every ply.
    history: { truth: banqiPostgameHistory(events) },
  };
}

function banqiPostgameHistory(events: readonly BanqiEvent[]): BanqiPostgameSnapshot[] {
  const created = events[0];
  if (!created || created.type !== 'room-created') return [];
  let projection = replayTenantEvents(banqiTenant, [created]);
  let ply = 0;
  const history: BanqiPostgameSnapshot[] = [{ ply, view: banqiTruthView(projection.state) }];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(banqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    history.push({ ply, view: banqiTruthView(projection.state) });
  }
  return history;
}

function banqiPostgameTimeline(
  events: readonly BanqiEvent[],
): Array<BanqiPostgameMove | BanqiPostgameTerminal> {
  const timeline: Array<BanqiPostgameMove | BanqiPostgameTerminal> = [];
  let ply = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      ply += 1;
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        move: event.move,
        ply,
      });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeBanqiSeat(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeBanqiSeat(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
