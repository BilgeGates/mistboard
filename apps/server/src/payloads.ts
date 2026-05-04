import {
  variantForId,
  type BidResolution,
  type Color,
  type GameEvent,
  type GameProjection,
  type PlayerView,
  type Square,
} from '@bichess/game';

export type Seat = Color | 'spectator';

export type SnapshotClient = {
  id: string;
  seat: Seat;
  solo: boolean;
};

export type SnapshotRoom = {
  id: string;
  clients: { size: number };
  events: GameEvent[];
  projection: GameProjection;
};

export function snapshotPayload(room: SnapshotRoom, client: SnapshotClient) {
  return {
    type: 'snapshot',
    roomId: room.id,
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    seats: room.projection.seats,
    selections: room.projection.selections,
    bids: bidsForClient(room, client),
    bidResolution: bidResolutionForClient(room),
    resolvedStartId: room.projection.resolvedStartId,
    events: eventsForClient(room),
    state: getClientView(room, client),
  };
}

export function eventsForClient(room: SnapshotRoom): GameEvent[] {
  if (room.projection.variant === 'bid-for-white' && room.projection.state.status.type === 'pregame') {
    return room.events.filter((event) => event.type !== 'bid-submitted' && event.type !== 'bid-resolved');
  }
  if (room.projection.variant !== 'fog-of-war') return room.events;
  if (room.projection.state.status.type === 'finished') return room.events;
  return room.events.filter((event) => event.type !== 'move-played');
}

function bidsForClient(room: SnapshotRoom, client: SnapshotClient): Partial<Record<Color, number>> {
  if (room.projection.variant !== 'bid-for-white') return {};
  if (room.projection.state.status.type !== 'pregame') return room.projection.bids;
  if (client.seat === 'spectator') return {};

  const bid = room.projection.bids[client.seat];
  return bid === undefined ? {} : { [client.seat]: bid };
}

function bidResolutionForClient(room: SnapshotRoom): BidResolution | null {
  if (room.projection.variant !== 'bid-for-white') return null;
  if (room.projection.state.status.type === 'pregame') return null;
  return room.projection.bidResolution;
}

export function getClientView(room: SnapshotRoom, client: SnapshotClient): PlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'white';
  if (room.projection.variant === 'fog-of-war' && room.projection.state.status.type === 'finished') {
    return fullTruthView(room, perspective);
  }
  if (room.projection.variant === 'fog-of-war' && client.seat === 'spectator') {
    return publicFogView(room, perspective);
  }

  const variant = variantForId(room.projection.variant);
  const view = variant.getPlayerView(room.projection.state, perspective);
  if (!client.solo || room.projection.state.status.type !== 'playing') return view;
  return {
    ...view,
    legalMoves: variant.getLegalMoves(room.projection.state, room.projection.state.status.turn),
  };
}

function publicFogView(room: SnapshotRoom, perspective: Color): PlayerView {
  return {
    id: room.projection.state.id,
    variant: room.projection.state.variant,
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: room.projection.state.status,
    perspective,
    moveNumber: room.projection.state.moveNumber,
    clock: room.projection.state.clock,
  };
}

function fullTruthView(room: SnapshotRoom, perspective: Color): PlayerView {
  return {
    id: room.projection.state.id,
    variant: room.projection.state.variant,
    board: room.projection.state.board,
    visibleSquares: Object.keys(room.projection.state.board) as Square[],
    legalMoves: [],
    status: room.projection.state.status,
    perspective,
    moveNumber: room.projection.state.moveNumber,
    lastMove: room.projection.state.lastMove,
    clock: room.projection.state.clock,
  };
}
