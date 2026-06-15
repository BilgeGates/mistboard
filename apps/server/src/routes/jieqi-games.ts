import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getJieqiPlayerView,
  JIEQI_SPEC_ID,
  type JieqiColor,
  type JieqiGameState,
  type JieqiPlayerView,
  jieqiTruthView,
  oppositeJieqiColor,
} from '@mistboard/game';
import { jieqiEnabled } from './../feature-flags.js';
import type { JieqiEvent, JieqiProjection } from './../jieqi-runtime.js';
import { jieqiTenant } from './../jieqi-tenant.js';
import * as persistence from './../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type JieqiPostgameViewKey = JieqiColor | 'truth';

type JieqiPostgameViews = Partial<Record<JieqiPostgameViewKey, JieqiPlayerView>>;
type JieqiPostgameSnapshot = {
  ply: number;
  view: JieqiPlayerView;
};
type JieqiPostgameHistory = Partial<Record<JieqiPostgameViewKey, JieqiPostgameSnapshot[]>>;

type JieqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: JieqiColor;
  move: { from: string; to: string };
  ply: number;
};

type JieqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'seat-resigned'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'seat-forfeited'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database, mirroring
// the Dark Mini Xiangqi route.
export type JieqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<JieqiEvent[] | null>;
};

const defaultPersistence: JieqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<JieqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/jieqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!jieqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await jieqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function jieqiPostgameForApi(
  roomId: string,
  deps: JieqiPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== JIEQI_SPEC_ID) return null;
  if (!events || !isTenantEventLog(jieqiTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here. Redaction happens below per view.
  const projection = replayTenantEvents(jieqiTenant, events);
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
    timeline: jieqiPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    view: jieqiTruthView(projection.state),
    // Per-color views reuse the EXISTING leak-safe redaction: the opponent's
    // face-down pieces stay faceDown, and captured dark pieces the viewer did
    // not take carry role:null. No hand-rolled masking.
    views: jieqiPostgameViews(projection.state),
    history: jieqiPostgameHistory(events),
  };
}

function jieqiPostgameViews(state: JieqiGameState): JieqiPostgameViews {
  return {
    red: getJieqiPlayerView(state, 'red'),
    truth: jieqiTruthView(state),
    black: getJieqiPlayerView(state, 'black'),
  };
}

function jieqiPostgameHistory(events: readonly JieqiEvent[]): JieqiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayTenantEvents(jieqiTenant, [created]);
  let ply = 0;
  const history = postgameHistoryViews(projection, ply);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(jieqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    appendPostgameHistoryViews(history, projection, ply);
  }
  return history;
}

function postgameHistoryViews(projection: JieqiProjection, ply: number): JieqiPostgameHistory {
  const history: JieqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply);
  return history;
}

function appendPostgameHistoryViews(
  history: JieqiPostgameHistory,
  projection: JieqiProjection,
  ply: number,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: jieqiTruthView(projection.state) }];
  for (const color of ['red', 'black'] as const) {
    const view = getJieqiPlayerView(projection.state, color);
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function jieqiPostgameTimeline(
  events: readonly JieqiEvent[],
): Array<JieqiPostgameMove | JieqiPostgameTerminal> {
  const timeline: Array<JieqiPostgameMove | JieqiPostgameTerminal> = [];
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
        winner: oppositeJieqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeJieqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
