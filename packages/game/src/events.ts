import {
  createChess960CastlingRights,
  createChess960CastlingRightsForSides,
  createChess960InitialBoard,
  createChess960InitialBoardForSides,
  type Chess960Start,
} from './chess960.js';
import { advanceClock, createClock, expireClock } from './clocks.js';
import type { ClockState, Color, GameState, Move, VariantId } from './types.js';
import { variantForId } from './variants.js';

export type RoomTimeControl = {
  initialMs: number;
  incrementMs: number;
};

export type BidResolution = {
  bids: Record<Color, number>;
  blackSeat: Color;
  winner: Color | null;
  whiteSeat: Color;
  winningBidMs: number;
};

export type GameEvent =
  | {
    type: 'room-created';
    at: number;
    roomId: string;
    variant: VariantId;
    offer: Chess960Start[];
    offers?: Partial<Record<Color, Chess960Start[]>>;
    timeControl?: RoomTimeControl;
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
    type: 'bid-submitted';
    at: number;
    roomId: string;
    color: Color;
    bidMs: number;
  }
  | {
    type: 'bid-resolved';
    at: number;
    roomId: string;
    bids: Record<Color, number>;
    blackSeat: Color;
    clock?: ClockState;
    winner: Color | null;
    whiteSeat: Color;
    winningBidMs: number;
  }
  | {
    type: 'move-played';
    at: number;
    roomId: string;
    color: Color;
    move: Move;
    clock?: ClockState;
    thinkTimeMs?: number;
  }
  | {
    type: 'clock-expired';
    at: number;
    roomId: string;
    color: Color;
    clock: ClockState;
  };

export type GameProjection = {
  roomId: string;
  variant: VariantId;
  offer: Chess960Start[];
  offers: Partial<Record<Color, Chess960Start[]>>;
  state: GameState;
  seats: Partial<Record<Color, string>>;
  selections: Partial<Record<Color, number>>;
  bids: Partial<Record<Color, number>>;
  bidResolution: BidResolution | null;
  resolvedStartId: number | null;
  resolvedStartIds: Partial<Record<Color, number>>;
  timeControl?: RoomTimeControl;
};

export function initialGameProjection(roomId: string, variant: VariantId = 'draft960'): GameProjection {
  return {
    roomId,
    variant,
    offer: [],
    offers: {},
    state: variantForId(variant).createInitialState(roomId),
    seats: {},
    selections: {},
    bids: {},
    bidResolution: null,
    resolvedStartId: null,
    resolvedStartIds: {},
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
    return {
      ...projection,
      variant: event.variant,
      offer: event.offer,
      offers: event.offers ?? { white: event.offer, black: event.offer },
      timeControl: event.timeControl,
      state: event.variant === 'fog-of-war' && hasDraftOffer(event)
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
    const beforeFirstMove = projection.state.moveNumber === 1 && projection.state.lastMove === undefined;
    if (
      (projection.state.status.type !== 'pregame' && !beforeFirstMove)
      || projection.seats[event.seat] !== event.clientId
    ) {
      return projection;
    }

    const seats = { ...projection.seats };
    const selections = { ...projection.selections };
    const bids = { ...projection.bids };
    delete seats[event.seat];
    delete selections[event.seat];
    delete bids[event.seat];

    return {
      ...projection,
      bids,
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
    if (!offerForColor(projection, event.color).some((start) => start.id === event.startId)) return projection;
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

    const startIds = event.startIds ?? (
      event.startId === undefined
        ? undefined
        : { white: event.startId, black: event.startId }
    );
    if (!startIds) return projection;

    const whiteStart = offerForColor(projection, 'white').find((start) => start.id === startIds.white);
    const blackStart = offerForColor(projection, 'black').find((start) => start.id === startIds.black);
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

  if (event.type === 'bid-submitted') {
    if (projection.variant !== 'bid-for-white') return projection;
    if (projection.state.status.type !== 'pregame') return projection;
    if (event.bidMs < 0) return projection;

    return {
      ...projection,
      bids: {
        ...projection.bids,
        [event.color]: event.bidMs,
      },
    };
  }

  if (event.type === 'bid-resolved') {
    if (projection.variant !== 'bid-for-white') return projection;
    if (projection.state.status.type !== 'pregame') return projection;

    const whiteClientId = projection.seats[event.whiteSeat];
    const blackClientId = projection.seats[event.blackSeat];
    if (!whiteClientId || !blackClientId) return projection;

    const startedState = variantForId('bid-for-white').createInitialState(event.roomId);
    return {
      ...projection,
      bids: event.bids,
      bidResolution: {
        bids: event.bids,
        blackSeat: event.blackSeat,
        winner: event.winner,
        whiteSeat: event.whiteSeat,
        winningBidMs: event.winningBidMs,
      },
      seats: {
        white: whiteClientId,
        black: blackClientId,
      },
      state: {
        ...startedState,
        status: { type: 'playing', turn: 'white' },
        clock: event.clock ?? createBidClock(event.at, event.winningBidMs),
      },
    };
  }

  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;

    const nextState = variantForId(projection.variant).applyMove(projection.state, event.move);
    if (nextState === projection.state) return projection;

    return {
      ...projection,
      state: {
        ...nextState,
        clock: event.clock ?? advanceClock(projection.state.clock, event.at, event.color, nextState.status),
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

  return projection;
}

function offerForColor(projection: GameProjection, color: Color): Chess960Start[] {
  return projection.offers[color] ?? projection.offer;
}

function hasDraftOffer(event: Extract<GameEvent, { type: 'room-created' }>): boolean {
  return event.offer.length > 0
    || !!event.offers?.white?.length
    || !!event.offers?.black?.length;
}

function createBidClock(at: number, winningBidMs: number): ClockState {
  const clock = createClock(at);
  return {
    ...clock,
    remainingMs: {
      ...clock.remainingMs,
      white: Math.max(0, clock.remainingMs.white - winningBidMs),
    },
  };
}
