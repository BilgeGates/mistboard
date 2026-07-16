/**
 * banqi-fen.ts is the REDACTION BOUNDARY for the MistyBanqi engine: it must emit
 * exactly what the engine is allowed to observe, on the server AND in the browser
 * (the wasm client engine). A regression here leaks face-down tile identity to an
 * untrusted client. These tests pin the wire grammar (defined jointly with the
 * engine, so role chars are hardcoded HERE, independent of the encoder's tables)
 * and the redaction properties:
 *
 *   1. a face-down tile only ever reaches the FEN as the identity-free 'X';
 *   2. the pool field carries per-(ink, role) COUNTS of the face-down multiset,
 *      which are public (start - revealed - captured, derivable by both seats);
 *   3. the FEN is invariant under any permutation of the hidden identities among
 *      the face-down squares. That is the "same boundary for both sides" contract
 *      in its strongest form: the encoding depends only on information BOTH seats
 *      (and any spectator) already have, so neither side can learn the deal from it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { banqiMoveToEngineUci, banqiStateToEngineFen, engineUciToBanqiMove } from './banqi-fen.js';
import {
  applyBanqiMove,
  type BanqiGameState,
  type BanqiMove,
  type BanqiPiece,
  type BanqiPieceRole,
  type BanqiSquare,
  banqiMoverInk,
  banqiSquareOf,
  createBanqiDeal,
  createInitialBanqiState,
  getBanqiLegalMoves,
} from './variants-banqi.js';

// Wire grammar pins (from the engine's FEN section), deliberately NOT imported
// from the encoder: the test must fail if the encoder's tables drift.
const ROLE_CHAR: Record<BanqiPieceRole, string> = {
  general: 'G',
  advisor: 'A',
  elephant: 'E',
  chariot: 'R',
  horse: 'H',
  cannon: 'C',
  soldier: 'S',
};
const FACE_DOWN_TOKEN = 'X';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function expectedChar(piece: BanqiPiece): string {
  if (piece.faceDown) return FACE_DOWN_TOKEN;
  const ch = ROLE_CHAR[piece.role];
  return piece.color === 'red' ? ch : ch.toLowerCase();
}

// Expand the board field back into a per-square token map (rank 4 first, files
// a..h within a rank, digits = empty runs), so each square can be checked against
// canonical state independently of run-length details.
function expandBoardField(field: string): Map<BanqiSquare, string> {
  const rows = field.split('/');
  assert.equal(rows.length, 4, 'board field has 4 ranks');
  const bySquare = new Map<BanqiSquare, string>();
  rows.forEach((row, i) => {
    const rank = 4 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      bySquare.set(banqiSquareOf(file, rank), ch);
      file += 1;
    }
    assert.equal(file, 8, `rank ${rank} covers 8 files`);
  });
  return bySquare;
}

// Parse the pool field ('-' or <char><count> pairs) into a (char -> count) map.
function parsePoolField(field: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (field === '-') return counts;
  const pair = /([A-Za-z])(\d+)/g;
  let matchedLength = 0;
  for (const m of field.matchAll(pair)) {
    counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + Number(m[2]!));
    matchedLength += m[0]!.length;
  }
  assert.equal(matchedLength, field.length, `pool field is only <char><count> pairs: ${field}`);
  return counts;
}

// The full contract check for one canonical state.
function assertFenMatchesContract(state: BanqiGameState): void {
  const fen = banqiStateToEngineFen(state);
  const fields = fen.split(' ');
  assert.equal(fields.length, 5, `5 space-separated fields: ${fen}`);
  const [boardField, turnField, poolField, clockField, moveNumField] = fields;

  // Board: face-down squares are the identity-free token; revealed squares are
  // their exact role char + ink case; empties are absent.
  const bySquare = expandBoardField(boardField!);
  for (const [square, piece] of Object.entries(state.board) as [BanqiSquare, BanqiPiece][]) {
    if (!piece) continue;
    assert.equal(
      bySquare.get(square),
      expectedChar(piece),
      piece.faceDown
        ? `face-down ${square} must encode as '${FACE_DOWN_TOKEN}' (identity hidden)`
        : `revealed ${square} encodes its identity`,
    );
  }
  assert.equal(
    bySquare.size,
    Object.values(state.board).filter(Boolean).length,
    'every occupied square (and nothing else) appears on the board field',
  );

  // Redaction core: identity characters appear on the board field ONLY for
  // revealed pieces; the face-down population is exactly the X count.
  const revealedCount = Object.values(state.board).filter((p) => p && !p.faceDown).length;
  const faceDownCount = Object.values(state.board).filter((p) => p?.faceDown).length;
  const boardChars = [...bySquare.values()];
  assert.equal(boardChars.filter((c) => c !== FACE_DOWN_TOKEN).length, revealedCount);
  assert.equal(boardChars.filter((c) => c === FACE_DOWN_TOKEN).length, faceDownCount);

  // Pool: per-(ink, role) counts of the face-down multiset, nothing more. These
  // counts are public information; the ARRANGEMENT (which square holds what) is
  // the secret and must not be recoverable (see the permutation test).
  const expectedPool = new Map<string, number>();
  for (const piece of Object.values(state.board)) {
    if (!piece?.faceDown) continue;
    const ch = piece.color === 'red' ? ROLE_CHAR[piece.role] : ROLE_CHAR[piece.role].toLowerCase();
    expectedPool.set(ch, (expectedPool.get(ch) ?? 0) + 1);
  }
  const pool = parsePoolField(poolField!);
  assert.deepEqual(
    Object.fromEntries([...pool.entries()].sort()),
    Object.fromEntries([...expectedPool.entries()].sort()),
    'pool is exactly the face-down (ink, role) multiset',
  );
  const poolTotal = [...pool.values()].reduce((a, b) => a + b, 0);
  assert.equal(poolTotal, faceDownCount, 'sum(pool) === face-down count on the board');

  // Turn / clock / movenum mirror canonical state.
  const ink = banqiMoverInk(state);
  assert.equal(turnField, ink === null ? '-' : ink === 'red' ? 'r' : 'b');
  assert.equal(clockField, String(state.noProgressClock));
  assert.equal(moveNumField, String(state.moveNumber));
}

// A short seeded game trace: every state from the deal up to `maxPlies` moves.
function seededTrace(seed: number, maxPlies: number): BanqiGameState[] {
  const rng = seeded(seed);
  const deal = createBanqiDeal(seeded(seed * 31 + 7));
  let state = createInitialBanqiState(`fen-prop-${seed}`, deal);
  const states = [state];
  for (let ply = 0; ply < maxPlies && state.status.type === 'playing'; ply += 1) {
    const legal = getBanqiLegalMoves(state);
    if (legal.length === 0) break;
    state = applyBanqiMove(state, legal[Math.floor(rng() * legal.length)]!);
    states.push(state);
  }
  return states;
}

test('a fresh deal (all face-down) encodes with zero identity characters', () => {
  const state = createInitialBanqiState('fen-fresh', createBanqiDeal(seeded(42)));
  // Full grammar pin: 32 identity-free tiles, unbound turn, the complete public
  // pool (the standard banqi set), fresh clocks. Any identity char here is a leak.
  assert.equal(
    banqiStateToEngineFen(state),
    'XXXXXXXX/XXXXXXXX/XXXXXXXX/XXXXXXXX - G1A2E2R2H2C2S5g1a2e2r2h2c2s5 0 1',
  );
});

test('every position of a seeded game satisfies the redaction contract', () => {
  for (const seed of [1, 7, 1234]) {
    for (const state of seededTrace(seed, 60)) {
      assertFenMatchesContract(state);
    }
  }
});

test('the FEN is invariant under permutation of the hidden identities (both seats see one boundary)', () => {
  for (const seed of [3, 99]) {
    const states = seededTrace(seed, 40);
    for (const state of states) {
      const faceDownSquares = (Object.keys(state.board) as BanqiSquare[]).filter(
        (sq) => state.board[sq]?.faceDown,
      );
      if (faceDownSquares.length < 2) continue;
      // Reassign the face-down identities among the face-down squares (a rotation,
      // so at least some squares change identity when identities differ). The
      // multiset is unchanged; only the secret arrangement moves.
      const rotated: BanqiGameState = { ...state, board: { ...state.board } };
      faceDownSquares.forEach((sq, i) => {
        const donor = state.board[faceDownSquares[(i + 1) % faceDownSquares.length]!]!;
        rotated.board[sq] = { color: donor.color, role: donor.role, faceDown: true };
      });
      assert.equal(
        banqiStateToEngineFen(rotated),
        banqiStateToEngineFen(state),
        'permuting hidden identities must not change the engine FEN',
      );
    }
  }
});

test('move encoding round-trips for every legal move of sampled positions', () => {
  for (const seed of [5, 21]) {
    for (const state of seededTrace(seed, 20)) {
      if (state.status.type !== 'playing') continue;
      for (const move of getBanqiLegalMoves(state)) {
        const uci = banqiMoveToEngineUci(move);
        assert.match(uci, /^[a-h][0-3][a-h][0-3]$/, 'engine UCI is rank 0..3');
        assert.deepEqual(engineUciToBanqiMove(uci), move);
      }
    }
  }
  // Spot pins for the rank shift (platform rank 1..4 -> engine rank 0..3).
  const flip: BanqiMove = { from: 'a1', to: 'a1' };
  assert.equal(banqiMoveToEngineUci(flip), 'a0a0');
  assert.equal(banqiMoveToEngineUci({ from: 'h4', to: 'g4' }), 'h3g3');
});

test('engineUciToBanqiMove rejects malformed or out-of-board tokens', () => {
  for (const bad of ['', 'a0a', 'a0a9', 'i0a0', 'a4a0', 'a0-b0', 'A0B0']) {
    assert.equal(engineUciToBanqiMove(bad), null, `must reject '${bad}'`);
  }
  // Whitespace is tolerated (trim), casing is not.
  assert.deepEqual(engineUciToBanqiMove(' a0b0 '), { from: 'a1', to: 'b1' });
});
