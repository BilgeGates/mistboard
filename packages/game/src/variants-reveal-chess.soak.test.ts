import assert from 'node:assert/strict';
import test from 'node:test';
import type { Square } from './types.js';
import {
  applyRevealChessMove,
  createInitialRevealChessState,
  createRevealChessDeal,
  getRevealChessLegalMoves,
  getRevealChessPlayerView,
  oppositeRevealChessColor,
  type RevealChessGameState,
  type RevealChessMove,
} from './variants-reveal-chess.js';

// Seeded PRNG so soak runs are deterministic without Math.random.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLY_CAP = 400;

function playRandomGame(seed: number): { moves: RevealChessMove[]; state: RevealChessGameState } {
  const rng = mulberry32(seed);
  let state = createInitialRevealChessState(
    `soak-${seed}`,
    createRevealChessDeal(mulberry32(seed * 7 + 1)),
  );
  const moves: RevealChessMove[] = [];

  for (let ply = 0; ply < PLY_CAP && state.status.type === 'playing'; ply += 1) {
    const mover = state.status.turn;
    const legal = getRevealChessLegalMoves(state);

    // Invariant: a non-terminal position always has at least one legal move.
    assert.ok(legal.length > 0, `seed ${seed} ply ${ply}: playing with no legal moves`);

    // Invariant: both kings present while playing.
    assert.ok(findKing(state, 'white'), `seed ${seed} ply ${ply}: white king missing`);
    assert.ok(findKing(state, 'black'), `seed ${seed} ply ${ply}: black king missing`);

    checkHiddenInfoInvariants(state, seed, ply);

    // Capture-biased random policy so material drains and games terminate (a
    // capture has an ENEMY piece on the destination; castling's own corner piece
    // does not count). Paired with a short no-progress limit below.
    const capturing = legal.filter((m) => state.board[m.to] && state.board[m.to]?.color !== mover);
    const pool = capturing.length > 0 && rng() < 0.7 ? capturing : legal;
    const move = pool[Math.floor(rng() * pool.length)];
    moves.push(move);
    state = applyRevealChessMove(state, move, { noProgressClockLimit: 40 });

    // Invariant: you never leave your own king in check.
    assert.equal(
      getRevealChessPlayerView(state, mover).inCheck,
      false,
      `seed ${seed} ply ${ply}: ${mover} left its own king in check`,
    );
    // Invariant: turn alternates while play continues.
    if (state.status.type === 'playing') {
      assert.equal(state.status.turn, oppositeRevealChessColor(mover));
    }
  }

  return { moves, state };
}

function findKing(state: RevealChessGameState, color: 'white' | 'black'): boolean {
  return Object.values(state.board).some((p) => p?.color === color && p.role === 'king');
}

function checkHiddenInfoInvariants(state: RevealChessGameState, seed: number, ply: number): void {
  // Piece conservation: board + captured = 32 at all times.
  const onBoard = Object.keys(state.board).length;
  assert.equal(
    onBoard + state.captures.length,
    32,
    `seed ${seed} ply ${ply}: piece count ${onBoard}+${state.captures.length} != 32`,
  );

  const whiteView = getRevealChessPlayerView(state, 'white');
  const blackView = getRevealChessPlayerView(state, 'black');

  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece) continue;
    const square = sq as Square;
    const wEntry = whiteView.board[square];
    const bEntry = blackView.board[square];
    assert.ok(wEntry && bEntry, `seed ${seed} ply ${ply}: missing view entry at ${square}`);
    // Both seats see identical masked entries (positions public; only identity hidden).
    assert.deepEqual(wEntry, bEntry, `seed ${seed} ply ${ply}: asymmetric view at ${square}`);
    if (piece.faceDown) {
      assert.equal((wEntry as { faceDown: boolean }).faceDown, true);
      assert.ok(
        !('role' in (wEntry as object)),
        `seed ${seed} ply ${ply}: leaked role at ${square}`,
      );
    } else {
      assert.equal((wEntry as { role?: string }).role, piece.role);
    }
  }

  // Capturer-only reveal: a still-face-down capture is known to the capturer only.
  state.captures.forEach((cap, i) => {
    const capturer = oppositeRevealChessColor(cap.owner);
    const capturerView = capturer === 'white' ? whiteView : blackView;
    const ownerView = cap.owner === 'white' ? whiteView : blackView;
    assert.equal(
      capturerView.captured[i].role,
      cap.role,
      `seed ${seed}: capturer should know capture ${i}`,
    );
    if (!cap.revealedAtCapture) {
      assert.equal(
        ownerView.captured[i].role,
        null,
        `seed ${seed}: owner must not learn dark capture ${i}`,
      );
    }
  });
}

test('soak: random legal games terminate with hidden-info invariants intact', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const { state } = playRandomGame(seed);
    assert.equal(
      state.status.type,
      'finished',
      `seed ${seed}: game did not finish within ${PLY_CAP} plies`,
    );
  }
});

test('soak: same seed reproduces the same game and outcome', () => {
  for (const seed of [3, 11, 27]) {
    const a = playRandomGame(seed);
    const b = playRandomGame(seed);
    assert.deepEqual(a.moves, b.moves, `seed ${seed}: move sequence not reproducible`);
    assert.deepEqual(a.state.status, b.state.status, `seed ${seed}: outcome not reproducible`);
  }
});
