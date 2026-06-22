/**
 * Built-in Drop Mini Xiangqi PvE loop.
 *
 * Drop Mini is perfect-information, but the no-enemy-palace drop rule is not a
 * production Fairy-Stockfish variant yet. These launch tiers are deterministic
 * TypeScript heuristics that run in-process and inject moves through the same
 * tenant append+broadcast path as human moves.
 */

import {
  applyDropMiniXiangqiMove,
  type DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isDropMiniXiangqiGeneralInCheck,
  type MiniXiangqiColor,
  type MiniXiangqiPieceRole,
} from '@mistboard/game';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

export const DROP_MINI_XIANGQI_ENGINE_VERSION = '0.1.0';
export const DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID = 'misty-drop-mini-level-2';

type DropMiniXiangqiEngineRoom = TenantLiveRoom<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;
type DropMiniXiangqiEngineContext = TenantLifecycleContext<
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID,
  DropMiniXiangqiEngineRoom
>;

export type DropMiniXiangqiEngineTier = {
  id: string;
  name: string;
  version: string;
  lookaheadPlies: 0 | 1;
  searchCandidateLimit?: number;
  softPickRank: number;
  softPickWindow: number;
};

export const DROP_MINI_XIANGQI_PLAYABLE_ENGINES: readonly DropMiniXiangqiEngineTier[] = [
  {
    id: 'misty-drop-mini-level-1',
    name: 'Misty Drop Mini level 1',
    version: DROP_MINI_XIANGQI_ENGINE_VERSION,
    lookaheadPlies: 0,
    softPickRank: 2,
    softPickWindow: 35,
  },
  {
    id: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Misty Drop Mini level 2',
    version: DROP_MINI_XIANGQI_ENGINE_VERSION,
    lookaheadPlies: 0,
    softPickRank: 0,
    softPickWindow: 0,
  },
  {
    id: 'misty-drop-mini-level-3',
    name: 'Misty Drop Mini level 3',
    version: DROP_MINI_XIANGQI_ENGINE_VERSION,
    lookaheadPlies: 1,
    searchCandidateLimit: 24,
    softPickRank: 0,
    softPickWindow: 0,
  },
];

const ENGINE_BY_ID = new Map(DROP_MINI_XIANGQI_PLAYABLE_ENGINES.map((tier) => [tier.id, tier]));

const PIECE_VALUES: Record<MiniXiangqiPieceRole, number> = {
  general: 10_000,
  chariot: 90,
  cannon: 55,
  horse: 45,
  soldier: 14,
};

export function dropMiniXiangqiEngineTierFor(
  engineId: string | undefined,
): DropMiniXiangqiEngineTier | null {
  if (!engineId) return null;
  return ENGINE_BY_ID.get(engineId) ?? null;
}

export function dropMiniXiangqiEngineDisplayName(engineId: string): string {
  return dropMiniXiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function dropMiniXiangqiEngineVersion(engineId: string | undefined): string | null {
  return isDropMiniXiangqiEngineClientId(engineId) ? DROP_MINI_XIANGQI_ENGINE_VERSION : null;
}

export function isDropMiniXiangqiEngineClientId(clientId: string | undefined): boolean {
  return dropMiniXiangqiEngineTierFor(clientId) !== null;
}

export function dropMiniXiangqiEngineSeatFor(
  room: DropMiniXiangqiEngineRoom,
): MiniXiangqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isDropMiniXiangqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleDropMiniXiangqiEngineMove(
  ctx: DropMiniXiangqiEngineContext,
  room: DropMiniXiangqiEngineRoom,
): void {
  if (room.engineTimer) return;
  const seat = dropMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playDropMiniXiangqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'drop_mini_xiangqi_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Drop Mini Xiangqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playDropMiniXiangqiEngineMoveIfReady(
  ctx: DropMiniXiangqiEngineContext,
  room: DropMiniXiangqiEngineRoom,
): Promise<void> {
  const seat = dropMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = dropMiniXiangqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const chosen = chooseDropMiniXiangqiEngineMove(room.projection.state, tier);
  if (!chosen) {
    logger.error(
      {
        kind: 'drop_mini_xiangqi_engine_no_legal_move',
        room_id: room.id,
        engine_id: engineId,
      },
      'Drop Mini Xiangqi engine had no legal move',
    );
    return;
  }
  if (!engineToMove(room, seat)) return;

  const event: TenantRoomEvent<
    MiniXiangqiColor,
    DropMiniXiangqiMove,
    typeof DROP_MINI_XIANGQI_SPEC_ID
  > = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

export function chooseDropMiniXiangqiEngineMove(
  state: DropMiniXiangqiGameState,
  tier: DropMiniXiangqiEngineTier,
): DropMiniXiangqiMove | null {
  if (state.status.type !== 'playing') return null;
  const mover = state.status.turn;
  const searchMoves = searchMovesForTier(state, tier, mover);
  const candidates = searchMoves
    .map((move) => {
      const after = applyDropMiniXiangqiMove(state, move);
      return {
        move,
        score:
          tier.lookaheadPlies > 0
            ? minimax(after, tier.lookaheadPlies, mover, -Infinity, Infinity)
            : immediateMoveScore(state, after, move, mover),
      };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || moveKey(a.move).localeCompare(moveKey(b.move)));
  if (candidates.length === 0) return null;
  if (isWinningMove(state, candidates[0]!.move, mover)) return candidates[0]!.move;
  if (tier.softPickRank <= 0) return candidates[0]!.move;
  const bestScore = candidates[0]!.score;
  const softPool = candidates.filter((entry) => entry.score >= bestScore - tier.softPickWindow);
  return softPool[Math.min(tier.softPickRank, softPool.length - 1)]?.move ?? candidates[0]!.move;
}

function searchMovesForTier(
  state: DropMiniXiangqiGameState,
  tier: DropMiniXiangqiEngineTier,
  mover: MiniXiangqiColor,
): DropMiniXiangqiMove[] {
  const legal = sortedLegalMoves(state);
  if (tier.lookaheadPlies <= 0 || !tier.searchCandidateLimit) return legal;
  return legal
    .map((move) => {
      const after = applyDropMiniXiangqiMove(state, move);
      return { move, score: immediateMoveScore(state, after, move, mover) };
    })
    .sort((a, b) => b.score - a.score || moveKey(a.move).localeCompare(moveKey(b.move)))
    .slice(0, tier.searchCandidateLimit)
    .map((entry) => entry.move);
}

function bothSeatsFilled(room: DropMiniXiangqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: DropMiniXiangqiEngineRoom, seat: MiniXiangqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function sortedLegalMoves(state: DropMiniXiangqiGameState): DropMiniXiangqiMove[] {
  return [...getLegalDropMiniXiangqiMoves(state)].sort((a, b) =>
    moveKey(a).localeCompare(moveKey(b)),
  );
}

function minimax(
  state: DropMiniXiangqiGameState,
  depth: number,
  root: MiniXiangqiColor,
  alpha: number,
  beta: number,
): number {
  const terminal = terminalScore(state, root);
  if (terminal !== null) return terminal;
  if (depth <= 0 || state.status.type !== 'playing') return evaluateState(state, root, false);

  const maximizing = state.status.turn === root;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of sortedLegalMoves(state)) {
    const score = minimax(applyDropMiniXiangqiMove(state, move), depth - 1, root, alpha, beta);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function immediateMoveScore(
  before: DropMiniXiangqiGameState,
  after: DropMiniXiangqiGameState,
  move: DropMiniXiangqiMove,
  mover: MiniXiangqiColor,
): number {
  const terminal = terminalScore(after, mover);
  if (terminal !== null) return terminal;
  let score = evaluateState(after, mover) - evaluateState(before, mover);
  if (!isDropMiniXiangqiDropMove(move)) {
    const captured = before.board[move.to];
    if (captured) score += PIECE_VALUES[captured.role] * 1.8;
  } else {
    score += dropRoleValue(move.drop) * 0.35;
  }
  const opponent = mover === 'red' ? 'black' : 'red';
  if (isDropMiniXiangqiGeneralInCheck(after, opponent)) score += 35;
  return score;
}

function evaluateState(
  state: DropMiniXiangqiGameState,
  perspective: MiniXiangqiColor,
  includeMobility = true,
): number {
  const terminal = terminalScore(state, perspective);
  if (terminal !== null) return terminal;

  const opponent = perspective === 'red' ? 'black' : 'red';
  let score = 0;
  for (const piece of Object.values(state.board)) {
    if (!piece) continue;
    const value = PIECE_VALUES[piece.role];
    score += piece.color === perspective ? value : -value;
  }
  score += handScore(state, perspective) - handScore(state, opponent);

  if (isDropMiniXiangqiGeneralInCheck(state, perspective)) score -= 40;
  if (isDropMiniXiangqiGeneralInCheck(state, opponent)) score += 35;
  if (includeMobility && state.status.type === 'playing') {
    score += legalCountFor(state, perspective) * 0.4;
    score -= legalCountFor(state, opponent) * 0.35;
  }
  return score;
}

function handScore(state: DropMiniXiangqiGameState, color: MiniXiangqiColor): number {
  let score = 0;
  for (const [role, count] of Object.entries(state.hands[color])) {
    score += dropRoleValue(role as DropMiniXiangqiDropRole) * (count ?? 0) * 0.85;
  }
  for (const [role, count] of Object.entries(state.cooldownHands[color])) {
    score += dropRoleValue(role as DropMiniXiangqiDropRole) * (count ?? 0) * 0.55;
  }
  return score;
}

function legalCountFor(state: DropMiniXiangqiGameState, color: MiniXiangqiColor): number {
  if (state.status.type !== 'playing') return 0;
  return getLegalDropMiniXiangqiMoves({ ...state, status: { type: 'playing', turn: color } })
    .length;
}

function terminalScore(
  state: DropMiniXiangqiGameState,
  perspective: MiniXiangqiColor,
): number | null {
  if (state.status.type === 'aborted') return 0;
  if (state.status.type !== 'finished') return null;
  if (state.status.winner === perspective) return 100_000;
  if (state.status.winner === null) return 0;
  return -100_000;
}

function isWinningMove(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiMove,
  mover: MiniXiangqiColor,
): boolean {
  const after = applyDropMiniXiangqiMove(state, move);
  return after.status.type === 'finished' && after.status.winner === mover;
}

function dropRoleValue(role: DropMiniXiangqiDropRole): number {
  return PIECE_VALUES[role];
}

function moveKey(move: DropMiniXiangqiMove): string {
  if (isDropMiniXiangqiDropMove(move)) return `@${move.drop}:${move.to}`;
  return `${move.from}-${move.to}`;
}
