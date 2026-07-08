import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getJungleFlipPlayerView,
  JUNGLE_FLIP_SPEC_ID,
  type JungleFlipPlayerView,
  type JungleFlipSeat,
  jungleFlipTruthView,
  oppositeJungleFlipSeat,
} from '@mistboard/game';
import { jungleFlipEnabled } from './../feature-flags.js';
import type { JungleFlipEvent } from './../jungle-flip-runtime.js';
import { jungleFlipTenant } from './../jungle-flip-tenant.js';
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

// Flip Jungle postgame review. Flip Jungle is SYMMETRIC hidden-identity (the banqi
// pattern on 16 animals): a face-down tile is hidden from BOTH seats equally and the
// deal is the only secret, so the two masked per-seat views are identical. That
// collapses jieqi's per-seat split to a SINGLE masked review surface plus a spoiler
// overlay. The web postgame keys off `view` + `history.truth` (the as-played masked
// replay) and offers a Reveal toggle that swaps in `history.revealed`.

type JungleFlipPostgameSnapshot = {
  ply: number;
  view: JungleFlipPlayerView;
};

type JungleFlipPostgameMove = {
  type: 'move-played';
  at: number;
  color: JungleFlipSeat;
  move: { from: string; to: string };
  ply: number;
};

type JungleFlipPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: JungleFlipSeat; winner: JungleFlipSeat }
  | { type: 'seat-resigned'; at: number; color: JungleFlipSeat; winner: JungleFlipSeat }
  | { type: 'seat-forfeited'; at: number; color: JungleFlipSeat; winner: JungleFlipSeat }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type JungleFlipPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<JungleFlipEvent[] | null>;
};

const defaultPersistence: JungleFlipPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<JungleFlipEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/jungle-flip\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!jungleFlipEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await jungleFlipPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function jungleFlipPostgameForApi(
  roomId: string,
  deps: JungleFlipPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== JUNGLE_FLIP_SPEC_ID) return null;
  if (!events || !isTenantEventLog(jungleFlipTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here.
  const projection = replayTenantEvents(jungleFlipTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: jungleFlipPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    view: jungleFlipTruthView(projection.state),
    // Two per-ply histories: 'truth' is the AS-PLAYED masked replay (unflipped tiles
    // render face-down); 'revealed' is the spoiler overlay swapped in by the Reveal
    // toggle. The masked track uses an arbitrary seat ('red') — symmetric, so either
    // seat's mask yields the identical board.
    history: jungleFlipPostgameHistory(events),
  };
}

function jungleFlipPostgameHistory(events: readonly JungleFlipEvent[]): {
  truth: JungleFlipPostgameSnapshot[];
  revealed: JungleFlipPostgameSnapshot[];
} {
  const created = events[0];
  if (!created || created.type !== 'room-created') return { truth: [], revealed: [] };
  let projection = replayTenantEvents(jungleFlipTenant, [created]);
  let ply = 0;
  const truth: JungleFlipPostgameSnapshot[] = [
    { ply, view: getJungleFlipPlayerView(projection.state, 'red') },
  ];
  const revealed: JungleFlipPostgameSnapshot[] = [
    { ply, view: jungleFlipTruthView(projection.state) },
  ];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(jungleFlipTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getJungleFlipPlayerView(projection.state, 'red') });
    revealed.push({ ply, view: jungleFlipTruthView(projection.state) });
  }
  return { truth, revealed };
}

function jungleFlipPostgameTimeline(
  events: readonly JungleFlipEvent[],
): Array<JungleFlipPostgameMove | JungleFlipPostgameTerminal> {
  const timeline: Array<JungleFlipPostgameMove | JungleFlipPostgameTerminal> = [];
  let ply = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      ply += 1;
      timeline.push({ type: event.type, at: event.at, color: event.color, move: event.move, ply });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeJungleFlipSeat(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeJungleFlipSeat(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
