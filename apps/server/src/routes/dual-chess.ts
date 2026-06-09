import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DUAL_CHESS_SPEC_ID,
  type DualChessColor,
  type DualChessGameState,
  type DualChessMove,
  type DualChessPlayerView,
  getDualChessOpenView,
  oppositeDualChessColor,
} from '@mistboard/game';
import { dualChessEngineMove } from '../dual-chess-engine.js';
import {
  applyDualChessEvent,
  type DualChessEvent,
  type DualChessProjection,
  isDualChessEventLog,
  replayDualChessEvents,
} from '../dual-chess-runtime.js';
import { dualChessEnabled } from '../feature-flags.js';
import * as persistence from '../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

// Strict UCI shape for a 6x8 board (files a-f, ranks 1-8, optional Queen promo).
// Anything else is rejected before it can reach the engine's stdin.
const UCI_MOVE = /^[a-f][1-8][a-f][1-8]q?$/;
const MAX_MOVES = 400;

type DualChessPostgameViewKey = DualChessColor | 'truth';
type DualChessPostgameViews = Partial<Record<DualChessPostgameViewKey, DualChessPlayerView>>;
type DualChessPostgameSnapshot = {
  ply: number;
  view: DualChessPlayerView;
};
type DualChessPostgameHistory = Partial<
  Record<DualChessPostgameViewKey, DualChessPostgameSnapshot[]>
>;

type DualChessPostgameMove = {
  type: 'move-played';
  at: number;
  color: DualChessColor;
  move: DualChessMove;
  ply: number;
};

type DualChessPostgameTerminal =
  | { type: 'seat-resigned'; at: number; color: DualChessColor; winner: DualChessColor }
  | { type: 'seat-forfeited'; at: number; color: DualChessColor; winner: DualChessColor }
  | { type: 'clock-expired'; at: number; color: DualChessColor; winner: DualChessColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type DualChessPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DualChessEvent[] | null>;
};

const defaultPersistence: DualChessPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DualChessEvent>(roomId),
};

// POST /api/dual-chess/engine-move  { moves: string[], movetime?: number }
//   -> { move: string | null }   (Fairy-Stockfish best move for the open mode)
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dual-chess\/games\/([^/]+)$/);
  if (postgameMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!dualChessEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (!requirePersistence(response)) return true;

    const roomId = decodeURIComponent(postgameMatch[1]!);
    const payload = await dualChessPostgameForApi(roomId);
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, payload);
    return true;
  }

  if (pathname !== '/api/dual-chess/engine-move') return false;
  if (!requireMethod(request, response, 'POST')) return true;

  const body = await readJsonBody(request);
  const rawMoves = Array.isArray(body.moves) ? body.moves : [];
  if (rawMoves.length > MAX_MOVES) {
    writeJson(response, 400, { error: 'too_many_moves' });
    return true;
  }
  const moves: string[] = [];
  for (const move of rawMoves) {
    if (typeof move !== 'string' || !UCI_MOVE.test(move)) {
      writeJson(response, 400, { error: 'invalid_move' });
      return true;
    }
    moves.push(move);
  }
  const movetime =
    typeof body.movetime === 'number' && body.movetime > 0 && body.movetime <= 5000
      ? Math.floor(body.movetime)
      : 500;
  const skill =
    typeof body.skill === 'number' && body.skill >= 0 && body.skill <= 20
      ? Math.floor(body.skill)
      : undefined;

  try {
    const move = await dualChessEngineMove(moves, { movetimeMs: movetime, skill });
    writeJson(response, 200, { move });
  } catch (err) {
    writeJson(response, 503, { error: 'engine_unavailable', detail: (err as Error).message });
  }
  return true;
}

export async function dualChessPostgameForApi(
  roomId: string,
  deps: DualChessPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DUAL_CHESS_SPEC_ID) return null;
  if (!events || !isDualChessEventLog(events, roomId)) return null;

  const projection = replayDualChessEvents(events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: {
      roomId: game.roomId,
      variant: game.variant,
      mode: game.mode,
      whiteName: postgameSeatDisplayName(game, 'white'),
      redName: postgameSeatDisplayName(game, 'red'),
      result: game.result,
      termination: game.termination,
      plyCount: game.plyCount,
      startedAt: game.startedAt.toISOString(),
      endedAt: game.endedAt.toISOString(),
      rated: game.rated,
      visibility: game.visibility,
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      progressClock: projection.state.progressClock,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: dualChessPostgameTimeline(events),
    view: getDualChessOpenView(projection.state, 'white'),
    views: dualChessPostgameViews(projection.state),
    history: dualChessPostgameHistory(events),
    clocks: dualChessPostgameClocks(events),
  };
}

function postgameSeatDisplayName(
  game: Awaited<ReturnType<DualChessPostgamePersistence['getGameSummary']>>,
  color: DualChessColor,
): string {
  const persistedName =
    participantDisplayName(game, color) ?? (color === 'white' ? game?.whiteName : null);
  if (!persistedName) return 'Guest';
  if (persistedName === (color === 'white' ? 'White' : 'Red')) return 'Guest';
  return persistedName;
}

function participantDisplayName(
  game: Awaited<ReturnType<DualChessPostgamePersistence['getGameSummary']>>,
  color: DualChessColor,
): string | null {
  return (
    game?.participants?.find((participant) => participant.color === color)?.displayName ?? null
  );
}

function dualChessPostgameViews(state: DualChessGameState): DualChessPostgameViews {
  return {
    white: getDualChessOpenView(state, 'white'),
    truth: getDualChessOpenView(state, 'white'),
    red: getDualChessOpenView(state, 'red'),
  };
}

function dualChessPostgameHistory(events: readonly DualChessEvent[]): DualChessPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayDualChessEvents([created]);
  let ply = 0;
  const history = postgameHistoryViews(projection, ply);

  for (const event of events.slice(1)) {
    projection = applyDualChessEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    appendPostgameHistoryViews(history, projection, ply);
  }
  return history;
}

function postgameHistoryViews(
  projection: DualChessProjection,
  ply: number,
): DualChessPostgameHistory {
  const history: DualChessPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply);
  return history;
}

function appendPostgameHistoryViews(
  history: DualChessPostgameHistory,
  projection: DualChessProjection,
  ply: number,
): void {
  history.white = [
    ...(history.white ?? []),
    { ply, view: getDualChessOpenView(projection.state, 'white') },
  ];
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: getDualChessOpenView(projection.state, 'white') },
  ];
  history.red = [
    ...(history.red ?? []),
    { ply, view: getDualChessOpenView(projection.state, 'red') },
  ];
}

function dualChessPostgameTimeline(
  events: readonly DualChessEvent[],
): Array<DualChessPostgameMove | DualChessPostgameTerminal> {
  const timeline: Array<DualChessPostgameMove | DualChessPostgameTerminal> = [];
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
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeDualChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeDualChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function dualChessPostgameClocks(
  events: readonly DualChessEvent[],
): Array<Record<DualChessColor, number>> {
  const created = events[0];
  if (!created || created.type !== 'room-created') return [];
  let projection = replayDualChessEvents([created]);
  const clocks: Array<Record<DualChessColor, number>> = [];
  const capture = (ply: number): void => {
    if (projection.clock) clocks[ply] = { ...projection.clock.remainingMs };
  };
  let ply = 0;
  capture(0);
  for (const event of events.slice(1)) {
    projection = applyDualChessEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    capture(ply);
  }
  return clocks;
}
