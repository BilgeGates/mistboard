import type { IncomingMessage, ServerResponse } from 'node:http';
import { DARK_XIANGQI_SPEC_ID, type XiangqiColor, type XiangqiGameState } from '@mistboard/game';
import {
  applyDarkXiangqiEvent,
  type DarkXiangqiEvent,
  type DarkXiangqiProjection,
  type DarkXiangqiWirePlayerView,
  getDarkXiangqiClientView,
  isDarkXiangqiEventLog,
  replayDarkXiangqiEvents,
} from './../dark-xiangqi-runtime.js';
import { darkXiangqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type DarkXiangqiPostgameAccess = {
  seat: XiangqiColor | 'spectator';
};

type DarkXiangqiPostgameViews = Partial<
  Record<XiangqiColor | 'spectator', DarkXiangqiWirePlayerView>
>;
type DarkXiangqiPostgameSnapshot = {
  ply: number;
  view: DarkXiangqiWirePlayerView;
};
type DarkXiangqiPostgameHistory = Partial<
  Record<XiangqiColor | 'spectator', DarkXiangqiPostgameSnapshot[]>
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

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const access = await postgameAccessForRequest(roomId, parsedUrl);
  if (!access) {
    writeJson(response, 401, { error: 'invalid_seat_token' });
    return true;
  }
  const payload = await darkXiangqiPostgameForApi(roomId, access);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

async function postgameAccessForRequest(
  roomId: string,
  parsedUrl: URL,
): Promise<DarkXiangqiPostgameAccess | null> {
  const seatToken = parsedUrl.searchParams.get('seatToken');
  if (!seatToken) return { seat: 'spectator' };
  const verified = await persistence.verifyRoomSeatToken(roomId, seatToken);
  if (!verified || !isXiangqiSeat(verified.seat)) return null;
  return { seat: verified.seat };
}

async function darkXiangqiPostgameForApi(roomId: string, access: DarkXiangqiPostgameAccess) {
  const [game, events] = await Promise.all([
    persistence.getGameSummary(roomId),
    persistence.loadRoomEvents<DarkXiangqiEvent>(roomId),
  ]);
  if (!game || game.variant !== DARK_XIANGQI_SPEC_ID) return null;
  if (!events || !isDarkXiangqiEventLog(events, roomId)) return null;

  const projection = replayDarkXiangqiEvents(events);
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkXiangqiMoveColor(events);
  const view = getDarkXiangqiClientView(
    projection.state,
    { id: `postgame-${access.seat}`, seat: access.seat, solo: false },
    latestMoveColor,
  );
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
    access,
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkXiangqiPostgameTimeline(events, access.seat),
    view,
    views: darkXiangqiPostgameViews(projection.state, access.seat, latestMoveColor),
    history: darkXiangqiPostgameHistory(events, access.seat),
  };
}

function darkXiangqiPostgameViews(
  state: XiangqiGameState,
  seat: XiangqiColor | 'spectator',
  latestMoveColor?: XiangqiColor,
): DarkXiangqiPostgameViews {
  const spectator = getDarkXiangqiClientView(
    state,
    { id: 'postgame-spectator', seat: 'spectator', solo: false },
    latestMoveColor,
  );
  if (seat === 'spectator') return { spectator };
  return {
    red: getDarkXiangqiClientView(
      state,
      { id: 'postgame-red', seat: 'red', solo: false },
      latestMoveColor,
    ),
    spectator,
    black: getDarkXiangqiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
  };
}

function darkXiangqiPostgameHistory(
  events: readonly DarkXiangqiEvent[],
  seat: XiangqiColor | 'spectator',
): DarkXiangqiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayDarkXiangqiEvents([created]);
  let ply = 0;
  let latestMoveColor: XiangqiColor | undefined;
  const history = postgameHistoryViews(projection, seat, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyDarkXiangqiEvent(projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, seat, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkXiangqiProjection,
  seat: XiangqiColor | 'spectator',
  ply: number,
  latestMoveColor?: XiangqiColor,
): DarkXiangqiPostgameHistory {
  const history: DarkXiangqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, seat, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkXiangqiPostgameHistory,
  projection: DarkXiangqiProjection,
  seat: XiangqiColor | 'spectator',
  ply: number,
  latestMoveColor?: XiangqiColor,
): void {
  const spectator = getDarkXiangqiClientView(
    projection.state,
    { id: `postgame-history-spectator-${ply}`, seat: 'spectator', solo: false },
    latestMoveColor,
  );
  history.spectator = [...(history.spectator ?? []), { ply, view: spectator }];
  if (seat === 'spectator') return;
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
  seat: XiangqiColor | 'spectator',
): Array<DarkXiangqiPostgameMove | DarkXiangqiPostgameTerminal> {
  const timeline: Array<DarkXiangqiPostgameMove | DarkXiangqiPostgameTerminal> = [];
  let ply = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      ply += 1;
      if (event.color !== seat) continue;
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

function oppositeXiangqiColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

function isXiangqiSeat(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}
