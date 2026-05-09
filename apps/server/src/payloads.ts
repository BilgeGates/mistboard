import {
  variantForId,
  type BidResolution,
  type Color,
  type GameEvent,
  type GameProjection,
  type PlayerView,
  type Square,
} from '@bichess/game';
import {
  modeForProjection,
  publicLivePerspective,
  visibleEventsForLiveSnapshot,
  type GameAccessMode,
} from './server-policy.js';

export type Seat = Color | 'spectator';

export type SnapshotClient = {
  devViews: boolean;
  id: string;
  seat: Seat;
  solo: boolean;
};

export type SnapshotRoom = {
  id: string;
  clients: { size: number };
  events: GameEvent[];
  mode?: GameAccessMode;
  projection: GameProjection;
  pveEngineId?: string | null;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const allSquares = ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square));

export function snapshotPayload(room: SnapshotRoom, client: SnapshotClient) {
  const mode = room.mode ?? modeForProjection(room.projection);
  const normalizedRoom = room.mode === mode ? room : { ...room, mode };
  return {
    type: 'snapshot',
    roomId: room.id,
    mode,
    pveEngineId: mode === 'pve' ? room.pveEngineId ?? null : null,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    seats: room.projection.seats,
    selections: room.projection.selections,
    bids: bidsForClient(room, client),
    bidResolution: bidResolutionForClient(room),
    devViews: devViewsForClient(room, client),
    resolvedStartId: room.projection.resolvedStartId,
    events: eventsForClient(normalizedRoom),
    state: getClientView(normalizedRoom, client),
  };
}

export function eventsForClient(room: SnapshotRoom): GameEvent[] {
  if (room.projection.variant === 'bid-for-white' && room.projection.state.status.type === 'pregame') {
    return room.events.filter((event) => event.type !== 'bid-submitted' && event.type !== 'bid-resolved');
  }
  return visibleEventsForLiveSnapshot(room.events, room.projection, room.mode ?? modeForProjection(room.projection));
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

function devViewsForClient(room: SnapshotRoom, client: SnapshotClient) {
  if (!client.devViews || room.projection.variant !== 'fog-of-war') return null;

  const perspective = client.seat === 'black' ? 'black' : 'white';
  const opponent = perspective === 'white' ? 'black' : 'white';
  const variant = variantForId(room.projection.variant);
  const player = room.projection.state.status.type === 'finished'
    ? fullTruthView(room, perspective)
    : variant.getPlayerView(room.projection.state, perspective);
  const opponentView = room.projection.state.status.type === 'finished'
    ? fullTruthView(room, opponent)
    : variant.getPlayerView(room.projection.state, opponent);
  return {
    opponent,
    player,
    opponentView,
    truth: fullTruthView(room, perspective),
  };
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
  const publicPerspective = publicLivePerspective(room.projection, room.mode ?? modeForProjection(room.projection));
  if (publicPerspective === 'truth') return fullTruthView(room, perspective);
  if (publicPerspective) {
    return {
      ...variantForId(room.projection.variant).getPlayerView(room.projection.state, publicPerspective),
      legalMoves: [],
    };
  }

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
    visibleSquares: allSquares,
    legalMoves: [],
    status: room.projection.state.status,
    perspective,
    moveNumber: room.projection.state.moveNumber,
    lastMove: room.projection.state.lastMove,
    clock: room.projection.state.clock,
  };
}
