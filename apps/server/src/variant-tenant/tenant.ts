/**
 * VariantTenant — the Layer-3 live-room tenant contract.
 *
 * Extracted 2026-06-11 from the four sibling live stacks (dark chess, Dark
 * Mini Xiangqi, Dark Xiangqi, Crossroads Chess), whose runtime/events/
 * lifecycle/seat-session/ws files are 70-90% identical. The generic modules in
 * this directory hold that shared plumbing once, parameterized by a tenant:
 *
 *   - the rules module is the type boundary: the runtime only calls the
 *     opaque callbacks under `rules` and `visibility`, and only reads the
 *     structural slice of game state declared by TenantGameStateLike
 *     (status / moveNumber / lastMove). It never constructs variant state
 *     directly — terminal states go through rules.finish / rules.abort.
 *   - per-seat redaction is tenant policy: visibility.clientEventFor decides
 *     which wire events a seat may see (fog tenants hide opponent moves;
 *     perfect-info tenants pass them through) and visibility.viewForClient
 *     builds the seat's PlayerView, including the spectator policy.
 *   - everything color-shaped is keyed by the tenant's `colors` tuple in move
 *     order; the clock arms after the second mover's first move.
 *
 * Reference implementation: dark-mini-xiangqi-tenant.ts (P0). Migration order
 * and gates: docs-private/variant-generalization-track.md.
 */

import type { AbortReason, RoomTimeControl } from '@mistboard/game';
import type * as persistence from '../persistence.js';

export type TenantSeat<C extends string> = C | 'spectator';

// The structural slice of variant game status the generic runtime reads.
// Every sibling stack's status union already has this exact shape.
export type TenantGameStatus<C extends string> =
  | { type: 'playing'; turn: C }
  | { type: 'finished'; winner: C | null; reason: string }
  | { type: 'aborted'; reason: AbortReason };

export type TenantGameStateLike<C extends string> = {
  status: TenantGameStatus<C>;
  moveNumber: number;
  lastMove?: unknown;
};

// Terminal reasons the GENERIC runtime itself can produce (clock expiry,
// resign, abandonment). Rules-produced endings (checkmate, king-captured,
// race, ...) never pass through here — they come out of rules.applyMove.
export type TenantEndReason = 'timeout' | 'resignation' | 'abandonment';

export type TenantClockState<C extends string> = {
  activeColor: C | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<C, number>;
  runningSince: number | null;
};

export type TenantRoomEvent<C extends string, M, Spec extends string = string> =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: Spec;
      creatorPreference?: C | 'random';
      rated?: boolean;
      timeControl?: RoomTimeControl;
    }
  | { type: 'seat-assigned'; at: number; roomId: string; clientId: string; seat: C }
  // Accepted in event logs only for tenants with wire.acceptsSeatVacated
  // (Dark Xiangqi); clears the seat when the vacating clientId still holds it.
  | { type: 'seat-vacated'; at: number; roomId: string; clientId: string; seat: C }
  | { type: 'clock-started'; at: number; roomId: string; clock: TenantClockState<C> }
  | { type: 'clock-expired'; at: number; roomId: string; color: C; clock: TenantClockState<C> }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: C;
      move: M;
      clock?: TenantClockState<C>;
    }
  | { type: 'seat-resigned'; at: number; roomId: string; color: C; clock?: TenantClockState<C> }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: TenantClockState<C>;
    }
  | { type: 'seat-forfeited'; at: number; roomId: string; color: C; clock?: TenantClockState<C> };

// Wire-side event: move-played gains its 1-based ply so clients can sequence.
export type TenantClientEvent<C extends string, M, Spec extends string = string> =
  | Exclude<TenantRoomEvent<C, M, Spec>, { type: 'move-played' }>
  | (Extract<TenantRoomEvent<C, M, Spec>, { type: 'move-played' }> & { ply: number });

export type TenantProjection<
  C extends string,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> = {
  roomId: string;
  creatorPreference?: C | 'random';
  gameSpecId: Spec;
  rated: boolean;
  state: State;
  seats: Partial<Record<C, string>>;
  clock?: TenantClockState<C>;
  timeControl?: RoomTimeControl;
};

export type TenantClientRef<C extends string> = {
  id?: string;
  seat: TenantSeat<C>;
  displaced: boolean;
};

export type TenantSeatTokenState<C extends string> = {
  clientId: string;
  seat: C;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type TenantRematchOffer = {
  tokenHash: string;
  userId: string | null;
  at: number;
};

export type TenantRematchPendingRedirect<C extends string> = {
  roomId: string;
  seat: C;
  rawToken: string;
  url: string;
};

export type TenantRematchState<C extends string> = {
  offers: Partial<Record<C, TenantRematchOffer>>;
  finalizedRoomId?: string;
  pendingRedirects?: Partial<Record<C, TenantRematchPendingRedirect<C>>>;
};

// Pregame abort phases: waiting on the first mover's move, then the second's.
export type TenantAbortPhase<C extends string> = `${C}-1`;

export type TenantRuntimeRoom<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> = {
  kind: Kind;
  id: string;
  clients: Set<TenantClientRef<C>>;
  events: TenantRoomEvent<C, M, Spec>[];
  projection: TenantProjection<C, State, Spec>;
  gameSpecId: Spec;
  rated: boolean;
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: TenantAbortPhase<C> | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  forfeitDeadline: number | null;
  forfeitSeat: C | null;
  gameEndRecorded: boolean;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<C, TenantSeatTokenState<C>>>;
  rematch: TenantRematchState<C>;
  // PvE: setTimeout handle for the pending engine move (debounces the scheduler
  // so an engine seat schedules at most one move at a time). The engine SEAT
  // itself is derived from projection.seats (its slot holds an engine clientId),
  // so it survives hydration without a dedicated field.
  engineTimer: ReturnType<typeof setTimeout> | null;
  // PvE: the engine HTTP service's seat reservation for this game. Reserved at
  // creation, sent on every engine turn (the service 409s without it), released
  // on game end. Null for PvP and until reserved.
  engineReservationId: string | null;
};

export type TenantSnapshotClient<C extends string> = {
  id: string;
  seat: TenantSeat<C>;
  solo: boolean;
};

export type VariantTenant<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string = string,
> = {
  kind: Kind;
  gameSpecId: Spec;
  roomIdPrefix: string;
  // Move order: [first mover, second mover]. Drives seat iteration, summary
  // participant order, rematch color swap, and clock arming (the clock arms
  // once the second mover completes the first full move).
  colors: readonly [C, C];
  enabled(): boolean;
  oppositeColor(color: C): C;
  rules: {
    createInitialState(roomId: string): State;
    applyMove(state: State, move: M): State;
    isLegalMove(state: State, move: M): boolean;
    // Terminal-state constructors: the generic runtime never builds variant
    // status objects itself, so variant status unions stay variant-owned.
    finish(state: State, winner: C, reason: TenantEndReason): State;
    abort(state: State, reason: AbortReason): State;
    isColor(value: unknown): value is C;
    isMove(value: unknown): value is M;
    // Parse + validate a move out of a raw client `move` message; null rejects.
    // STATE-FREE canonicalization (e.g. coordinate parsing) belongs here.
    moveFromMessage(message: { from?: string; to?: string; promotion?: string }): M | null;
    // STATE-DEPENDENT canonicalization: resolve the parsed move to the exact
    // legal-move object to append (e.g. Crossroads re-attaches promotion from
    // the legal-move list). Null rejects. When omitted, the ws move path
    // appends the parsed move after an isLegalMove check instead.
    canonicalMove?(state: State, move: M): M | null;
  };
  visibility: {
    // Per-seat wire-event redaction. Fog tenants hide opponent moves and
    // foreign seat assignments; perfect-info tenants pass events through.
    // Returning null drops the event for that seat entirely.
    clientEventFor(
      event: TenantRoomEvent<C, M, Spec>,
      seat: TenantSeat<C>,
      ply: number,
    ): TenantClientEvent<C, M, Spec> | null;
    // The seat's redacted view, including the spectator policy. Receives the
    // event log so fog tenants can derive context (e.g. whether the viewer
    // made the latest move) without the runtime inspecting view shape.
    viewForClient(
      state: State,
      client: TenantSnapshotClient<C>,
      events: readonly TenantRoomEvent<C, M, Spec>[],
    ): View;
  };
  engine?: {
    isEngineClientId(clientId: string | undefined): boolean;
    displayName(engineId: string): string;
    // Observability tag on engine-seat reservation releases (`<tag>-finished`).
    reservationReleaseTag: string;
  };
  // Wire-format variation points. Each tenant's full snapshot shape (core +
  // extras) is pinned by its golden wire fixture.
  wire?: {
    // Variant-specific snapshot fields spread over the core payload (e.g.
    // DMX adds mode/pveEngineId/rated/forfeitDeadline/rematch; Dark Xiangqi
    // adds nothing).
    snapshotExtras?(
      room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
      client: TenantSnapshotClient<C>,
    ): Record<string, unknown>;
    // Accept seat-vacated events when validating event logs. Off by default
    // so tenants that never emit them keep rejecting them.
    acceptsSeatVacated?: boolean;
    // Additional gameSpecId values accepted in PERSISTED room-created events
    // (pre-rename aliases, e.g. Crossroads' 'dual-chess'). Validation-only:
    // new rooms and projections always carry the canonical tenant.gameSpecId.
    legacyGameSpecIds?: readonly string[];
  };
  persistence: {
    resultForWinner(winner: C | null): persistence.GameResult;
    termination(reason: string): persistence.GameTermination;
    // Full GameSummary override for tenants whose persisted record predates
    // (or deliberately diverges from) the default builder in
    // variant-tenant/events.ts. Omit to use the default.
    buildGameSummary?(room: TenantRuntimeRoom<Kind, C, M, State, Spec>): persistence.GameSummary;
    // Structured-log identity: `<logKindPrefix>_persistence_failure` etc.
    logKindPrefix: string;
    logLabel: string;
  };
};
