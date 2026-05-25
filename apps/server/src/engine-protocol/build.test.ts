/**
 * Redaction tests for the engine-protocol build function.
 *
 * THIS IS THE SECURITY GATE. The engine-protocol build function is the
 * sole channel through which canonical room state becomes information
 * the engine sees. These tests assert what the engine MUST NOT receive.
 *
 * Until all of these pass, do not extract the first-party engine to the
 * private sibling repo (Phase 5). With them green, the redaction contract
 * is durably enforced regardless of how engines are deployed.
 *
 * Test list:
 *   1. EngineTurnRequest has no GameState / GameEvent reference fields
 *   2. Every square index in any observation lies within visibility_mask
 *   3. Opp move entirely off-visibility produces no reference to opp's
 *      from-square or to-square in the observation
 *   4. Opp capture of own piece on hidden square redacts the landing
 *      (own_capture_square set, opp_capture_landing_square null)
 *   5. engineSeed is deterministic from engineSecret + game/engine/color/ply
 *      and does NOT come from any room master seed
 *   6. observationTranscript replay preserves truth-in-perspective (the
 *      visible pieces match the canonical board restricted to visibility)
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  darkChessVariant,
  type Color,
  type EngineObservation,
  type GameEvent,
  type GameState,
  type Move,
  type Square,
} from '@mistboard/game';
import {
  buildEngineTurnRequest,
  buildObservationForPly,
  buildObservationTranscript,
  buildSessionId,
  deriveEngineSeed,
  squareIndex,
} from './build.js';

const ROOM_ID = 'redaction-test-room';
const ENGINE_ID = 'engine-v2-test';
const ENGINE_SECRET = 'test-secret-not-real';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function makeStartingState(): GameState {
  return darkChessVariant.createInitialState(ROOM_ID);
}

function applyMoveToState(state: GameState, move: Move): GameState {
  return darkChessVariant.applyMove(state, move);
}

function moveEvent(state: GameState, move: Move, at: number): GameEvent {
  const mover = state.status.type === 'playing' ? state.status.turn : 'white';
  return {
    type: 'move-played',
    at,
    roomId: ROOM_ID,
    color: mover,
    move,
  };
}

function visibilityBits(maskHex: string): Set<number> {
  const mask = BigInt(maskHex);
  const out = new Set<number>();
  for (let i = 0; i < 64; i++) {
    if ((mask & (1n << BigInt(i))) !== 0n) out.add(i);
  }
  return out;
}

function indexToSquare(i: number): Square {
  const file = FILES[i % 8];
  const rank = String(Math.floor(i / 8) + 1);
  return `${file}${rank}` as Square;
}

// ---------------------------------------------------------------------------
// 1. No GameState / GameEvent references
// ---------------------------------------------------------------------------

test('redaction#1: EngineTurnRequest contains no GameState or GameEvent fields', () => {
  const state = makeStartingState();
  const events: GameEvent[] = [];
  const req = buildEngineTurnRequest({
    gameId: ROOM_ID,
    engineId: ENGINE_ID,
    engineSecret: ENGINE_SECRET,
    engineColor: 'white',
    state,
    events,
    ply: 0,
    cold: true,
  });

  const json = JSON.parse(JSON.stringify(req));
  const top = Object.keys(json);
  // Allow-list of fields the protocol defines. Anything else is a leak surface.
  const allowed = new Set([
    'protocolVersion',
    'gameId',
    'engineId',
    'sessionId',
    'color',
    'ply',
    'engineSeed',
    'clock',
    'legalMoves',
    'observationTranscript',
    'latestObservationDelta',
  ]);
  for (const k of top) {
    assert.ok(allowed.has(k), `EngineTurnRequest contains unexpected field: ${k}`);
  }

  // Deep-check: no nested field name like "state" / "events" / "board" that
  // would suggest canonical leakage.
  function scan(obj: unknown, path: string): void {
    if (obj === null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const child = `${path}.${k}`;
      assert.ok(
        k !== 'GameState' && k !== 'state' && k !== 'events' && k !== 'rawState',
        `forbidden field ${child} appears in request`,
      );
      scan(v, child);
    }
  }
  scan(json, '$');
});

// ---------------------------------------------------------------------------
// 2. Square indices in observations are within visibility_mask
// ---------------------------------------------------------------------------

test('redaction#2: all squares in visible_pieces and capture fields are within visibility_mask', () => {
  let state = makeStartingState();
  const events: GameEvent[] = [];
  // Play a few moves to get an interesting position.
  const moves: Array<[string, string]> = [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
  ];
  let ply = 0;
  for (const [from, to] of moves) {
    const mv: Move = { from: from as Square, to: to as Square };
    events.push(moveEvent(state, mv, ply));
    state = applyMoveToState(state, mv);
    ply += 1;
  }

  for (const color of ['white', 'black'] as Color[]) {
    const transcript = buildObservationTranscript({
      variantId: 'dark-chess',
      roomId: ROOM_ID,
      events,
      perspective: color,
    });
    for (const obs of transcript) {
      const visible = visibilityBits(obs.visibility_mask);
      for (const [sqIdx] of obs.visible_pieces) {
        assert.ok(
          visible.has(sqIdx),
          `[${color}] ply ${obs.ply}: visible_pieces square ${sqIdx} (${indexToSquare(sqIdx)}) not in visibility_mask`,
        );
      }
      if (obs.opp_capture_landing_square !== null) {
        assert.ok(
          visible.has(obs.opp_capture_landing_square),
          `[${color}] ply ${obs.ply}: opp_capture_landing_square ${obs.opp_capture_landing_square} not in visibility_mask`,
        );
      }
      // own_capture_square may be outside the visibility_mask: the player
      // KNOWS the square (their own piece was there) but it's now empty +
      // possibly invisible. That's by design and matches the Python
      // Observation semantics.
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Opp move entirely off-visibility leaks nothing
// ---------------------------------------------------------------------------

test('redaction#3: opp move entirely off-visibility does not leak from/to', () => {
  // Construct a position where it's BLACK to move and BLACK's move
  // h7→h6 is entirely off-visibility for WHITE.
  //
  // White's pieces are clustered on rank 1-2 west side; black's h-pawn at
  // h7 is far from any white piece. White's visibility shouldn't see h7
  // or h6.
  const state: GameState = {
    ...makeStartingState(),
    board: {
      a1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'pawn' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
      h7: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'black' },
    castlingRights: [],
  };
  const move: Move = { from: 'h7' as Square, to: 'h6' as Square };
  const nextState = applyMoveToState(state, move);

  const obs = buildObservationForPly({
    prevState: state,
    nextState,
    move,
    perspective: 'white',
    ply: 1,
  });

  const visible = visibilityBits(obs.visibility_mask);
  const fromIdx = squareIndex('h7');
  const toIdx = squareIndex('h6');
  assert.ok(
    !visible.has(fromIdx),
    `h7 (${fromIdx}) leaked into visibility_mask`,
  );
  assert.ok(
    !visible.has(toIdx),
    `h6 (${toIdx}) leaked into visibility_mask`,
  );
  // No visible piece on h7 or h6
  for (const [sqIdx] of obs.visible_pieces) {
    assert.notStrictEqual(sqIdx, fromIdx, 'h7 leaked into visible_pieces');
    assert.notStrictEqual(sqIdx, toIdx, 'h6 leaked into visible_pieces');
  }
  // own_capture and landing both null — nothing observable to attribute
  assert.strictEqual(obs.own_capture_square, null);
  assert.strictEqual(obs.opp_capture_landing_square, null);
});

// ---------------------------------------------------------------------------
// 4. Own piece captured on hidden square — own_capture_square SET, landing NULL
// ---------------------------------------------------------------------------

test('redaction#4: own piece captured on hidden square sets own_capture_square but not landing', () => {
  // White has a pawn at e5; black has a knight at d7 that captures e5.
  // From WHITE's perspective: the e5 pawn vanishes (own_capture_square=e5),
  // but black's knight movement (d7→e5) — d7 is invisible, e5 was visible
  // pre-move (own piece there). After capture, e5 has a black knight on
  // it. If e5 is in white's POST-move visibility, opp_capture_landing_square
  // = e5. If e5 is no longer visible (white only saw it because of the
  // pawn that was there), landing should be null.
  //
  // Construct a position where white has ONLY the e5 pawn + king. After
  // the capture, white loses sight of e5 (no longer near any white piece).
  const state: GameState = {
    ...makeStartingState(),
    board: {
      a1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d7: { color: 'black', role: 'knight' },
      h8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'black' },
    castlingRights: [],
  };
  const move: Move = { from: 'd7' as Square, to: 'e5' as Square };
  const nextState = applyMoveToState(state, move);

  const obs = buildObservationForPly({
    prevState: state,
    nextState,
    move,
    perspective: 'white',
    ply: 1,
  });

  const visible = visibilityBits(obs.visibility_mask);
  const e5Idx = squareIndex('e5');

  // White lost its e5 pawn — own_capture_square should be set
  assert.strictEqual(
    obs.own_capture_square,
    e5Idx,
    `expected own_capture_square=e5, got ${obs.own_capture_square}`,
  );

  // After the capture, white only has the a1 king. e5 should not be in
  // white's visibility mask (a1 king doesn't see across the board).
  assert.ok(!visible.has(e5Idx), 'e5 should not be in white visibility post-capture');

  // Therefore opp_capture_landing_square must be null
  assert.strictEqual(
    obs.opp_capture_landing_square,
    null,
    'opp_capture_landing_square must be null when landing square is off-visibility',
  );
});

// ---------------------------------------------------------------------------
// 5. engineSeed derivation
// ---------------------------------------------------------------------------

test('redaction#5: engineSeed is deterministic from secret+game+engine+color+ply, independent of room master seed', () => {
  const a = deriveEngineSeed({
    engineSecret: 's1',
    gameId: 'g1',
    engineId: 'e1',
    color: 'white',
    ply: 7,
  });
  const aAgain = deriveEngineSeed({
    engineSecret: 's1',
    gameId: 'g1',
    engineId: 'e1',
    color: 'white',
    ply: 7,
  });
  assert.strictEqual(a, aAgain, 'same inputs must produce same seed');

  // Different secret → different seed
  const diffSecret = deriveEngineSeed({
    engineSecret: 's2',
    gameId: 'g1',
    engineId: 'e1',
    color: 'white',
    ply: 7,
  });
  assert.notStrictEqual(a, diffSecret);

  // Different ply → different seed
  const diffPly = deriveEngineSeed({
    engineSecret: 's1',
    gameId: 'g1',
    engineId: 'e1',
    color: 'white',
    ply: 8,
  });
  assert.notStrictEqual(a, diffPly);

  // Different color → different seed (white vs black get different seeds
  // even in the same game, so a leaked engineSeed doesn't compromise opp)
  const diffColor = deriveEngineSeed({
    engineSecret: 's1',
    gameId: 'g1',
    engineId: 'e1',
    color: 'black',
    ply: 7,
  });
  assert.notStrictEqual(a, diffColor);

  // No master-seed input — buildEngineTurnRequest signature has no field
  // for it. Caller cannot pass it; even if leaked, it cannot influence
  // engineSeed.
  // (Compile-time guarantee via the signature; this assertion documents
  // the invariant for human readers.)
  assert.ok(a >= 0);
  assert.ok(a <= 0x7fffffff);
});

// ---------------------------------------------------------------------------
// 6. observationTranscript replay preserves truth-in-perspective
// ---------------------------------------------------------------------------

test('redaction#6: observationTranscript visibility matches canonical visibility at every ply', () => {
  let state = makeStartingState();
  const events: GameEvent[] = [];
  // A short opening
  const moves: Array<[string, string]> = [
    ['e2', 'e4'],
    ['c7', 'c5'],
    ['g1', 'f3'],
    ['d7', 'd6'],
    ['d2', 'd4'],
    ['c5', 'd4'],
  ];
  let ply = 0;
  const stateAtPly: GameState[] = [state];
  for (const [from, to] of moves) {
    const mv: Move = { from: from as Square, to: to as Square };
    events.push(moveEvent(state, mv, ply));
    state = applyMoveToState(state, mv);
    stateAtPly.push(state);
    ply += 1;
  }

  for (const color of ['white', 'black'] as Color[]) {
    const transcript = buildObservationTranscript({
      variantId: 'dark-chess',
      roomId: ROOM_ID,
      events,
      perspective: color,
    });
    assert.strictEqual(transcript.length, stateAtPly.length, 'transcript covers every ply (including initial)');
    for (let i = 0; i < transcript.length; i++) {
      const obs = transcript[i];
      const canonical = stateAtPly[i];
      const expectedView = darkChessVariant.getPlayerView(canonical, color);
      // Truth-in-perspective: the visible pieces in the observation must
      // exactly equal the canonical board restricted to visibleSquares.
      const expectedVisible = new Set(expectedView.visibleSquares.map((sq) => squareIndex(sq)));
      const observedVisible = new Set(obs.visible_pieces.map(([idx]) => idx));
      for (const sq of observedVisible) {
        assert.ok(
          expectedVisible.has(sq),
          `[${color}] ply ${i}: observation reported piece on ${sq} (${indexToSquare(sq)}) but canonical visibility excludes it`,
        );
      }
      // Pieces canonically visible AND on the board must appear in
      // observation
      for (const sq of expectedView.visibleSquares) {
        if (canonical.board[sq]) {
          assert.ok(
            observedVisible.has(squareIndex(sq)),
            `[${color}] ply ${i}: canonical piece at ${sq} (visible) missing from observation`,
          );
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Bonus: sessionId is stable + per-engine-per-color
// ---------------------------------------------------------------------------

test('sessionId is stable per (gameId, engineId, color) and differs across them', () => {
  const a = buildSessionId({ gameId: 'g1', engineId: 'e1', color: 'white' });
  const aAgain = buildSessionId({ gameId: 'g1', engineId: 'e1', color: 'white' });
  assert.strictEqual(a, aAgain);
  assert.notStrictEqual(a, buildSessionId({ gameId: 'g2', engineId: 'e1', color: 'white' }));
  assert.notStrictEqual(a, buildSessionId({ gameId: 'g1', engineId: 'e2', color: 'white' }));
  assert.notStrictEqual(a, buildSessionId({ gameId: 'g1', engineId: 'e1', color: 'black' }));
});
