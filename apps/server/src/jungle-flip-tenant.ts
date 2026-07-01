/**
 * Flip Jungle VariantTenant — 4×4 flip animal chess on the Layer-3 tenant contract,
 * modeled directly on banqi-tenant.ts (symmetric hidden-identity).
 *
 * Like banqi, every occupied square is public (face-down or revealed), so the masked
 * board is identical for both seats and wire events pass through unchanged. The ONE
 * hidden thing is the deal — which face-down tile holds which piece — guarded in two
 * places:
 *   - the per-game DEAL is a server secret. rules.createSetup mints it with a crypto
 *     RNG; the runtime persists it in the room-created event; clientEventFor STRIPS it.
 *   - the board's face-down tiles are redacted by getJungleFlipPlayerView, and
 *     viewForClient delegates to it.
 *
 * C is the SEAT ('red' = first mover); the red seat binds its ink on the opening flip.
 * PvP + PvE: the MistyJungleFlip bot (a redacted-FEN UCI engine) seats via the
 * engine config below, same as banqi.
 */

import { randomInt } from 'node:crypto';
import {
  type AbortReason,
  applyJungleFlipMove,
  createInitialJungleFlipState,
  createJungleFlipDeal,
  getJungleFlipPlayerView,
  isJungleFlipLegalMove,
  JUNGLE_FLIP_SEATS,
  JUNGLE_FLIP_SPEC_ID,
  type JungleFlipDeal,
  type JungleFlipGameState,
  type JungleFlipMove,
  type JungleFlipPlayerView,
  type JungleFlipSeat,
  type JungleFlipSquare,
  oppositeJungleFlipSeat,
} from '@mistboard/game';
import { jungleFlipEnabled } from './feature-flags.js';
import {
  isJungleFlipEngineClientId,
  jungleFlipEngineDisplayName,
  jungleFlipEngineVersion,
} from './jungle-flip-engine.js';
import type * as persistence from './persistence.js';
import { tenantPveEngineId } from './variant-tenant/runtime.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const JUNGLE_FLIP_ROOM_ID_PREFIX = 'jgf_';

export type JungleFlipTenant = VariantTenant<
  'jungle-flip',
  JungleFlipSeat,
  JungleFlipMove,
  JungleFlipGameState,
  JungleFlipPlayerView,
  typeof JUNGLE_FLIP_SPEC_ID
>;

const SQUARE = /^[a-d][1-4]$/;

export function isJungleFlipSquare(value: unknown): value is JungleFlipSquare {
  return typeof value === 'string' && SQUARE.test(value);
}

function isJungleFlipSeat(value: unknown): value is JungleFlipSeat {
  return value === 'red' || value === 'black';
}

function isJungleFlipMove(value: unknown): value is JungleFlipMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  // A flip is the self-move from === to; both endpoints must still be squares.
  return isJungleFlipSquare(move.from) && isJungleFlipSquare(move.to);
}

const RNG_RANGE = 2 ** 31;
function cryptoRng(): number {
  return randomInt(0, RNG_RANGE) / RNG_RANGE;
}

function asJungleFlipDeal(setup: unknown): JungleFlipDeal | undefined {
  return Array.isArray(setup) ? (setup as JungleFlipDeal) : undefined;
}

// Identity is hidden, position is not: moves are public to both seats. The only wire
// redaction is stripping the server-secret deal from room-created. (Spectators get no
// events for now — /room/ never reveals.)
export function jungleFlipClientEventFor(
  event: TenantRoomEvent<JungleFlipSeat, JungleFlipMove, typeof JUNGLE_FLIP_SPEC_ID>,
  seat: TenantSeat<JungleFlipSeat>,
  ply: number,
): TenantClientEvent<JungleFlipSeat, JungleFlipMove, typeof JUNGLE_FLIP_SPEC_ID> | null {
  if (seat === 'spectator') return null;
  if (event.type === 'room-created') {
    if (event.setup === undefined) return event;
    const redacted = { ...event };
    delete redacted.setup;
    return redacted;
  }
  if (event.type === 'move-played') return { ...event, ply };
  return event;
}

function emptyJungleFlipView(state: JungleFlipGameState): JungleFlipPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: {},
    legalMoves: [],
    captured: [],
    status: state.status,
    ply: state.ply,
    firstColor: null,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

export function getJungleFlipClientView(
  state: JungleFlipGameState,
  client: TenantSnapshotClient<JungleFlipSeat>,
): JungleFlipPlayerView {
  if (client.seat === 'spectator') return emptyJungleFlipView(state);
  return getJungleFlipPlayerView(state, client.seat);
}

export const jungleFlipTenant: JungleFlipTenant = {
  kind: 'jungle-flip',
  gameSpecId: JUNGLE_FLIP_SPEC_ID,
  roomIdPrefix: JUNGLE_FLIP_ROOM_ID_PREFIX,
  colors: JUNGLE_FLIP_SEATS,
  enabled: jungleFlipEnabled,
  oppositeColor: oppositeJungleFlipSeat,
  rules: {
    createInitialState: (roomId, setup) =>
      createInitialJungleFlipState(roomId, asJungleFlipDeal(setup)),
    createSetup: () => createJungleFlipDeal(cryptoRng),
    applyMove: (state, move) => applyJungleFlipMove(state, move),
    isLegalMove: isJungleFlipLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isJungleFlipSeat,
    isMove: isJungleFlipMove,
    moveFromMessage: (message) => {
      if (!isJungleFlipSquare(message.from) || !isJungleFlipSquare(message.to)) return null;
      return { from: message.from, to: message.to };
    },
  },
  visibility: {
    clientEventFor: jungleFlipClientEventFor,
    viewForClient: (state, client) => getJungleFlipClientView(state, client),
  },
  // Mark the MistyJungleFlip engine seat as always-present so the disconnect-forfeit
  // logic never forfeits it (a PvE engine has no WS client) and the client stops
  // showing the "Invite opponent" panel for a seated bot. Without this the flip
  // PvE room renders as an open PvP invite even though the engine is playing.
  engine: {
    isEngineClientId: isJungleFlipEngineClientId,
    displayName: jungleFlipEngineDisplayName,
    engineVersion: jungleFlipEngineVersion,
    reservationReleaseTag: 'jungle-flip',
  },
  // Surface the room mode + engine id so the client's "Play again" can re-create a
  // PvE game vs the same bot (without these it falls back to a PvP invite).
  wire: {
    snapshotExtras: (room) => {
      const pveEngineId = tenantPveEngineId(jungleFlipTenant, room);
      return pveEngineId === null ? { roomMode: 'pvp' } : { roomMode: 'pve', pveEngineId };
    },
  },
  persistence: {
    resultForWinner: (winner: JungleFlipSeat | null): persistence.GameResult => {
      if (winner === 'red') return 'red-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    // The kernel spells the no-progress draw 'no-progress'; the canonical
    // GameTermination value is 'progress-clock'. 'stalemate' and 'repetition' already
    // match the games_termination_check set.
    termination: (reason: string): persistence.GameTermination =>
      reason === 'no-progress' ? 'progress-clock' : (reason as persistence.GameTermination),
    logKindPrefix: 'jungle_flip',
    logLabel: 'Flip Jungle',
  },
};
