/**
 * Dark Xiangqi (9x10, hidden/dev-only) VariantTenant — the P1 near-copy
 * migration of the Layer-3 tenant contract.
 *
 * Dark Xiangqi policy that lives here: per-seat event redaction (only
 * move-played is redacted; non-move events flow to both seats AND spectators,
 * unlike DMX), the shrouded-piece wire board ({color, shrouded: true} entries
 * so hidden piece identity never reaches the wire), the spectator empty view,
 * lastMove stripping, seat-vacated acceptance in event logs, and the legacy
 * GameSummary shape (no time-control fields; guests named by color). The
 * snapshot has NO extras — it is exactly the tenant core payload.
 */

import {
  type AbortReason,
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  DARK_XIANGQI_SPEC_ID,
  getPlayerView as getXiangqiPlayerView,
  isLegalMove as isXiangqiLegalMove,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import { darkXiangqiEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const DARK_XIANGQI_ROOM_ID_PREFIX = 'dxq_';

type DarkXiangqiSpecId = typeof DARK_XIANGQI_SPEC_ID;

type DarkXiangqiWireBoardEntry =
  | { piece: XiangqiPiece; shrouded: false }
  | { color: XiangqiColor; shrouded: true };

export type DarkXiangqiWirePlayerView = Omit<XiangqiPlayerView, 'board'> & {
  board: Partial<Record<XiangqiSquare, DarkXiangqiWireBoardEntry>>;
};

export type DarkXiangqiTenant = VariantTenant<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiWirePlayerView,
  DarkXiangqiSpecId
>;

type DarkXiangqiTenantRoom = TenantRuntimeRoom<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiSpecId
>;

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}

function isXiangqiMove(value: unknown): value is XiangqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Partial<Record<keyof XiangqiMove, unknown>>;
  return typeof move.from === 'string' && typeof move.to === 'string';
}

// Fog rule: only move-played is per-seat (own moves only); every other event
// flows to both seats and spectators. Looser than DMX by design — pinned by
// the dxq golden wire fixture.
export function darkXiangqiClientEventFor(
  event: TenantRoomEvent<XiangqiColor, XiangqiMove, DarkXiangqiSpecId>,
  seat: TenantSeat<XiangqiColor>,
  ply: number,
): TenantClientEvent<XiangqiColor, XiangqiMove, DarkXiangqiSpecId> | null {
  if (event.type !== 'move-played') return event;
  if (seat === 'spectator' || event.color !== seat) return null;
  return { ...event, ply };
}

export function getDarkXiangqiClientView(
  state: XiangqiGameState,
  client: TenantSnapshotClient<XiangqiColor>,
  latestVisibleMoveColor?: XiangqiColor,
): DarkXiangqiWirePlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  if (client.seat === 'spectator') return emptyDarkXiangqiView(state, perspective);
  const view = redactShroudedXiangqiView(getXiangqiPlayerView(state, perspective));
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

function latestVisibleXiangqiMoveColor(
  events: readonly TenantRoomEvent<XiangqiColor, XiangqiMove, DarkXiangqiSpecId>[],
  client: TenantSnapshotClient<XiangqiColor>,
): XiangqiColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
}

// Re-encode the rules-level view for the wire: shrouded entries carry only the
// occupying color, never piece identity.
function redactShroudedXiangqiView(view: XiangqiPlayerView): DarkXiangqiWirePlayerView {
  const board: DarkXiangqiWirePlayerView['board'] = {};
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    board[square as XiangqiSquare] = entry.shrouded
      ? { color: entry.piece.color, shrouded: true }
      : { piece: entry.piece, shrouded: false };
  }
  return { ...view, board };
}

function emptyDarkXiangqiView(
  state: XiangqiGameState,
  perspective: XiangqiColor,
): DarkXiangqiWirePlayerView {
  return {
    id: state.id,
    perspective,
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

// Legacy persisted-record shape, preserved exactly: no initialMs/incrementMs,
// guests display as their color name, always private casual PvP.
export function buildDarkXiangqiGameSummary(room: DarkXiangqiTenantRoom): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildDarkXiangqiGameSummary called on non-terminal state');
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  return {
    variant: DARK_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: darkXiangqiResult(status.winner),
    termination: status.reason as persistence.GameTermination,
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: null,
    blackClient: null,
    whiteName: null,
    blackName: null,
    corpusId: null,
    rated: false,
    visibility: 'private',
    participants: [darkXiangqiParticipant('red', room), darkXiangqiParticipant('black', room)],
  };
}

function darkXiangqiResult(winner: XiangqiColor | null): persistence.GameResult {
  if (winner === 'red') return 'red-wins';
  if (winner === 'black') return 'black-wins';
  return 'draw';
}

function darkXiangqiParticipant(
  color: XiangqiColor,
  room: DarkXiangqiTenantRoom,
): persistence.GameParticipant {
  const token = room.seatTokens[color];
  if (token?.userId) {
    return {
      color,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility: 'private',
    };
  }
  return {
    color,
    displayName: color === 'red' ? 'Red' : 'Black',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'private',
  };
}

export const darkXiangqiTenant: DarkXiangqiTenant = {
  kind: 'dark-xiangqi',
  gameSpecId: DARK_XIANGQI_SPEC_ID,
  roomIdPrefix: DARK_XIANGQI_ROOM_ID_PREFIX,
  colors: ['red', 'black'],
  enabled: darkXiangqiEnabled,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  rules: {
    createInitialState: createInitialXiangqiState,
    applyMove: applyXiangqiMove,
    isLegalMove: isXiangqiLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isXiangqiColor,
    isMove: isXiangqiMove,
    moveFromMessage: (message) => {
      if (typeof message.from !== 'string' || typeof message.to !== 'string') return null;
      return { from: message.from as XiangqiSquare, to: message.to as XiangqiSquare };
    },
  },
  visibility: {
    clientEventFor: darkXiangqiClientEventFor,
    viewForClient: (state, client, events) =>
      getDarkXiangqiClientView(state, client, latestVisibleXiangqiMoveColor(events, client)),
  },
  wire: {
    acceptsSeatVacated: true,
  },
  persistence: {
    resultForWinner: darkXiangqiResult,
    termination: (reason: string) => reason as persistence.GameTermination,
    buildGameSummary: buildDarkXiangqiGameSummary,
    logKindPrefix: 'dark_xiangqi',
    logLabel: 'Dark Xiangqi',
  },
};
