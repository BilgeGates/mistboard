// Self-play soak + property checks for the jieqi kernel. Random legal games are
// played to termination with invariants asserted every ply — this is what turns
// "the hand-picked cases pass" into confidence the kernel can't generate an
// illegal state, leak a hidden identity, or fail to terminate.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyJieqiMove,
  createInitialJieqiState,
  findJieqiGeneral,
  getJieqiLegalMoves,
  getJieqiPlayerView,
  type JieqiColor,
  type JieqiDeal,
  type JieqiGameState,
  type JieqiSquare,
  oppositeJieqiColor,
  STANDARD_JIEQI_DEAL,
} from './variants-jieqi.js';

// mulberry32 — a small deterministic PRNG so failures are reproducible by seed.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomDeal(rng: () => number): JieqiDeal {
  return {
    red: shuffled(STANDARD_JIEQI_DEAL.red, rng),
    black: shuffled(STANDARD_JIEQI_DEAL.black, rng),
  };
}

// Shorten quiet phases so random games terminate quickly without changing rules.
const SOAK_NO_CAPTURE_LIMIT = 30;

function assertInvariants(state: JieqiGameState): void {
  // Conservation: every piece is either on the board or in the capture log.
  assert.equal(
    Object.keys(state.board).length + state.captures.length,
    32,
    'piece conservation (board + captured === 32)',
  );

  const redView = getJieqiPlayerView(state, 'red');
  const blackView = getJieqiPlayerView(state, 'black');

  // A view never carries a role for a dark piece, and always carries one for a
  // revealed piece.
  for (const view of [redView, blackView]) {
    for (const entry of Object.values(view.board)) {
      if (!entry) continue;
      if (entry.faceDown) assert.ok(!('role' in entry), 'dark entry must not carry a role');
      else assert.ok('role' in entry, 'revealed entry must carry a role');
    }
  }

  // Both players see identical masked entries on dark squares.
  for (const [sq, piece] of Object.entries(state.board)) {
    if (piece?.faceDown) {
      assert.deepEqual(
        redView.board[sq as JieqiSquare],
        blackView.board[sq as JieqiSquare],
        'dark squares must look identical to both players',
      );
    }
  }

  // Capturer-only redaction matches the raw capture log.
  state.captures.forEach((c, i) => {
    const capturerView = c.owner === 'red' ? blackView : redView;
    const ownerView = c.owner === 'red' ? redView : blackView;
    assert.equal(capturerView.captured[i].role, c.role, 'capturer sees the captured identity');
    assert.equal(
      ownerView.captured[i].role,
      c.revealedAtCapture ? c.role : null,
      'owner only sees a loss that was already revealed',
    );
  });

  if (state.status.type === 'playing') {
    assert.ok(findJieqiGeneral(state.board, 'red'), 'red general present while playing');
    assert.ok(findJieqiGeneral(state.board, 'black'), 'black general present while playing');
  }
}

function playRandomGame(seed: number, maxPlies = 2000) {
  const rng = makeRng(seed);
  let state = createInitialJieqiState(`soak-${seed}`, randomDeal(rng));
  const moves: string[] = [];
  let prevTurn: JieqiColor | null = null;
  let plies = 0;

  assertInvariants(state);
  while (state.status.type === 'playing' && plies < maxPlies) {
    const turn = state.status.turn;
    if (prevTurn) assert.equal(turn, oppositeJieqiColor(prevTurn), 'turns alternate');

    const legal = getJieqiLegalMoves(state);
    assert.ok(legal.length > 0, 'a playing state must have at least one legal move');

    const move = legal[Math.floor(rng() * legal.length)];
    const next = applyJieqiMove(state, move, { noCaptureClockLimit: SOAK_NO_CAPTURE_LIMIT });
    assert.notEqual(next, state, 'applying a legal move must produce a new state');

    // The mover may never leave its own general capturable: once it is the
    // opponent's turn, no opponent reply should land on the mover's general.
    if (next.status.type === 'playing') {
      const myGeneral = findJieqiGeneral(next.board, turn);
      assert.ok(myGeneral, 'mover keeps a general');
      assert.ok(
        !getJieqiLegalMoves(next).some((m) => m.to === myGeneral),
        'a legal move must not leave the mover in check',
      );
    }

    moves.push(`${move.from}${move.to}`);
    prevTurn = turn;
    state = next;
    plies += 1;
    assertInvariants(state);
  }

  assert.equal(
    state.status.type,
    'finished',
    `game ${seed} did not terminate within ${maxPlies} plies`,
  );
  return { status: state.status, moves, plies };
}

test('self-play soak: random legal games hold every invariant and terminate', () => {
  const reasons = new Set<string>();
  for (let seed = 1; seed <= 20; seed += 1) {
    const { status } = playRandomGame(seed);
    if (status.type === 'finished') reasons.add(status.reason);
  }
  // The soak should reach real terminal conditions, not just spin.
  assert.ok(reasons.size >= 1, 'expected at least one terminal reason across the soak');
});

test('self-play is deterministic for a fixed seed', () => {
  const a = playRandomGame(12345);
  const b = playRandomGame(12345);
  assert.deepEqual(a.moves, b.moves);
  assert.deepEqual(a.status, b.status);
});
