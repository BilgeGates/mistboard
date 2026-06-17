/**
 * Reveal Chess VariantTenant — standard 8x8 chess with hidden piece identities
 * on the Layer-3 tenant contract (variant-tenant/tenant.ts).
 *
 * Reveal Chess is NOT a fog tenant: every occupied square is public (face-up or
 * face-down), so moves pass through to both seats unchanged. What is hidden is
 * identity, and that lives in two places this tenant guards:
 *   - the per-game DEAL is a server secret. rules.createSetup mints it with a
 *     crypto RNG; the runtime persists it in the room-created event; this
 *     tenant's clientEventFor STRIPS it before any client sees the event.
 *   - the board's face-down pieces and the capturer-only captured pool are
 *     redacted by getRevealChessPlayerView, which viewForClient delegates to.
 *
 * PvP-only at first: there is no engine block (the identity-belief bot is
 * deferred), so wire.snapshotExtras always reports roomMode 'pvp'. Gated behind
 * the reveal-chess flag; the spec id is first-class (@mistboard/game GAME_SPECS).
 */

import { randomInt } from 'node:crypto';
import {
  type AbortReason,
  applyRevealChessMove,
  createInitialRevealChessState,
  createRevealChessDeal,
  getRevealChessPlayerView,
  isRevealChessLegalMove,
  oppositeRevealChessColor,
  REVEAL_CHESS_SPEC_ID,
  type RevealChessColor,
  type RevealChessDeal,
  type RevealChessGameState,
  type RevealChessMove,
  type RevealChessPieceRole,
  type RevealChessPlayerView,
  type RevealChessPromotionRole,
} from '@mistboard/game';
import { revealChessEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

// Live-room registration (HTTP create / lobby / ws plumbing) is gated behind the
// reveal-chess flag; the spec id is first-class (@mistboard/game GAME_SPECS).
export const REVEAL_CHESS_ROOM_ID_PREFIX = 'rc_';

export type RevealChessTenant = VariantTenant<
  'reveal-chess',
  RevealChessColor,
  RevealChessMove,
  RevealChessGameState,
  RevealChessPlayerView,
  typeof REVEAL_CHESS_SPEC_ID
>;

const SQUARE = /^[a-h][1-8]$/;

export function isRevealChessSquare(value: unknown): value is RevealChessMove['from'] {
  return typeof value === 'string' && SQUARE.test(value);
}

function isRevealChessColor(value: unknown): value is RevealChessColor {
  return value === 'white' || value === 'black';
}

function isRevealChessPromotion(value: unknown): value is RevealChessPromotionRole {
  return value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight';
}

function isRevealChessMove(value: unknown): value is RevealChessMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isRevealChessSquare(move.from) || !isRevealChessSquare(move.to)) return false;
  // promotion is optional (the kernel defaults to queen); when present it must be
  // one of the four legal promotion roles.
  return move.promotion === undefined || isRevealChessPromotion(move.promotion);
}

// A crypto-backed float in [0, 1): the deal is a hidden-information secret, so it
// must not come from Math.random.
const RNG_RANGE = 2 ** 31;
function cryptoRng(): number {
  return randomInt(0, RNG_RANGE) / RNG_RANGE;
}

// Reconstruct a deal from the persisted room-created setup.
// createInitialRevealChessState fully validates it (throws on a corrupt
// multiset); this only shape-checks the container so a missing setup falls back
// to the standard arrangement.
function asRevealChessDeal(setup: unknown): RevealChessDeal | undefined {
  if (setup === null || typeof setup !== 'object') return undefined;
  const candidate = setup as { white?: unknown; black?: unknown };
  if (!Array.isArray(candidate.white) || !Array.isArray(candidate.black)) return undefined;
  return {
    white: candidate.white as RevealChessPieceRole[],
    black: candidate.black as RevealChessPieceRole[],
  };
}

// Identity is hidden, position is not: moves are public to both seats. The only
// redaction on the wire is stripping the server-secret deal from room-created.
export function revealChessClientEventFor(
  event: TenantRoomEvent<RevealChessColor, RevealChessMove, typeof REVEAL_CHESS_SPEC_ID>,
  seat: TenantSeat<RevealChessColor>,
  ply: number,
): TenantClientEvent<RevealChessColor, RevealChessMove, typeof REVEAL_CHESS_SPEC_ID> | null {
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

function emptyRevealChessView(state: RevealChessGameState): RevealChessPlayerView {
  return {
    id: state.id,
    perspective: 'white',
    board: {},
    legalMoves: [],
    captured: [],
    inCheck: false,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

export function getRevealChessClientView(
  state: RevealChessGameState,
  client: TenantSnapshotClient<RevealChessColor>,
): RevealChessPlayerView {
  // Spectator policy: empty view for now (/room/ never reveals). A public masked
  // view for observers can come with the spectator surface.
  if (client.seat === 'spectator') return emptyRevealChessView(state);
  const perspective = client.seat === 'black' ? 'black' : 'white';
  return getRevealChessPlayerView(state, perspective);
}

export const revealChessTenant: RevealChessTenant = {
  kind: 'reveal-chess',
  gameSpecId: REVEAL_CHESS_SPEC_ID,
  roomIdPrefix: REVEAL_CHESS_ROOM_ID_PREFIX,
  colors: ['white', 'black'],
  enabled: revealChessEnabled,
  oppositeColor: oppositeRevealChessColor,
  rules: {
    createInitialState: (roomId, setup) =>
      createInitialRevealChessState(roomId, asRevealChessDeal(setup)),
    createSetup: () => createRevealChessDeal(cryptoRng),
    applyMove: (state, move) => applyRevealChessMove(state, move),
    isLegalMove: isRevealChessLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isRevealChessColor,
    isMove: isRevealChessMove,
    moveFromMessage: (message) => {
      if (!isRevealChessSquare(message.from) || !isRevealChessSquare(message.to)) return null;
      // Promotion is optional: a missing promotion is NOT a rejection (the kernel
      // defaults to queen). A present-but-invalid promotion is.
      if (message.promotion === undefined) {
        return { from: message.from, to: message.to };
      }
      if (!isRevealChessPromotion(message.promotion)) return null;
      return { from: message.from, to: message.to, promotion: message.promotion };
    },
  },
  visibility: {
    clientEventFor: revealChessClientEventFor,
    viewForClient: (state, client) => getRevealChessClientView(state, client),
  },
  // No engine: Reveal Chess is PvP-only at launch (the identity-belief bot is
  // deferred). The contract's engine block is optional and omitted here.
  //
  // Reveal Chess's core snapshot carries no extras; the only thing the client
  // needs is the room mode, which is always 'pvp' without an engine seat.
  wire: {
    snapshotExtras: () => ({ roomMode: 'pvp' }),
  },
  persistence: {
    resultForWinner: (winner: RevealChessColor | null): persistence.GameResult => {
      if (winner === 'white') return 'white-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    // The kernel spells the no-progress draw clock 'no-progress-clock' and the
    // threefold draw 'threefold-repetition'; the canonical GameTermination values
    // (the only ones the games_termination_check CHECK accepts) are
    // 'progress-clock' and 'repetition'. Translate them — a blind cast launders
    // the invalid string past TS and only fails at the DB write, silently
    // dropping the game.
    termination: (reason: string): persistence.GameTermination => {
      if (reason === 'no-progress-clock') return 'progress-clock';
      if (reason === 'threefold-repetition') return 'repetition';
      return reason as persistence.GameTermination;
    },
    logKindPrefix: 'reveal_chess',
    logLabel: 'Reveal Chess',
  },
};
