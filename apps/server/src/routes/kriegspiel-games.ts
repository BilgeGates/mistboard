import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type Color,
  KRIEGSPIEL_SPEC_ID,
  type KriegspielGameState,
  opponentOf,
  type Square,
} from '@mistboard/game';
import { kriegspielEnabled } from './../feature-flags.js';
import {
  applyKriegspielEvent,
  getKriegspielClientView,
  isKriegspielEventLog,
  type KriegspielEvent,
  type KriegspielProjection,
  type KriegspielWirePlayerView,
  replayKriegspielEvents,
} from './../kriegspiel-runtime.js';
import type { KriegspielWireMove } from './../kriegspiel-tenant.js';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type KriegspielPostgameViewKey = Color | 'truth';

type KriegspielPostgameViews = Partial<Record<KriegspielPostgameViewKey, KriegspielWirePlayerView>>;
type KriegspielPostgameSnapshot = { ply: number; view: KriegspielWirePlayerView };
type KriegspielPostgameHistory = Partial<
  Record<KriegspielPostgameViewKey, KriegspielPostgameSnapshot[]>
>;

type KriegspielPostgameMove = {
  type: 'move-played';
  at: number;
  color: Color;
  move: KriegspielWireMove;
  ply: number;
};

type KriegspielPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: Color; winner: Color }
  | { type: 'seat-resigned'; at: number; color: Color; winner: Color }
  | { type: 'seat-forfeited'; at: number; color: Color; winner: Color }
  | { type: 'game-aborted'; at: number; reason: string };

// The persistence slice the reveal builder needs, injected so the reveal-gate
// and masking are unit-testable without a live database.
export type KriegspielPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<KriegspielEvent[] | null>;
};

const livePersistence: KriegspielPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<KriegspielEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/kriegspiel\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!kriegspielEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await kriegspielPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function kriegspielPostgameForApi(
  roomId: string,
  deps: KriegspielPostgamePersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== KRIEGSPIEL_SPEC_ID) return null;
  if (!events || !isKriegspielEventLog(events, roomId)) return null;

  const projection = replayKriegspielEvents(events);
  // The reveal gate: only a FINISHED game exposes the truth board and the
  // opponent's hidden history. A live or aborted-mid-play room returns 404.
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestKriegspielMoveColor(events);
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
    timeline: kriegspielPostgameTimeline(events),
    view: kriegspielTruthView(projection.state),
    views: kriegspielPostgameViews(projection.state, latestMoveColor),
    history: kriegspielPostgameHistory(events),
  };
}

function kriegspielPostgameViews(
  state: KriegspielGameState,
  latestMoveColor?: Color,
): KriegspielPostgameViews {
  return {
    black: getKriegspielClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
    truth: kriegspielTruthView(state),
    white: getKriegspielClientView(
      state,
      { id: 'postgame-white', seat: 'white', solo: false },
      latestMoveColor,
    ),
  };
}

function kriegspielPostgameHistory(events: readonly KriegspielEvent[]): KriegspielPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayKriegspielEvents([created]);
  let ply = 0;
  let latestMoveColor: Color | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyKriegspielEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: KriegspielProjection,
  ply: number,
  latestMoveColor?: Color,
): KriegspielPostgameHistory {
  const history: KriegspielPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: KriegspielPostgameHistory,
  projection: KriegspielProjection,
  ply: number,
  latestMoveColor?: Color,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: kriegspielTruthView(projection.state) }];
  for (const color of ['black', 'white'] as const) {
    const view = getKriegspielClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function kriegspielPostgameTimeline(
  events: readonly KriegspielEvent[],
): Array<KriegspielPostgameMove | KriegspielPostgameTerminal> {
  const timeline: Array<KriegspielPostgameMove | KriegspielPostgameTerminal> = [];
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

function latestKriegspielMoveColor(events: readonly KriegspielEvent[]): Color | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

// The truth board: every piece revealed, every square visible. Only ever built
// for a finished game (the reveal gate above). Kriegspiel has no reserves, so
// pawnTries is 0 (postgame has no side to move).
function kriegspielTruthView(state: KriegspielGameState): KriegspielWirePlayerView {
  return {
    id: state.id,
    perspective: 'white',
    board: { ...state.board },
    visibleSquares: allKriegspielSquares(),
    legalMoves: [],
    pawnTries: 0,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allKriegspielSquares(): Square[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const squares: Square[] = [];
  for (let rank = 1; rank <= 8; rank += 1) {
    for (const file of files) {
      squares.push(`${file}${rank}` as Square);
    }
  }
  return squares;
}
