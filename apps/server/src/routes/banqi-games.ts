import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BANQI_SPEC_ID,
  type BanqiPlayerView,
  type BanqiSeat,
  banqiTruthView,
  getBanqiPlayerView,
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
import {
  type HttpApiContext,
  postgameGameSummary,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

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
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: banqiPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    // This is the final-position "here is the full deal" surface, used as a
    // fallback only — the replay below steps through the masked per-ply history.
    view: banqiTruthView(projection.state),
    // Two per-ply histories: 'truth' is the AS-PLAYED masked replay (unflipped
    // tiles render face-down, reproducing the game as it actually looked);
    // 'revealed' is the spoiler overlay (every face-down identity shown at every
    // ply) that the review's Reveal toggle swaps in. The watch surface only reads
    // the masked 'truth' history, so it never spoils the deal.
    history: banqiPostgameHistory(events),
  };
}

// Per-ply replay snapshots, built in two parallel tracks:
//
//   truth   — the MASKED player view: a tile not yet flipped at a given ply
//             renders face-down, so the replay reproduces the game as it was
//             actually played (tiles turning over one at a time) instead of
//             revealing the whole deal from move 0. Banqi is symmetric, so
//             either seat's mask yields the identical board; 'red' is arbitrary.
//   revealed — the full-truth view: every face-down identity shown at every ply,
//             the spoiler overlay the review's Reveal toggle swaps in.
//
// The misnomer is historical: 'truth' is the canonical as-played replay surface
// (the watch reads it), 'revealed' is the optional overlay.
function banqiPostgameHistory(events: readonly BanqiEvent[]): {
  truth: BanqiPostgameSnapshot[];
  revealed: BanqiPostgameSnapshot[];
} {
  const created = events[0];
  if (!created || created.type !== 'room-created') return { truth: [], revealed: [] };
  let projection = replayTenantEvents(banqiTenant, [created]);
  let ply = 0;
  const truth: BanqiPostgameSnapshot[] = [
    { ply, view: getBanqiPlayerView(projection.state, 'red') },
  ];
  const revealed: BanqiPostgameSnapshot[] = [{ ply, view: banqiTruthView(projection.state) }];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(banqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getBanqiPlayerView(projection.state, 'red') });
    revealed.push({ ply, view: banqiTruthView(projection.state) });
  }
  return { truth, revealed };
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
