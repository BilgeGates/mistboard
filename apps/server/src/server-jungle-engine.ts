/**
 * Built-in Jungle (Dou Shou Qi) PvE loop.
 *
 * Jungle is perfect-information and deterministic with a ~20 branching factor, so
 * the bot is a plain depth-limited alpha-beta search over the rules kernel — no
 * Python, no Fairy-Stockfish (FSF has no Dou Shou Qi variant). These tiers run
 * IN-PROCESS and inject moves through the same tenant append+broadcast path as a
 * human move (mirrors server-drop-mini-xiangqi-engine.ts).
 */

import {
  applyJungleMove,
  getJungleLegalMoves,
  JUNGLE_DENS,
  type JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePieceRole,
  type JungleSquare,
  jungleCoordOf,
  jungleTrapOwner,
  oppositeJungleColor,
} from '@mistboard/game';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

export const JUNGLE_ENGINE_VERSION = '0.1.0';
export const JUNGLE_DEFAULT_ENGINE_ID = 'misty-jungle-level-2';

type JungleEngineRoom = TenantLiveRoom<
  'jungle',
  JungleColor,
  JungleMove,
  JungleGameState,
  typeof JUNGLE_SPEC_ID
>;
type JungleEngineContext = TenantLifecycleContext<
  JungleColor,
  JungleMove,
  JungleGameState,
  typeof JUNGLE_SPEC_ID,
  JungleEngineRoom
>;

export type JungleEngineTier = {
  id: string;
  name: string;
  version: string;
  depth: number;
  // Easy tiers don't always pick the best move: choose the Nth move within
  // `softPickWindow` of the best score (0/0 = always best).
  softPickRank: number;
  softPickWindow: number;
};

export const JUNGLE_PLAYABLE_ENGINES: readonly JungleEngineTier[] = [
  {
    id: 'misty-jungle-level-1',
    name: 'Misty Jungle level 1',
    version: JUNGLE_ENGINE_VERSION,
    depth: 2,
    softPickRank: 2,
    softPickWindow: 60,
  },
  {
    id: JUNGLE_DEFAULT_ENGINE_ID,
    name: 'Misty Jungle level 2',
    version: JUNGLE_ENGINE_VERSION,
    depth: 3,
    softPickRank: 0,
    softPickWindow: 0,
  },
  {
    id: 'misty-jungle-level-3',
    name: 'Misty Jungle level 3',
    version: JUNGLE_ENGINE_VERSION,
    depth: 4,
    softPickRank: 0,
    softPickWindow: 0,
  },
];

const ENGINE_BY_ID = new Map(JUNGLE_PLAYABLE_ENGINES.map((tier) => [tier.id, tier]));

// Overall piece strength. The rat is boosted well above its rank-1 floor: it kills
// the elephant and swims, so it carries outsized tactical weight.
const PIECE_VALUES: Record<JunglePieceRole, number> = {
  rat: 65,
  cat: 22,
  dog: 30,
  wolf: 40,
  leopard: 50,
  tiger: 75,
  lion: 90,
  elephant: 100,
};

const WIN = 1_000_000;
// Search-node ceiling per move; alpha-beta + capture ordering stays far below this
// at the shipped depths, but it bounds any pathological branch so a turn can't hang.
const NODE_CAP = 150_000;

export function jungleEngineTierFor(engineId: string | undefined): JungleEngineTier | null {
  if (!engineId) return null;
  return ENGINE_BY_ID.get(engineId) ?? null;
}

export function jungleEngineDisplayName(engineId: string): string {
  return jungleEngineTierFor(engineId)?.name ?? engineId;
}

export function jungleEngineVersion(engineId: string | undefined): string | null {
  return isJungleEngineClientId(engineId) ? JUNGLE_ENGINE_VERSION : null;
}

export function isJungleEngineClientId(clientId: string | undefined): boolean {
  return jungleEngineTierFor(clientId) !== null;
}

export function jungleEngineSeatFor(room: JungleEngineRoom): JungleColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isJungleEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleJungleEngineMove(ctx: JungleEngineContext, room: JungleEngineRoom): void {
  if (room.engineTimer) return;
  const seat = jungleEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playJungleEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        { kind: 'jungle_engine_move_failure', room_id: room.id, error: (err as Error).message },
        'Jungle engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playJungleEngineMoveIfReady(
  ctx: JungleEngineContext,
  room: JungleEngineRoom,
): Promise<void> {
  const seat = jungleEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = jungleEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const chosen = chooseJungleEngineMove(room.projection.state, tier);
  if (!chosen) {
    logger.error(
      { kind: 'jungle_engine_no_legal_move', room_id: room.id, engine_id: engineId },
      'Jungle engine had no legal move',
    );
    return;
  }
  if (!engineToMove(room, seat)) return;

  const event: TenantRoomEvent<JungleColor, JungleMove, typeof JUNGLE_SPEC_ID> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

export function chooseJungleEngineMove(
  state: JungleGameState,
  tier: JungleEngineTier,
): JungleMove | null {
  if (state.status.type !== 'playing') return null;
  const mover = state.status.turn;
  const budget = { nodes: 0 };
  const candidates = orderedMoves(state, mover)
    .map((move) => {
      const after = applyJungleMove(state, move);
      return {
        move,
        score: -negamax(after, tier.depth - 1, -WIN, WIN, oppositeJungleColor(mover), budget),
      };
    })
    .sort((a, b) => b.score - a.score || moveKey(a.move).localeCompare(moveKey(b.move)));
  if (candidates.length === 0) return null;
  if (isWinningMove(state, candidates[0]!.move, mover)) return candidates[0]!.move;
  if (tier.softPickRank <= 0) return candidates[0]!.move;
  const bestScore = candidates[0]!.score;
  const softPool = candidates.filter((entry) => entry.score >= bestScore - tier.softPickWindow);
  return softPool[Math.min(tier.softPickRank, softPool.length - 1)]?.move ?? candidates[0]!.move;
}

// Negamax with alpha-beta. Returns the value from `mover`'s perspective.
function negamax(
  state: JungleGameState,
  depth: number,
  alpha: number,
  beta: number,
  mover: JungleColor,
  budget: { nodes: number },
): number {
  if (state.status.type === 'finished') {
    if (state.status.winner === mover) return WIN - 1;
    if (state.status.winner === null) return 0;
    return -(WIN - 1);
  }
  if (state.status.type !== 'playing') return 0;
  budget.nodes += 1;
  if (depth <= 0 || budget.nodes > NODE_CAP) return evaluate(state, mover);

  let best = -WIN;
  for (const move of orderedMoves(state, mover)) {
    const value = -negamax(
      applyJungleMove(state, move),
      depth - 1,
      -beta,
      -alpha,
      oppositeJungleColor(mover),
      budget,
    );
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Static evaluation from `perspective`'s side: material + advance-toward-the-enemy-den
// + trap vulnerability. Den distance is the dominant positional driver (the win is a
// race to the opponent's den).
function evaluate(state: JungleGameState, perspective: JungleColor): number {
  const opponent = oppositeJungleColor(perspective);
  const ownDen = jungleCoordOf(JUNGLE_DENS[perspective]);
  const enemyDen = jungleCoordOf(JUNGLE_DENS[opponent]);
  let score = 0;
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece) continue;
    const value = PIECE_VALUES[piece.role];
    const { file, rank } = jungleCoordOf(sq as JungleSquare);
    const friendly = piece.color === perspective;
    score += friendly ? value : -value;
    // Advancement: reward our pieces closing on the enemy den, penalise theirs
    // closing on ours. Adjacency to the den is nearly decisive.
    const target = friendly ? enemyDen : ownDen;
    const dist = Math.abs(file - target.file) + Math.abs(rank - target.rank);
    const advance = dist <= 1 ? 200 : (16 - dist) * 1.5;
    score += friendly ? advance : -advance;
    // A piece on the OPPONENT's trap is rank 0 (capturable by anything): risky for us,
    // good when it's their piece sitting in our trap.
    if (jungleTrapOwner(sq as JungleSquare) === (friendly ? opponent : perspective)) {
      score += friendly ? -value * 0.5 : value * 0.5;
    }
  }
  return score;
}

// Captures first (then deterministic key order) so alpha-beta prunes hard.
function orderedMoves(state: JungleGameState, mover: JungleColor): JungleMove[] {
  const moves = getJungleLegalMoves({ ...state, status: { type: 'playing', turn: mover } });
  return moves
    .map((move) => ({ move, cap: state.board[move.to] ? 1 : 0 }))
    .sort((a, b) => b.cap - a.cap || moveKey(a.move).localeCompare(moveKey(b.move)))
    .map((entry) => entry.move);
}

function isWinningMove(state: JungleGameState, move: JungleMove, mover: JungleColor): boolean {
  const after = applyJungleMove(state, move);
  return after.status.type === 'finished' && after.status.winner === mover;
}

function bothSeatsFilled(room: JungleEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: JungleEngineRoom, seat: JungleColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function moveKey(move: JungleMove): string {
  return `${move.from}-${move.to}`;
}
