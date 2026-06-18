import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DARK_SHOGI_SPEC_ID,
  opponentOf,
  type ShogiColor,
  type ShogiGameState,
  type ShogiMove,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import {
  applyDarkShogiEvent,
  type DarkShogiEvent,
  type DarkShogiProjection,
  type DarkShogiWirePlayerView,
  getDarkShogiClientView,
  isDarkShogiEventLog,
  replayDarkShogiEvents,
} from './../dark-shogi-runtime.js';
import { darkShogiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type DarkShogiPostgameViewKey = ShogiColor | 'truth';

type DarkShogiPostgameViews = Partial<Record<DarkShogiPostgameViewKey, DarkShogiWirePlayerView>>;
type DarkShogiPostgameSnapshot = { ply: number; view: DarkShogiWirePlayerView };
type DarkShogiPostgameHistory = Partial<
  Record<DarkShogiPostgameViewKey, DarkShogiPostgameSnapshot[]>
>;

type DarkShogiPostgameMove = {
  type: 'move-played';
  at: number;
  color: ShogiColor;
  move: ShogiMove;
  ply: number;
};

type DarkShogiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'seat-resigned'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'seat-forfeited'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// The persistence slice the reveal builder needs, injected so the reveal-gate
// and masking are unit-testable without a live database.
export type DarkShogiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DarkShogiEvent[] | null>;
};

const livePersistence: DarkShogiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkShogiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-shogi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkShogiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkShogiPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkShogiPostgameForApi(roomId: string, deps: DarkShogiPostgamePersistence) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DARK_SHOGI_SPEC_ID) return null;
  if (!events || !isDarkShogiEventLog(events, roomId)) return null;

  const projection = replayDarkShogiEvents(events);
  // The reveal gate: only a FINISHED game exposes the truth board and the
  // opponent's hidden history. A live or aborted-mid-play room returns 404.
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkShogiMoveColor(events);
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
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkShogiPostgameTimeline(events),
    view: darkShogiTruthView(projection.state),
    views: darkShogiPostgameViews(projection.state, latestMoveColor),
    history: darkShogiPostgameHistory(events),
  };
}

function darkShogiPostgameViews(
  state: ShogiGameState,
  latestMoveColor?: ShogiColor,
): DarkShogiPostgameViews {
  return {
    black: getDarkShogiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
    truth: darkShogiTruthView(state),
    white: getDarkShogiClientView(
      state,
      { id: 'postgame-white', seat: 'white', solo: false },
      latestMoveColor,
    ),
  };
}

function darkShogiPostgameHistory(events: readonly DarkShogiEvent[]): DarkShogiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayDarkShogiEvents([created]);
  let ply = 0;
  let latestMoveColor: ShogiColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyDarkShogiEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkShogiProjection,
  ply: number,
  latestMoveColor?: ShogiColor,
): DarkShogiPostgameHistory {
  const history: DarkShogiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkShogiPostgameHistory,
  projection: DarkShogiProjection,
  ply: number,
  latestMoveColor?: ShogiColor,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: darkShogiTruthView(projection.state) }];
  for (const color of ['black', 'white'] as const) {
    const view = getDarkShogiClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkShogiPostgameTimeline(
  events: readonly DarkShogiEvent[],
): Array<DarkShogiPostgameMove | DarkShogiPostgameTerminal> {
  const timeline: Array<DarkShogiPostgameMove | DarkShogiPostgameTerminal> = [];
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
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkShogiMoveColor(events: readonly DarkShogiEvent[]): ShogiColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

// The truth board: every piece revealed, every square visible. The reserves are
// carried on the per-color views (each side sees its own hand), so the truth
// view leaves `hand` empty — the postgame page reads both hands from views.black
// / views.white. Only ever built for a finished game (the reveal gate above).
function darkShogiTruthView(state: ShogiGameState): DarkShogiWirePlayerView {
  return {
    id: state.id,
    perspective: 'black',
    board: { ...state.board },
    hand: {},
    visibleSquares: allShogiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}
