/**
 * Jieqi VariantTenant — full-board xiangqi with hidden piece identities on the
 * Layer-3 tenant contract (variant-tenant/tenant.ts).
 *
 * Jieqi is NOT a fog tenant: every occupied square is public, so moves pass
 * through to both seats unchanged. What is hidden is identity, and that lives in
 * two places this tenant guards:
 *   - the per-game DEAL is a server secret. rules.createSetup mints it with a
 *     crypto RNG; the runtime persists it in the room-created event; this
 *     tenant's clientEventFor STRIPS it before any client sees the event.
 *   - the board's face-down pieces and the capturer-only captured pool are
 *     redacted by getJieqiPlayerView, which viewForClient delegates to.
 *
 * Not wired into register-tenants.ts yet (no HTTP create / lobby / gameSpec):
 * registration is the launch capstone. This module + the contract `setup` hook
 * are the foundation.
 */

import { randomInt } from 'node:crypto';
import {
  type AbortReason,
  applyJieqiMove,
  createInitialJieqiState,
  createJieqiDeal,
  getJieqiPlayerView,
  isJieqiLegalMove,
  JIEQI_SPEC_ID,
  type JieqiColor,
  type JieqiDeal,
  type JieqiGameState,
  type JieqiMove,
  type JieqiPieceRole,
  type JieqiPlayerView,
  oppositeJieqiColor,
} from '@mistboard/game';
import { jieqiEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

// Live-room registration (HTTP create / lobby / ws plumbing) is deferred to the
// launch capstone; the spec id is first-class (@mistboard/game GAME_SPECS).
export const JIEQI_ROOM_ID_PREFIX = 'jq_';

export type JieqiTenant = VariantTenant<
  'jieqi',
  JieqiColor,
  JieqiMove,
  JieqiGameState,
  JieqiPlayerView,
  typeof JIEQI_SPEC_ID
>;

const SQUARE = /^[a-i](?:10|[1-9])$/;

export function isJieqiSquare(value: unknown): value is JieqiMove['from'] {
  return typeof value === 'string' && SQUARE.test(value);
}

function isJieqiColor(value: unknown): value is JieqiColor {
  return value === 'red' || value === 'black';
}

function isJieqiMove(value: unknown): value is JieqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isJieqiSquare(move.from) && isJieqiSquare(move.to);
}

// A crypto-backed float in [0, 1): the deal is a hidden-information secret, so it
// must not come from Math.random.
const RNG_RANGE = 2 ** 31;
function cryptoRng(): number {
  return randomInt(0, RNG_RANGE) / RNG_RANGE;
}

// Reconstruct a deal from the persisted room-created setup. createInitialJieqiState
// fully validates it (throws on a corrupt multiset); this only shape-checks the
// container so a missing setup falls back to the standard arrangement.
function asJieqiDeal(setup: unknown): JieqiDeal | undefined {
  if (setup === null || typeof setup !== 'object') return undefined;
  const candidate = setup as { red?: unknown; black?: unknown };
  if (!Array.isArray(candidate.red) || !Array.isArray(candidate.black)) return undefined;
  return { red: candidate.red as JieqiPieceRole[], black: candidate.black as JieqiPieceRole[] };
}

// Identity is hidden, position is not: moves are public to both seats. The only
// redaction on the wire is stripping the server-secret deal from room-created.
export function jieqiClientEventFor(
  event: TenantRoomEvent<JieqiColor, JieqiMove, typeof JIEQI_SPEC_ID>,
  seat: TenantSeat<JieqiColor>,
  ply: number,
): TenantClientEvent<JieqiColor, JieqiMove, typeof JIEQI_SPEC_ID> | null {
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

function emptyJieqiView(state: JieqiGameState): JieqiPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: {},
    legalMoves: [],
    captured: [],
    inCheck: false,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

export function getJieqiClientView(
  state: JieqiGameState,
  client: TenantSnapshotClient<JieqiColor>,
): JieqiPlayerView {
  // Spectator policy: empty view for now (/room/ never reveals). A public masked
  // view for observers can come with the spectator surface.
  if (client.seat === 'spectator') return emptyJieqiView(state);
  const perspective = client.seat === 'black' ? 'black' : 'red';
  return getJieqiPlayerView(state, perspective);
}

export const jieqiTenant: JieqiTenant = {
  kind: 'jieqi',
  gameSpecId: JIEQI_SPEC_ID,
  roomIdPrefix: JIEQI_ROOM_ID_PREFIX,
  colors: ['red', 'black'],
  enabled: jieqiEnabled,
  oppositeColor: oppositeJieqiColor,
  rules: {
    createInitialState: (roomId, setup) => createInitialJieqiState(roomId, asJieqiDeal(setup)),
    createSetup: () => createJieqiDeal(cryptoRng),
    applyMove: (state, move) => applyJieqiMove(state, move),
    isLegalMove: isJieqiLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isJieqiColor,
    isMove: isJieqiMove,
    moveFromMessage: (message) => {
      if (!isJieqiSquare(message.from) || !isJieqiSquare(message.to)) return null;
      return { from: message.from, to: message.to };
    },
  },
  visibility: {
    clientEventFor: jieqiClientEventFor,
    viewForClient: (state, client) => getJieqiClientView(state, client),
  },
  persistence: {
    resultForWinner: (winner: JieqiColor | null): persistence.GameResult => {
      if (winner === 'red') return 'red-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'jieqi',
    logLabel: 'Jieqi',
  },
};
