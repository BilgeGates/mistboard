import {
  applyGameEvent,
  capturedRoleFor,
  initialGameProjection,
  type Color,
  type GameEvent,
  type GameProjection,
  type PieceRole,
} from '@mistboard/game';

export type CaptureTally = Record<Color, PieceRole[]>;

const PIECE_ORDER: Record<PieceRole, number> = {
  queen: 0,
  rook: 1,
  bishop: 2,
  knight: 3,
  pawn: 4,
  king: 5,
};

export function emptyCaptureTally(): CaptureTally {
  return { white: [], black: [] };
}

export function sortCaptureRoles(roles: PieceRole[]): PieceRole[] {
  return [...roles].sort((a, b) => PIECE_ORDER[a] - PIECE_ORDER[b]);
}

// Captures are read from the server-annotated `capturedRole` field on move-played
// events. For older events that predate the annotation, fall back to detecting
// captures by replaying the projection — this only works on event streams that
// contain both colors' moves (canonical/postgame), since fog-filtered live streams
// omit opponent moves and break the pre-move board reconstruction.
export function computeCaptures(events: GameEvent[]): CaptureTally {
  const tally = emptyCaptureTally();
  if (events.length === 0) return tally;

  let projection: GameProjection = initialGameProjection(events[0]!.roomId);
  for (const event of events) {
    if (event.type === 'move-played') {
      const captured = event.capturedRole ?? capturedRoleFor(projection.state, event.move);
      if (captured) tally[event.color].push(captured);
    }
    projection = applyGameEvent(projection, event);
  }
  return tally;
}
