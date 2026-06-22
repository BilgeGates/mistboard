import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDropMiniXiangqiMove,
  COOLDOWN_DROP_MINI_XIANGQI_RULES,
  createInitialDropMiniXiangqiState,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiHands,
  type DropMiniXiangqiRules,
  dropMiniXiangqiPositionRepetitionKey,
  GUARDED_DROP_MINI_XIANGQI_RULES,
  getDropMiniXiangqiPlayerView,
  getLegalDropMiniXiangqiDrops,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiGeneralInCheck,
  isLegalDropMiniXiangqiMove,
  WILD_DROP_MINI_XIANGQI_RULES,
} from './variants-drop-mini-xiangqi.js';
import type { MiniXiangqiBoard, MiniXiangqiColor } from './variants-mini-xiangqi.js';

test('initial state uses no-enemy-palace drop policy with empty hands', () => {
  const state = createInitialDropMiniXiangqiState('drop-mini-initial');

  assert.deepEqual(state.rules, DEFAULT_DROP_MINI_XIANGQI_RULES);
  assert.deepEqual(state.hands, { red: {}, black: {} });
  assert.deepEqual(state.cooldownHands, { red: {}, black: {} });
  assert.equal(getLegalDropMiniXiangqiMoves(state).length, 19);
});

test('non-general captures add the captured role to the capturer hand', () => {
  const state = playingState({
    a1: { color: 'red', role: 'chariot' },
    a2: { color: 'black', role: 'horse' },
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'soldier' },
    d7: { color: 'black', role: 'general' },
  });

  const next = applyDropMiniXiangqiMove(state, { from: 'a1', to: 'a2' });

  assert.deepEqual(next.hands.red, { horse: 1 });
  assert.deepEqual(next.cooldownHands.red, {});
  assert.deepEqual(next.status, { type: 'playing', turn: 'black' });
  assert.equal(next.progressClock, 0);
});

test('direct general captures are illegal under checkmate rules', () => {
  const state = playingState({
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });

  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'd1', to: 'd7' }), false);
  const next = applyDropMiniXiangqiMove(state, { from: 'd1', to: 'd7' });

  assert.deepEqual(next.status, { type: 'playing', turn: 'red' });
  assert.deepEqual(next.board.d7, { color: 'black', role: 'general' });
  assert.deepEqual(next.hands.red, {});
});

test('drops consume a hand piece and place it as the dropping color', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} }, progressClock: 12 },
  );

  const next = applyDropMiniXiangqiMove(state, { drop: 'horse', to: 'a5' });

  assert.deepEqual(next.board.a5, { color: 'red', role: 'horse' });
  assert.deepEqual(next.hands.red, {});
  assert.deepEqual(next.status, { type: 'playing', turn: 'black' });
  assert.equal(next.progressClock, 0);
});

test('drop validation rejects no-hand, occupied-square, and general-drop attempts', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} } },
  );
  const generalDrop = { drop: 'general' as DropMiniXiangqiDropRole, to: 'a3' as const };

  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'cannon', to: 'a3' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'd1' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, generalDrop), false);
});

test('default drop policy allows center and enemy-home edge drops but rejects enemy palace', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 3 }, black: {} } },
  );

  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'c4' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'a7' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'd5' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'e7' }), false);
});

test('default drop policy rejects enemy palace symmetrically', () => {
  const redState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} } },
  );
  const blackState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { turn: 'black', hands: { red: {}, black: { horse: 1 } } },
  );

  assert.equal(isLegalDropMiniXiangqiMove(redState, { drop: 'horse', to: 'c5' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(redState, { drop: 'horse', to: 'f5' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(blackState, { drop: 'horse', to: 'e3' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(blackState, { drop: 'horse', to: 'b3' }), true);
});

test('wild comparator any-empty policy allows enemy palace drops', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 2 }, black: {} }, rules: WILD_DROP_MINI_XIANGQI_RULES },
  );

  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'd5' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'e7' }), true);
});

test('wild policy allows immediate checks by every drop role', () => {
  const baseHands: DropMiniXiangqiHands = {
    red: { chariot: 1, cannon: 1, horse: 1, soldier: 1 },
    black: {},
  };

  assert.equal(
    isLegalDropMiniXiangqiMove(
      playingState(
        {
          d1: { color: 'red', role: 'general' },
          d4: { color: 'red', role: 'soldier' },
          d7: { color: 'black', role: 'general' },
        },
        { hands: baseHands, rules: WILD_DROP_MINI_XIANGQI_RULES },
      ),
      { drop: 'chariot', to: 'a7' },
    ),
    true,
  );
  assert.equal(
    isLegalDropMiniXiangqiMove(
      playingState(
        {
          d1: { color: 'red', role: 'general' },
          d6: { color: 'red', role: 'soldier' },
          d7: { color: 'black', role: 'general' },
        },
        { hands: baseHands, rules: WILD_DROP_MINI_XIANGQI_RULES },
      ),
      { drop: 'cannon', to: 'd5' },
    ),
    true,
  );
  assert.equal(
    isLegalDropMiniXiangqiMove(
      playingState(
        {
          d1: { color: 'red', role: 'general' },
          d4: { color: 'red', role: 'soldier' },
          d7: { color: 'black', role: 'general' },
        },
        { hands: baseHands, rules: WILD_DROP_MINI_XIANGQI_RULES },
      ),
      { drop: 'horse', to: 'c5' },
    ),
    true,
  );
  assert.equal(
    isLegalDropMiniXiangqiMove(
      playingState(
        {
          d1: { color: 'red', role: 'general' },
          d4: { color: 'red', role: 'soldier' },
          d7: { color: 'black', role: 'general' },
        },
        { hands: baseHands, rules: WILD_DROP_MINI_XIANGQI_RULES },
      ),
      { drop: 'soldier', to: 'd6' },
    ),
    true,
  );
});

test('wild policy still requires a drop to answer an existing check', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} } },
  );

  assert.equal(isDropMiniXiangqiGeneralInCheck(state, 'red'), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'a4' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'horse', to: 'd4' }), true);
});

test('guarded comparator enforces home-three-ranks symmetrically', () => {
  const redState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} }, rules: GUARDED_DROP_MINI_XIANGQI_RULES },
  );
  const blackState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    {
      turn: 'black',
      hands: { red: {}, black: { horse: 1 } },
      rules: GUARDED_DROP_MINI_XIANGQI_RULES,
    },
  );

  assert.equal(isLegalDropMiniXiangqiMove(redState, { drop: 'horse', to: 'd3' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(redState, { drop: 'horse', to: 'd4' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(redState, { drop: 'horse', to: 'd5' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(blackState, { drop: 'horse', to: 'd5' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(blackState, { drop: 'horse', to: 'd4' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(blackState, { drop: 'horse', to: 'd3' }), false);
});

test('guarded comparator rejects immediate threats and facing-general exposure', () => {
  const threatState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { chariot: 1, horse: 1 }, black: {} }, rules: GUARDED_DROP_MINI_XIANGQI_RULES },
  );

  assert.equal(isLegalDropMiniXiangqiMove(threatState, { drop: 'chariot', to: 'd3' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(threatState, { drop: 'horse', to: 'a3' }), false);
});

test('guarded comparator allows a home drop that blocks facing generals', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { soldier: 1 }, black: {} }, rules: GUARDED_DROP_MINI_XIANGQI_RULES },
  );

  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'soldier', to: 'd3' }), true);
});

test('legal board moves still delegate to Mini Xiangqi movement', () => {
  const state = playingState({
    b1: { color: 'red', role: 'cannon' },
    b3: { color: 'red', role: 'soldier' },
    b6: { color: 'black', role: 'horse' },
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'soldier' },
    d7: { color: 'black', role: 'general' },
  });

  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'b1', to: 'b6' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'b1', to: 'b5' }), false);
});

test('board moves cannot expose the moving side general to check', () => {
  const state = playingState({
    a1: { color: 'red', role: 'chariot' },
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'soldier' },
    d7: { color: 'black', role: 'general' },
  });

  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'd4', to: 'c4' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'd4', to: 'd5' }), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'a1', to: 'a2' }), true);
});

test('a player in check must answer the check', () => {
  const state = playingState(
    {
      a1: { color: 'red', role: 'chariot' },
      d1: { color: 'red', role: 'general' },
      d5: { color: 'black', role: 'chariot' },
      e7: { color: 'black', role: 'general' },
    },
    { hands: { red: { soldier: 1 }, black: {} } },
  );

  assert.equal(isDropMiniXiangqiGeneralInCheck(state, 'red'), true);
  assert.equal(isLegalDropMiniXiangqiMove(state, { from: 'a1', to: 'a2' }), false);
  assert.equal(isLegalDropMiniXiangqiMove(state, { drop: 'soldier', to: 'd3' }), true);
});

test('checkmate ends the game before the general is captured', () => {
  const state = playingState({
    c1: { color: 'red', role: 'chariot' },
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'chariot' },
    e1: { color: 'red', role: 'chariot' },
    d7: { color: 'black', role: 'general' },
  });

  const next = applyDropMiniXiangqiMove(state, { from: 'd4', to: 'd3' });

  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'checkmate' });
  assert.deepEqual(next.board.d7, { color: 'black', role: 'general' });
  assert.deepEqual(next.hands.red, {});
});

test('no legal move without check is a xiangqi stalemate loss', () => {
  const state = playingState({
    a5: { color: 'red', role: 'chariot' },
    c1: { color: 'red', role: 'chariot' },
    d1: { color: 'red', role: 'general' },
    d4: { color: 'red', role: 'soldier' },
    e1: { color: 'red', role: 'chariot' },
    d7: { color: 'black', role: 'general' },
  });

  const next = applyDropMiniXiangqiMove(state, { from: 'a5', to: 'a6' });

  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'stalemate' });
});

test('quiet board moves increment progress while captures and drops reset it', () => {
  const quiet = applyDropMiniXiangqiMove(
    playingState(
      {
        a1: { color: 'red', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
        d4: { color: 'red', role: 'soldier' },
        d7: { color: 'black', role: 'general' },
      },
      { progressClock: 4 },
    ),
    { from: 'a1', to: 'a2' },
  );
  const capture = applyDropMiniXiangqiMove(
    playingState(
      {
        a1: { color: 'red', role: 'chariot' },
        a2: { color: 'black', role: 'horse' },
        d1: { color: 'red', role: 'general' },
        d4: { color: 'red', role: 'soldier' },
        d7: { color: 'black', role: 'general' },
      },
      { progressClock: 4 },
    ),
    { from: 'a1', to: 'a2' },
  );
  const drop = applyDropMiniXiangqiMove(
    playingState(
      {
        d1: { color: 'red', role: 'general' },
        d4: { color: 'red', role: 'soldier' },
        d7: { color: 'black', role: 'general' },
      },
      { hands: { red: { horse: 1 }, black: {} }, progressClock: 4 },
    ),
    { drop: 'horse', to: 'a4' },
  );

  assert.equal(quiet.progressClock, 5);
  assert.equal(capture.progressClock, 0);
  assert.equal(drop.progressClock, 0);
});

test('progress-clock draw still applies after quiet board moves', () => {
  const state = playingState(
    {
      a1: { color: 'red', role: 'chariot' },
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { progressClock: 1 },
  );

  const next = applyDropMiniXiangqiMove(state, { from: 'a1', to: 'a2' }, { progressClockLimit: 2 });

  assert.deepEqual(next.status, { type: 'finished', winner: null, reason: 'progress-clock' });
});

test('repetition keys include both hands and cooldown hands', () => {
  const base = playingState({
    d1: { color: 'red', role: 'general' },
    d7: { color: 'black', role: 'general' },
  });
  const handState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: {} } },
  );
  const cooldownState = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    { cooldownHands: { red: { horse: 1 }, black: {} } },
  );

  assert.notEqual(
    dropMiniXiangqiPositionRepetitionKey(base),
    dropMiniXiangqiPositionRepetitionKey(handState),
  );
  assert.notEqual(
    dropMiniXiangqiPositionRepetitionKey(handState),
    dropMiniXiangqiPositionRepetitionKey(cooldownState),
  );
});

test('one-turn cooldown withholds a capture for the capturer next turn', () => {
  const captured = applyDropMiniXiangqiMove(
    playingState(
      {
        a1: { color: 'red', role: 'chariot' },
        a2: { color: 'black', role: 'horse' },
        d1: { color: 'red', role: 'general' },
        d4: { color: 'red', role: 'soldier' },
        d7: { color: 'black', role: 'general' },
      },
      { rules: COOLDOWN_DROP_MINI_XIANGQI_RULES },
    ),
    { from: 'a1', to: 'a2' },
  );
  const blackMoved = applyDropMiniXiangqiMove(captured, { from: 'd7', to: 'e7' });
  const redCannotUseCooldown = getLegalDropMiniXiangqiDrops(blackMoved, 'red');
  const redMoved = applyDropMiniXiangqiMove(blackMoved, { from: 'd1', to: 'c1' });

  assert.deepEqual(captured.hands.red, {});
  assert.deepEqual(captured.cooldownHands.red, { horse: 1 });
  assert.deepEqual(blackMoved.hands.red, {});
  assert.deepEqual(blackMoved.cooldownHands.red, { horse: 1 });
  assert.equal(redCannotUseCooldown.length, 0);
  assert.deepEqual(redMoved.hands.red, { horse: 1 });
  assert.deepEqual(redMoved.cooldownHands.red, {});
});

test('player view is perfect information with public hands', () => {
  const state = playingState(
    {
      d1: { color: 'red', role: 'general' },
      d4: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    { hands: { red: { horse: 1 }, black: { cannon: 1 } } },
  );

  const view = getDropMiniXiangqiPlayerView(state, 'red');

  assert.deepEqual(view.board.d7, { color: 'black', role: 'general' });
  assert.equal(view.inCheck, false);
  assert.deepEqual(view.hands, { red: { horse: 1 }, black: { cannon: 1 } });
  assert.equal(
    view.legalMoves.some((move) => 'drop' in move && move.to === 'a4'),
    true,
  );

  const blackView = getDropMiniXiangqiPlayerView(state, 'black');
  assert.equal(
    blackView.legalMoves.some((move) => 'drop' in move && move.to === 'a4'),
    true,
  );
  assert.equal(
    getLegalDropMiniXiangqiMoves(state).some((move) => 'from' in move && move.from === 'd7'),
    false,
  );
});

function playingState(
  board: MiniXiangqiBoard,
  opts: {
    turn?: MiniXiangqiColor;
    hands?: DropMiniXiangqiHands;
    cooldownHands?: DropMiniXiangqiHands;
    progressClock?: number;
    rules?: DropMiniXiangqiRules;
  } = {},
): DropMiniXiangqiGameState {
  const state: DropMiniXiangqiGameState = {
    id: 'drop-mini-test',
    board,
    status: { type: 'playing', turn: opts.turn ?? 'red' },
    moveNumber: 1,
    progressClock: opts.progressClock ?? 0,
    rules: opts.rules ?? DEFAULT_DROP_MINI_XIANGQI_RULES,
    hands: cloneHands(opts.hands ?? { red: {}, black: {} }),
    cooldownHands: cloneHands(opts.cooldownHands ?? { red: {}, black: {} }),
    positionCounts: {},
  };
  return {
    ...state,
    positionCounts: { [dropMiniXiangqiPositionRepetitionKey(state)]: 1 },
  };
}

function cloneHands(hands: DropMiniXiangqiHands): DropMiniXiangqiHands {
  return {
    red: { ...hands.red },
    black: { ...hands.black },
  };
}
