import {
  type Chess960Start,
  createChess960CastlingRights,
  createChess960CastlingRightsForSides,
  createChess960InitialBoard,
  createChess960InitialBoardForSides,
} from './chess960.js';
import {
  clockPolicyKindFor,
  createClock,
  expireClock,
  freezeClock,
  nextClockForMove,
  unfreezeClock,
} from './clocks.js';
import { type GameSpecId, gameSpecForLegacyLiveRoom, maybeGameSpecForId } from './game-specs.js';
import type {
  AbortReason,
  ClockState,
  Color,
  GameState,
  Move,
  PieceRole,
  VariantId,
} from './types.js';
import { variantForId } from './variants.js';

export type RoomTimeControl = {
  initialMs: number;
  incrementMs: number;
  // Correspondence: per-move allowance in days. Presence selects the
  // days-per-move clock policy (see clockPolicyKindFor); initialMs mirrors the
  // allowance in ms so the clock state shape is reused verbatim on the wire.
  daysPerMove?: number;
};

export type GameEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      variant: VariantId;
      gameSpecId?: GameSpecId;
      offer: Chess960Start[];
      offers?: Partial<Record<Color, Chess960Start[]>>;
      timeControl?: RoomTimeControl;
      // Live-game placement region. Optional for old events; new live rooms set
      // it so future multi-region routing can remain replay-derived.
      region?: string;
      // Whether this room was created as a rated request. Persisted so hydration
      // after a restart preserves it; the actual rated outcome is still
      // account-gated at game end (see room-manager buildGameSummary).
      rated?: boolean;
    }
  | {
      type: 'seat-assigned';
      at: number;
      roomId: string;
      clientId: string;
      seat: Color;
    }
  | {
      type: 'seat-vacated';
      at: number;
      roomId: string;
      clientId: string;
      seat: Color;
    }
  | {
      type: 'clock-started';
      at: number;
      roomId: string;
      clock: ClockState;
    }
  | {
      type: 'draft-start-selected';
      at: number;
      roomId: string;
      color: Color;
      startId: number;
    }
  | {
      type: 'draft-start-resolved';
      at: number;
      roomId: string;
      startId?: number;
      startIds?: Record<Color, number>;
      clock?: ClockState;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: Color;
      move: Move;
      capturedRole?: PieceRole;
      clock?: ClockState;
      thinkTimeMs?: number;
    }
  | {
      type: 'clock-expired';
      at: number;
      roomId: string;
      color: Color;
      clock: ClockState;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: Color;
      clock?: ClockState;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: ClockState;
    }
  | {
      type: 'seat-forfeited';
      at: number;
      roomId: string;
      color: Color;
      clock?: ClockState;
    }
  | {
      type: 'pause';
      at: number;
      roomId: string;
      reason: 'shutdown' | 'admin' | 'engine-error';
      clock?: ClockState;
    }
  | {
      type: 'resume';
      at: number;
      roomId: string;
      reason: 'both-present' | 'grace-elapsed' | 'admin';
      clock?: ClockState;
    };

export type GameProjection = {
  roomId: string;
  variant: VariantId;
  gameSpecId: GameSpecId;
  offer: Chess960Start[];
  offers: Partial<Record<Color, Chess960Start[]>>;
  state: GameState;
  seats: Partial<Record<Color, string>>;
  selections: Partial<Record<Color, number>>;
  resolvedStartId: number | null;
  resolvedStartIds: Partial<Record<Color, number>>;
  timeControl?: RoomTimeControl;
  region?: string;
  paused: boolean;
  pausedAt: number | null;
  pauseReason: 'shutdown' | 'admin' | 'engine-error' | null;
};

export function initialGameProjection(
  roomId: string,
  variant: VariantId = 'draft960',
): GameProjection {
  return {
    roomId,
    variant,
    gameSpecId: gameSpecForLegacyLiveRoom({ variant }).id,
    offer: [],
    offers: {},
    state: variantForId(variant).createInitialState(roomId),
    seats: {},
    selections: {},
    resolvedStartId: null,
    resolvedStartIds: {},
    paused: false,
    pausedAt: null,
    pauseReason: null,
  };
}

export function replayGameEvents(events: GameEvent[]): GameProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyGameEvent(projection, event),
    initialGameProjection(firstRoomId),
  );
}

export function applyGameEvent(projection: GameProjection, event: GameEvent): GameProjection {
  if (event.roomId !== projection.roomId) return projection;

  if (event.type === 'room-created') {
    const state = variantForId(event.variant).createInitialState(event.roomId);
    const gameSpecId = gameSpecIdForRoomCreatedEvent(event);
    return {
      ...projection,
      variant: event.variant,
      gameSpecId,
      offer: event.offer,
      offers: event.offers ?? { white: event.offer, black: event.offer },
      timeControl: event.timeControl,
      region: event.region,
      state:
        event.variant === 'dark-chess' && hasDraftOffer(event)
          ? { ...state, status: { type: 'pregame' } }
          : state,
    };
  }

  if (event.type === 'seat-assigned') {
    return {
      ...projection,
      seats: {
        ...projection.seats,
        [event.seat]: event.clientId,
      },
    };
  }

  if (event.type === 'seat-vacated') {
    const beforeFirstMove =
      projection.state.moveNumber === 1 && projection.state.lastMove === undefined;
    if (
      (projection.state.status.type !== 'pregame' && !beforeFirstMove) ||
      projection.seats[event.seat] !== event.clientId
    ) {
      return projection;
    }

    const seats = { ...projection.seats };
    const selections = { ...projection.selections };
    delete seats[event.seat];
    delete selections[event.seat];

    return {
      ...projection,
      seats,
      selections,
    };
  }

  if (event.type === 'clock-started') {
    if (projection.state.status.type !== 'playing' || projection.state.clock) return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        clock: event.clock,
      },
    };
  }

  if (event.type === 'draft-start-selected') {
    if (projection.state.status.type !== 'pregame') return projection;
    if (!offerForColor(projection, event.color).some((start) => start.id === event.startId))
      return projection;
    return {
      ...projection,
      selections: {
        ...projection.selections,
        [event.color]: event.startId,
      },
    };
  }

  if (event.type === 'draft-start-resolved') {
    if (projection.state.status.type !== 'pregame') return projection;

    const startIds =
      event.startIds ??
      (event.startId === undefined ? undefined : { white: event.startId, black: event.startId });
    if (!startIds) return projection;

    const whiteStart = offerForColor(projection, 'white').find(
      (start) => start.id === startIds.white,
    );
    const blackStart = offerForColor(projection, 'black').find(
      (start) => start.id === startIds.black,
    );
    if (!whiteStart || !blackStart) return projection;
    const sharedStartId = startIds.white === startIds.black ? startIds.white : null;

    return {
      ...projection,
      resolvedStartId: sharedStartId,
      resolvedStartIds: startIds,
      state: {
        ...projection.state,
        board: event.startIds
          ? createChess960InitialBoardForSides(whiteStart, blackStart)
          : createChess960InitialBoard(whiteStart),
        status: { type: 'playing', turn: 'white' },
        castlingRights: event.startIds
          ? createChess960CastlingRightsForSides(whiteStart, blackStart)
          : createChess960CastlingRights(whiteStart),
        enPassantSquare: undefined,
        halfmoveClock: 0,
        lastMove: undefined,
        clock: event.clock ?? createClock(event.at),
      },
    };
  }

  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;

    const prevMoveNumber = projection.state.moveNumber;
    const nextState = variantForId(projection.variant).applyMove(projection.state, event.move);
    if (nextState === projection.state) return projection;

    const nextClock = nextClockForMove(
      projection.state.clock,
      event.at,
      event.color,
      prevMoveNumber,
      nextState.status,
      clockPolicyKindFor(projection.timeControl),
    );

    return {
      ...projection,
      state: {
        ...nextState,
        clock: event.clock ?? nextClock,
      },
    };
  }

  if (event.type === 'clock-expired') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;

    return {
      ...projection,
      state: {
        ...projection.state,
        clock: event.clock ?? expireClock(projection.state.clock, event.at, event.color),
        status: {
          type: 'finished',
          winner: event.color === 'white' ? 'black' : 'white',
          reason: 'timeout',
        },
      },
    };
  }

  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: event.color === 'white' ? 'black' : 'white',
          reason: 'resignation',
        },
        clock: event.clock ?? freezeClock(projection.state.clock, event.at),
      },
    };
  }

  if (event.type === 'seat-forfeited') {
    // The player of `color` abandoned an in-progress game; the opponent wins.
    // Distinct from resignation only in reason ('abandonment') so PGN/analytics
    // can tell a deliberate resign from a disconnect forfeit.
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: event.color === 'white' ? 'black' : 'white',
          reason: 'abandonment',
        },
        clock: event.clock ?? freezeClock(projection.state.clock, event.at),
      },
    };
  }

  if (event.type === 'game-aborted') {
    // Abort is only valid before both players have completed their first move
    // (fewer than two plies; moveNumber increments to 2 on black's first move).
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.moveNumber !== 1) return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        status: { type: 'aborted', reason: event.reason },
        clock: event.clock ?? freezeClock(projection.state.clock, event.at),
      },
    };
  }

  if (event.type === 'pause') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.paused) return projection;
    return {
      ...projection,
      paused: true,
      pausedAt: event.at,
      pauseReason: event.reason,
      state: {
        ...projection.state,
        clock: event.clock ?? freezeClock(projection.state.clock, event.at),
      },
    };
  }

  if (event.type === 'resume') {
    if (!projection.paused) return projection;
    if (projection.state.status.type !== 'playing') return projection;
    const turn = projection.state.status.turn;
    // Don't arm a clock that never started ticking. Before both players have
    // completed their first move (moveNumber < 2) the clock is frozen-pregame,
    // which is indistinguishable from a pause-frozen clock; resuming must leave
    // it frozen rather than start the side-to-move's clock prematurely.
    const resumedClock =
      projection.state.moveNumber >= 2
        ? unfreezeClock(projection.state.clock, event.at, turn)
        : projection.state.clock;
    return {
      ...projection,
      paused: false,
      pausedAt: null,
      pauseReason: null,
      state: {
        ...projection.state,
        clock: event.clock ?? resumedClock,
      },
    };
  }

  return projection;
}

function offerForColor(projection: GameProjection, color: Color): Chess960Start[] {
  return projection.offers[color] ?? projection.offer;
}

function gameSpecIdForRoomCreatedEvent(
  event: Extract<GameEvent, { type: 'room-created' }>,
): GameSpecId {
  return (
    maybeGameSpecForId(event.gameSpecId)?.id ??
    gameSpecForLegacyLiveRoom({
      variant: event.variant,
      hiddenDraft960: hasDraftOffer(event),
    }).id
  );
}

function hasDraftOffer(event: Extract<GameEvent, { type: 'room-created' }>): boolean {
  return event.offer.length > 0 || !!event.offers?.white?.length || !!event.offers?.black?.length;
}
