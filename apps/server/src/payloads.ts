import {
  variantForId,
  type Color,
  type GameEvent,
  type GameProjection,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import {
  modeForProjection,
  type GameAccessMode,
} from './server-policy.js';
import { engineVersionDisplayName } from './engine-registry.js';

export type Seat = Color | 'spectator';

export type SnapshotClient = {
  devViews: boolean;
  id: string;
  seat: Seat;
  solo: boolean;
};

export type SnapshotRoom = {
  id: string;
  clients: { size: number } & Iterable<{ seat: Seat; displaced: boolean }>;
  events: GameEvent[];
  mode?: GameAccessMode;
  projection: GameProjection;
  pveEngineId?: string | null;
  rated?: boolean;
  rematch?: { offers: Partial<Record<Color, unknown>>; finalizedRoomId?: string };
  seatDisplayNames?: Partial<Record<Color, string>>;
};

export function computeConnectedSeats(
  clients: Iterable<{ seat: Seat; displaced: boolean }>,
): { white: boolean; black: boolean } {
  const connected = { white: false, black: false };
  for (const c of clients) {
    if (c.displaced) continue;
    if (c.seat === 'white') connected.white = true;
    else if (c.seat === 'black') connected.black = true;
  }
  return connected;
}

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
    pveEngineName: pveEngineName(room, mode),
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    seats: room.projection.seats,
    offer: offerForClient(room.projection, client),
    offers: offersForClient(room.projection, client),
    selections: selectionsForClient(room.projection, client),
    devViews: devViewsForClient(room, client),
    resolvedStartId: resolvedStartIdForClient(room.projection, client),
    resolvedStartIds: resolvedStartIdsForClient(room.projection, client),
    events: eventsForClient(normalizedRoom, client),
    state: getClientView(normalizedRoom, client),
    rated: room.rated ?? true,
    paused: room.projection.paused,
    connectedSeats: computeConnectedSeats(room.clients),
    seatDisplayNames: room.seatDisplayNames ?? {},
    rematch: room.rematch
      ? {
        offers: {
          white: room.rematch.offers.white !== undefined,
          black: room.rematch.offers.black !== undefined,
        },
        finalizedRoomId: room.rematch.finalizedRoomId ?? null,
      }
      : { offers: { white: false, black: false }, finalizedRoomId: null },
  };
}

function pveEngineName(room: SnapshotRoom, mode: GameAccessMode): string | null {
  if (mode !== 'pve' || !room.pveEngineId) return null;
  return engineVersionDisplayName(room.pveEngineId);
}

export function eventsForClient(room: SnapshotRoom, client: SnapshotClient): GameEvent[] {
  const events = eventsVisibleByMode(room, client);
  if (!shouldRedactHiddenDraft(room.projection, client)) return events;
  return events.flatMap((event) => redactHiddenDraftEvent(event, room.projection, client));
}

function eventsVisibleByMode(room: SnapshotRoom, client: SnapshotClient): GameEvent[] {
  // Live fog game: seated player sees only their own move-played events. This
  // uniformly handles PvP (each player sees own moves) and PvE (human seat
  // filters out engine moves automatically — engine doesn't connect as a WS
  // client). Spectators are rejected at the connection layer
  // (canObserveLiveRoom); the spectator branch here is defense-in-depth — if
  // a spectator SnapshotClient ever reaches this function, strip every
  // move-played event rather than leak any move history.
  if (room.projection.variant === 'fog-of-war' && room.projection.state.status.type !== 'finished') {
    if (client.seat === 'spectator') {
      return room.events.filter((event) => event.type !== 'move-played');
    }
    return room.events.filter((event) => event.type !== 'move-played' || event.color === client.seat);
  }
  return room.events;
}

function offerForClient(projection: GameProjection, client: SnapshotClient) {
  if (!shouldRedactHiddenDraft(projection, client)) return projection.offer;
  if (client.seat === 'spectator') return [];
  return offerForColor(projection, client.seat);
}

function offersForClient(projection: GameProjection, client: SnapshotClient): Partial<Record<Color, GameProjection['offer']>> {
  if (!shouldRedactHiddenDraft(projection, client)) return projection.offers;
  if (client.seat === 'spectator') return {};
  return { [client.seat]: offerForColor(projection, client.seat) };
}

function selectionsForClient(projection: GameProjection, client: SnapshotClient): Partial<Record<Color, number>> {
  if (!shouldRedactHiddenDraft(projection, client)) return projection.selections;
  if (client.seat === 'spectator') return {};
  const selected = projection.selections[client.seat];
  return selected === undefined ? {} : { [client.seat]: selected };
}

function resolvedStartIdForClient(projection: GameProjection, client: SnapshotClient): number | null {
  if (!shouldRedactHiddenDraft(projection, client)) return projection.resolvedStartId;
  return null;
}

function resolvedStartIdsForClient(projection: GameProjection, client: SnapshotClient): Partial<Record<Color, number>> {
  if (!shouldRedactHiddenDraft(projection, client)) return projection.resolvedStartIds;
  if (client.seat === 'spectator') return {};
  const resolved = projection.resolvedStartIds[client.seat];
  return resolved === undefined ? {} : { [client.seat]: resolved };
}

function redactHiddenDraftEvent(
  event: GameEvent,
  projection: GameProjection,
  client: SnapshotClient,
): GameEvent[] {
  if (event.type === 'room-created') {
    const ownOffer = offerForClient(projection, client);
    return [{
      ...event,
      offer: ownOffer,
      offers: client.seat === 'spectator' ? {} : { [client.seat]: ownOffer },
    }];
  }
  if (event.type === 'draft-start-selected') {
    return event.color === client.seat ? [event] : [];
  }
  if (event.type === 'draft-start-resolved') return [];
  return [event];
}

function shouldRedactHiddenDraft(projection: GameProjection, client: SnapshotClient): boolean {
  if (client.solo) return false;
  if (projection.variant !== 'fog-of-war') return false;
  if (projection.state.status.type === 'finished') return false;
  return projection.offer.length > 0
    || !!projection.offers.white?.length
    || !!projection.offers.black?.length;
}

function offerForColor(projection: GameProjection, color: Color): GameProjection['offer'] {
  return projection.offers[color] ?? projection.offer;
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
  // Live spectator on a fog game: defense-in-depth. Spectators are rejected at
  // the connection layer (canObserveLiveRoom returns false for unfinished
  // games), so this branch should be unreachable in practice. If a spectator
  // SnapshotClient ever reaches here we return an empty view rather than leak
  // any board state.
  if (room.projection.variant === 'fog-of-war' && client.seat === 'spectator') {
    return emptyFogView(room, perspective);
  }

  const variant = variantForId(room.projection.variant);
  const view = variant.getPlayerView(room.projection.state, perspective);
  if (!client.solo || room.projection.state.status.type !== 'playing') return view;
  return {
    ...view,
    legalMoves: variant.getLegalMoves(room.projection.state, room.projection.state.status.turn),
  };
}

function emptyFogView(room: SnapshotRoom, perspective: Color): PlayerView {
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
