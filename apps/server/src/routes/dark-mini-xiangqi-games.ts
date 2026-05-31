import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { buildDarkMiniXiangqiPublicationJson } from './../dark-mini-xiangqi-export.js';
import {
  applyDarkMiniXiangqiEvent,
  type DarkMiniXiangqiEvent,
  type DarkMiniXiangqiProjection,
  getDarkMiniXiangqiClientView,
  isDarkMiniXiangqiEventLog,
  replayDarkMiniXiangqiEvents,
} from './../dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type DarkMiniXiangqiPostgameViewKey = MiniXiangqiColor | 'truth';

type DarkMiniXiangqiPostgameViews = Partial<
  Record<DarkMiniXiangqiPostgameViewKey, MiniXiangqiPlayerView>
>;
type DarkMiniXiangqiPostgameSnapshot = {
  ply: number;
  view: MiniXiangqiPlayerView;
};
type DarkMiniXiangqiPostgameHistory = Partial<
  Record<DarkMiniXiangqiPostgameViewKey, DarkMiniXiangqiPostgameSnapshot[]>
>;

type DarkMiniXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: MiniXiangqiColor;
  move: { from: string; to: string };
  ply: number;
};

type DarkMiniXiangqiPostgameTerminal =
  | { type: 'seat-resigned'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type DarkMiniXiangqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DarkMiniXiangqiEvent[] | null>;
};

const defaultPersistence: DarkMiniXiangqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkMiniXiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const exportMatch = pathname.match(/^\/api\/dark-mini-xiangqi\/games\/([^/]+)\/export\.json$/);
  if (exportMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!darkMiniXiangqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (!requirePersistence(response)) return true;
    const roomId = decodeURIComponent(exportMatch[1]!);
    const [game, events] = await Promise.all([
      persistence.getGameSummary(roomId),
      persistence.loadRoomEvents<DarkMiniXiangqiEvent>(roomId),
    ]);
    if (!game || game.variant !== DARK_MINI_XIANGQI_SPEC_ID || !events) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const payload = buildDarkMiniXiangqiPublicationJson(game, events);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `inline; filename="mistboard-${roomId}.json"`,
    });
    response.end(JSON.stringify(payload));
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/dark-mini-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkMiniXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkMiniXiangqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkMiniXiangqiPostgameForApi(
  roomId: string,
  deps: DarkMiniXiangqiPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DARK_MINI_XIANGQI_SPEC_ID) return null;
  if (!events || !isDarkMiniXiangqiEventLog(events, roomId)) return null;

  const projection = replayDarkMiniXiangqiEvents(events);
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkMiniXiangqiMoveColor(events);
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
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: darkMiniXiangqiPostgameTimeline(events),
    view: darkMiniXiangqiTruthView(projection.state),
    views: darkMiniXiangqiPostgameViews(projection.state, latestMoveColor),
    history: darkMiniXiangqiPostgameHistory(events),
  };
}

function darkMiniXiangqiPostgameViews(
  state: MiniXiangqiGameState,
  latestMoveColor?: MiniXiangqiColor,
): DarkMiniXiangqiPostgameViews {
  return {
    red: getDarkMiniXiangqiClientView(
      state,
      { id: 'postgame-red', seat: 'red', solo: false },
      latestMoveColor,
    ),
    truth: darkMiniXiangqiTruthView(state),
    black: getDarkMiniXiangqiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
  };
}

function darkMiniXiangqiPostgameHistory(
  events: readonly DarkMiniXiangqiEvent[],
): DarkMiniXiangqiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayDarkMiniXiangqiEvents([created]);
  let ply = 0;
  let latestMoveColor: MiniXiangqiColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyDarkMiniXiangqiEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkMiniXiangqiProjection,
  ply: number,
  latestMoveColor?: MiniXiangqiColor,
): DarkMiniXiangqiPostgameHistory {
  const history: DarkMiniXiangqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkMiniXiangqiPostgameHistory,
  projection: DarkMiniXiangqiProjection,
  ply: number,
  latestMoveColor?: MiniXiangqiColor,
): void {
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: darkMiniXiangqiTruthView(projection.state) },
  ];
  for (const color of ['red', 'black'] as const) {
    const view = getDarkMiniXiangqiClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkMiniXiangqiPostgameTimeline(
  events: readonly DarkMiniXiangqiEvent[],
): Array<DarkMiniXiangqiPostgameMove | DarkMiniXiangqiPostgameTerminal> {
  const timeline: Array<DarkMiniXiangqiPostgameMove | DarkMiniXiangqiPostgameTerminal> = [];
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
        winner: oppositeMiniXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkMiniXiangqiMoveColor(
  events: readonly DarkMiniXiangqiEvent[],
): MiniXiangqiColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

function darkMiniXiangqiTruthView(state: MiniXiangqiGameState): MiniXiangqiPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as MiniXiangqiPlayerView['board'],
    visibleSquares: allMiniXiangqiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allMiniXiangqiSquares(): MiniXiangqiSquare[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const squares: MiniXiangqiSquare[] = [];
  for (let rank = 1; rank <= 7; rank += 1) {
    for (const file of files) {
      squares.push(`${file}${rank}` as MiniXiangqiSquare);
    }
  }
  return squares;
}
