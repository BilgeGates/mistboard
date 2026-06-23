import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DARK_XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiSquare,
} from '@mistboard/game';
import { darkXiangqiRooms } from './../dark-xiangqi-registration.js';
import {
  applyDarkXiangqiEvent,
  type DarkXiangqiEvent,
  type DarkXiangqiProjection,
  type DarkXiangqiRuntimeRoom,
  type DarkXiangqiWirePlayerView,
  getDarkXiangqiClientView,
  isDarkXiangqiEventLog,
  replayDarkXiangqiEvents,
} from './../dark-xiangqi-runtime.js';
import { darkXiangqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { buildDarkXiangqiGameSummary } from './../server-dark-xiangqi-events.js';
import { type HttpApiContext, requireMethod, writeJson } from './lib.js';

type DarkXiangqiPostgameViewKey = XiangqiColor | 'truth';

type DarkXiangqiPostgameViews = Partial<
  Record<DarkXiangqiPostgameViewKey, DarkXiangqiWirePlayerView>
>;
type DarkXiangqiPostgameSnapshot = {
  ply: number;
  view: DarkXiangqiWirePlayerView;
};
type DarkXiangqiPostgameHistory = Partial<
  Record<DarkXiangqiPostgameViewKey, DarkXiangqiPostgameSnapshot[]>
>;

type DarkXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: XiangqiColor;
  move: { from: string; to: string };
  ply: number;
};

type DarkXiangqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'seat-resigned'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

export type DarkXiangqiPostgamePersistence = {
  getLiveRoom?(roomId: string): DarkXiangqiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<DarkXiangqiEvent[] | null>;
};

const livePersistence: DarkXiangqiPostgamePersistence = {
  getLiveRoom: (roomId) => darkXiangqiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkXiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkXiangqiPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkXiangqiPostgameForApi(
  roomId: string,
  deps: DarkXiangqiPostgamePersistence = livePersistence,
) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== DARK_XIANGQI_SPEC_ID) return null;
  if (events && !isDarkXiangqiEventLog(events, roomId)) return null;

  let source: { game: persistence.RecentEveGameRecord; events: readonly DarkXiangqiEvent[] } | null =
    game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = darkXiangqiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayDarkXiangqiEvents(source.events);
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkXiangqiMoveColor(source.events);
  return {
    game: {
      roomId: source.game.roomId,
      variant: source.game.variant,
      mode: source.game.mode,
      result: source.game.result,
      termination: source.game.termination,
      plyCount: source.game.plyCount,
      startedAt: source.game.startedAt.toISOString(),
      endedAt: source.game.endedAt.toISOString(),
      rated: source.game.rated,
      visibility: source.game.visibility,
      initialMs: source.game.initialMs,
      incrementMs: source.game.incrementMs,
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkXiangqiPostgameTimeline(source.events),
    view: darkXiangqiTruthView(projection.state),
    views: darkXiangqiPostgameViews(projection.state, latestMoveColor),
    history: darkXiangqiPostgameHistory(source.events),
  };
}

function darkXiangqiPostgameFromLiveRoom(
  roomId: string,
  room: DarkXiangqiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly DarkXiangqiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isDarkXiangqiEventLog(room.events, roomId)) return null;
  const summary = buildDarkXiangqiGameSummary(room);
  return {
    game: recentGameRecordFromSummary(room.id, summary),
    events: room.events,
  };
}

function recentGameRecordFromSummary(
  roomId: string,
  summary: persistence.GameSummary,
): persistence.RecentEveGameRecord {
  return {
    roomId,
    variant: summary.variant,
    mode: summary.mode ?? (summary.corpusId ? 'imported' : 'pvp'),
    result: summary.result,
    termination: summary.termination,
    plyCount: summary.plyCount,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    whiteName: summary.whiteName,
    blackName: summary.blackName,
    corpusId: summary.corpusId,
    rated: summary.rated ?? false,
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    initialMs: summary.initialMs ?? null,
    incrementMs: summary.incrementMs ?? null,
    visibility: summary.visibility ?? 'private',
    participants: summary.participants ?? [],
  };
}

function darkXiangqiPostgameViews(
  state: XiangqiGameState,
  latestMoveColor?: XiangqiColor,
): DarkXiangqiPostgameViews {
  return {
    red: getDarkXiangqiClientView(
      state,
      { id: 'postgame-red', seat: 'red', solo: false },
      latestMoveColor,
    ),
    truth: darkXiangqiTruthView(state),
    black: getDarkXiangqiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
  };
}

function darkXiangqiPostgameHistory(
  events: readonly DarkXiangqiEvent[],
): DarkXiangqiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayDarkXiangqiEvents([created]);
  let ply = 0;
  let latestMoveColor: XiangqiColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyDarkXiangqiEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkXiangqiProjection,
  ply: number,
  latestMoveColor?: XiangqiColor,
): DarkXiangqiPostgameHistory {
  const history: DarkXiangqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkXiangqiPostgameHistory,
  projection: DarkXiangqiProjection,
  ply: number,
  latestMoveColor?: XiangqiColor,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: darkXiangqiTruthView(projection.state) }];
  for (const color of ['red', 'black'] as const) {
    const view = getDarkXiangqiClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkXiangqiPostgameTimeline(
  events: readonly DarkXiangqiEvent[],
): Array<DarkXiangqiPostgameMove | DarkXiangqiPostgameTerminal> {
  const timeline: Array<DarkXiangqiPostgameMove | DarkXiangqiPostgameTerminal> = [];
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
        winner: oppositeXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkXiangqiMoveColor(events: readonly DarkXiangqiEvent[]): XiangqiColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

function darkXiangqiTruthView(state: XiangqiGameState): DarkXiangqiWirePlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as DarkXiangqiWirePlayerView['board'],
    visibleSquares: allXiangqiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allXiangqiSquares(): XiangqiSquare[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const squares: XiangqiSquare[] = [];
  for (let rank = 1; rank <= 10; rank += 1) {
    for (const file of files) {
      squares.push(`${file}${rank}` as XiangqiSquare);
    }
  }
  return squares;
}

function oppositeXiangqiColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}
