import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyShogiMove,
  canMovePromote,
  controlledSquares,
  createEmptyShogiHands,
  createInitialShogiBoard,
  createInitialShogiState,
  createShogiPiece,
  getLegalShogiDrops,
  getLegalShogiMoves,
  getLegalShogiMovesFrom,
  getShogiPlayerView,
  isLegalShogiMove,
  isPromotionZone,
  isShogiDrop,
  mustPromote,
  opponentOf,
  type ShogiBoard,
  type ShogiBoardMove,
  type ShogiGameState,
  type ShogiPiece,
  type ShogiPieceRole,
  type ShogiSquare,
  shogiCoordOf,
  shogiInBounds,
  shogiSquareOf,
} from './variants-shogi.js';

function buildState(board: ShogiBoard, turn: 'black' | 'white' = 'black'): ShogiGameState {
  return {
    id: 't',
    board,
    hands: createEmptyShogiHands(),
    status: { type: 'playing', turn },
    moveNumber: 1,
  };
}

function hasMove(moves: Array<{ from: string; to: string }>, from: string, to: string): boolean {
  return moves.some((move) => move.from === from && move.to === to);
}

test('squareOf / coordOf roundtrip across the 9x9 shogi board', () => {
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      const square = shogiSquareOf(file, rankIndex);
      const coord = shogiCoordOf(square);
      assert.equal(coord.file, file);
      assert.equal(coord.rankIndex, rankIndex);
    }
  }
});

test('squareOf and coordOf reject out-of-range coordinates', () => {
  assert.throws(() => shogiSquareOf(0, 0));
  assert.throws(() => shogiSquareOf(10, 0));
  assert.throws(() => shogiSquareOf(1, -1));
  assert.throws(() => shogiSquareOf(1, 9));
  assert.throws(() => shogiCoordOf('0a' as ShogiSquare));
  assert.throws(() => shogiCoordOf('1j' as ShogiSquare));
});

test('inBounds covers only files 1..9 and ranks a..i', () => {
  assert.equal(shogiInBounds(1, 0), true);
  assert.equal(shogiInBounds(9, 8), true);
  assert.equal(shogiInBounds(0, 0), false);
  assert.equal(shogiInBounds(10, 0), false);
  assert.equal(shogiInBounds(1, -1), false);
  assert.equal(shogiInBounds(1, 9), false);
});

test('opponentOf flips the side to move', () => {
  assert.equal(opponentOf('black'), 'white');
  assert.equal(opponentOf('white'), 'black');
});

test('initial board has 40 pieces with the expected role distribution', () => {
  const board = createInitialShogiBoard();
  const pieces = Object.values(board) as ShogiPiece[];
  assert.equal(pieces.length, 40);

  const counts: Record<string, number> = {};
  for (const piece of pieces) {
    counts[`${piece.color}-${piece.role}`] = (counts[`${piece.color}-${piece.role}`] ?? 0) + 1;
    assert.equal(piece.promoted, false);
  }

  for (const color of ['black', 'white']) {
    assert.equal(counts[`${color}-K`], 1);
    assert.equal(counts[`${color}-R`], 1);
    assert.equal(counts[`${color}-B`], 1);
    assert.equal(counts[`${color}-G`], 2);
    assert.equal(counts[`${color}-S`], 2);
    assert.equal(counts[`${color}-N`], 2);
    assert.equal(counts[`${color}-L`], 2);
    assert.equal(counts[`${color}-P`], 9);
  }
});

test('initial board has standard shogi landmark placement', () => {
  const board = createInitialShogiBoard();

  assert.deepEqual(board['5i'], createShogiPiece('black', 'K'));
  assert.deepEqual(board['2h'], createShogiPiece('black', 'R'));
  assert.deepEqual(board['8h'], createShogiPiece('black', 'B'));
  assert.deepEqual(board['9i'], createShogiPiece('black', 'L'));
  assert.deepEqual(board['1i'], createShogiPiece('black', 'L'));
  assert.deepEqual(board['7g'], createShogiPiece('black', 'P'));

  assert.deepEqual(board['5a'], createShogiPiece('white', 'K'));
  assert.deepEqual(board['8b'], createShogiPiece('white', 'R'));
  assert.deepEqual(board['2b'], createShogiPiece('white', 'B'));
  assert.deepEqual(board['9a'], createShogiPiece('white', 'L'));
  assert.deepEqual(board['1a'], createShogiPiece('white', 'L'));
  assert.deepEqual(board['3c'], createShogiPiece('white', 'P'));

  for (const square of ['1d', '5e', '9f']) {
    assert.equal(board[square as ShogiSquare], undefined);
  }
});

test('initial state starts with black to move', () => {
  const state = createInitialShogiState('shogi-test');
  assert.equal(state.id, 'shogi-test');
  assert.equal(state.moveNumber, 1);
  assert.equal(state.lastMove, undefined);
  assert.deepEqual(state.hands, { black: {}, white: {} });
  assert.deepEqual(state.status, { type: 'playing', turn: 'black' });
});

test('initial position has 30 legal black moves and known opening moves', () => {
  const state = createInitialShogiState('t');
  const moves = getLegalShogiMoves(state).filter((m): m is ShogiBoardMove => !isShogiDrop(m));

  assert.equal(moves.length, 30);
  assert.equal(moves.filter((move) => move.from.endsWith('g')).length, 9);
  assert.ok(hasMove(moves, '7g', '7f'), 'black pawn 7g->7f should be legal');
  assert.ok(hasMove(moves, '9i', '9h'), 'black lance can move to the empty square before its pawn');
  assert.ok(hasMove(moves, '1i', '1h'), 'black lance can move to the empty square before its pawn');
  assert.ok(hasMove(moves, '2h', '7h'), 'black rook should slide horizontally');
  assert.ok(!hasMove(moves, '2h', '8h'), 'black rook cannot capture own bishop');
  assert.ok(hasMove(moves, '7i', '6h'), 'black silver should step forward-diagonal');
  assert.ok(!hasMove(moves, '7i', '8h'), 'black silver cannot land on own bishop');
  assert.ok(hasMove(moves, '5i', '5h'), 'black king should step forward');
});

test('initial position has mirrored 30 legal white moves', () => {
  const state = {
    ...createInitialShogiState('t'),
    status: { type: 'playing' as const, turn: 'white' as const },
  };
  const moves = getLegalShogiMoves(state).filter((m): m is ShogiBoardMove => !isShogiDrop(m));

  assert.equal(moves.length, 30);
  assert.ok(hasMove(moves, '3c', '3d'), 'white pawn 3c->3d should be legal');
  assert.ok(hasMove(moves, '9a', '9b'), 'white lance can move to the empty square before its pawn');
  assert.ok(hasMove(moves, '1a', '1b'), 'white lance can move to the empty square before its pawn');
  assert.ok(hasMove(moves, '8b', '3b'), 'white rook should slide horizontally');
  assert.ok(!hasMove(moves, '8b', '2b'), 'white rook cannot capture own bishop');
  assert.ok(hasMove(moves, '3a', '4b'), 'white silver should step forward-diagonal');
  assert.ok(hasMove(moves, '5a', '5b'), 'white king should step forward');
});

test('finished states have no legal moves', () => {
  const state: ShogiGameState = {
    ...createInitialShogiState('t'),
    status: { type: 'finished', winner: 'black', reason: 'king-captured' },
  };

  assert.deepEqual(getLegalShogiMoves(state), []);
  assert.deepEqual(getLegalShogiMovesFrom(state, '5i'), []);
});

test('move generation is pseudo-legal and does not filter check', () => {
  const state = buildState({
    '5a': createShogiPiece('white', 'R'),
    '5i': createShogiPiece('black', 'K'),
  });
  const moves = getLegalShogiMovesFrom(state, '5i');

  assert.ok(hasMove(moves, '5i', '5h'), 'king may move into a rook-controlled file');
});

test('sliding pieces stop at blockers and include enemy captures', () => {
  const state = buildState({
    '5e': createShogiPiece('black', 'R'),
    '5c': createShogiPiece('white', 'P'),
    '5g': createShogiPiece('black', 'P'),
  });
  const moves = getLegalShogiMovesFrom(state, '5e');

  assert.ok(hasMove(moves, '5e', '5d'));
  assert.ok(hasMove(moves, '5e', '5c'));
  assert.ok(!hasMove(moves, '5e', '5b'), 'rook cannot see beyond captured blocker');
  assert.ok(!hasMove(moves, '5e', '5g'), 'rook cannot land on own blocker');
  assert.ok(!hasMove(moves, '5e', '5h'), 'rook cannot see beyond own blocker');
});

test('knights jump two forward and one file sideways', () => {
  const blackState = buildState({ '5e': createShogiPiece('black', 'N') });
  assert.deepEqual(
    [...new Set(getLegalShogiMovesFrom(blackState, '5e').map((move) => move.to))].sort(),
    ['4c', '6c'],
  );

  const whiteState = buildState({ '5e': createShogiPiece('white', 'N') }, 'white');
  assert.deepEqual(
    [...new Set(getLegalShogiMovesFrom(whiteState, '5e').map((move) => move.to))].sort(),
    ['4g', '6g'],
  );
});

test('promoted minor pieces move as golds', () => {
  for (const role of ['P', 'L', 'N', 'S'] as ShogiPieceRole[]) {
    const state = buildState({ '5e': createShogiPiece('black', role, true) });
    const targets = getLegalShogiMovesFrom(state, '5e')
      .map((move) => move.to)
      .sort();
    assert.deepEqual(targets, ['4d', '4e', '5d', '5f', '6d', '6e'], role);
  }
});

test('promoted rook and bishop keep sliding movement and gain king-like steps', () => {
  const dragon = buildState({ '5e': createShogiPiece('black', 'R', true) });
  const dragonTargets = new Set(getLegalShogiMovesFrom(dragon, '5e').map((move) => move.to));
  assert.ok(dragonTargets.has('5a'), 'promoted rook still slides orthogonally');
  assert.ok(dragonTargets.has('1e'), 'promoted rook still slides horizontally');
  assert.ok(dragonTargets.has('4d'), 'promoted rook gains diagonal step');
  assert.ok(!dragonTargets.has('3c'), 'promoted rook does not gain diagonal slide');

  const horse = buildState({ '5e': createShogiPiece('black', 'B', true) });
  const horseTargets = new Set(getLegalShogiMovesFrom(horse, '5e').map((move) => move.to));
  assert.ok(horseTargets.has('1a'), 'promoted bishop still slides diagonally');
  assert.ok(horseTargets.has('9a'), 'promoted bishop still slides diagonally both ways');
  assert.ok(horseTargets.has('5d'), 'promoted bishop gains orthogonal step');
  assert.ok(!horseTargets.has('5a'), 'promoted bishop does not gain orthogonal slide');
});

test('isLegalShogiMove agrees with generated moves', () => {
  const state = createInitialShogiState('t');
  assert.equal(isLegalShogiMove(state, { from: '7g', to: '7f' }), true);
  assert.equal(isLegalShogiMove(state, { from: '7g', to: '7f', promote: true }), false);
  assert.equal(isLegalShogiMove(state, { from: '7g', to: '7e' }), false);
  assert.equal(isLegalShogiMove(state, { from: '3c', to: '3d' }), false);
});

test('controlledSquares includes own blockers for visibility callers', () => {
  const board: ShogiBoard = {
    '5e': createShogiPiece('black', 'L'),
    '5c': createShogiPiece('black', 'P'),
  };
  assert.deepEqual(controlledSquares(board, '5e', board['5e']!), ['5d', '5c']);
});

test('promotion zones are the far three ranks for each side', () => {
  assert.equal(isPromotionZone('black', '5a'), true);
  assert.equal(isPromotionZone('black', '5c'), true);
  assert.equal(isPromotionZone('black', '5d'), false);
  assert.equal(isPromotionZone('white', '5g'), true);
  assert.equal(isPromotionZone('white', '5i'), true);
  assert.equal(isPromotionZone('white', '5f'), false);
});

test('promotion eligibility depends on moving from or into the promotion zone', () => {
  const blackPawn = createShogiPiece('black', 'P');
  assert.equal(canMovePromote(blackPawn, '5d', '5c'), true);
  assert.equal(canMovePromote(blackPawn, '5c', '5d'), true);
  assert.equal(canMovePromote(blackPawn, '5g', '5f'), false);
  assert.equal(canMovePromote(createShogiPiece('black', 'G'), '5d', '5c'), false);
  assert.equal(canMovePromote(createShogiPiece('black', 'P', true), '5c', '5b'), false);
});

test('mandatory promotion applies to pawns, lances, and knights without future moves', () => {
  assert.equal(mustPromote(createShogiPiece('black', 'P'), '5a'), true);
  assert.equal(mustPromote(createShogiPiece('black', 'L'), '5a'), true);
  assert.equal(mustPromote(createShogiPiece('black', 'N'), '5b'), true);
  assert.equal(mustPromote(createShogiPiece('black', 'N'), '5c'), false);
  assert.equal(mustPromote(createShogiPiece('white', 'P'), '5i'), true);
  assert.equal(mustPromote(createShogiPiece('white', 'L'), '5i'), true);
  assert.equal(mustPromote(createShogiPiece('white', 'N'), '5h'), true);
  assert.equal(mustPromote(createShogiPiece('white', 'N'), '5g'), false);
});

test('legal moves include optional promotion variants and enforce mandatory promotion', () => {
  const optional = buildState({ '5d': createShogiPiece('black', 'P') });
  assert.deepEqual(getLegalShogiMovesFrom(optional, '5d'), [
    { from: '5d', to: '5c' },
    { from: '5d', to: '5c', promote: true },
  ]);

  const mandatory = buildState({ '5b': createShogiPiece('black', 'P') });
  assert.deepEqual(getLegalShogiMovesFrom(mandatory, '5b'), [
    { from: '5b', to: '5a', promote: true },
  ]);
});

test('applyShogiMove moves pieces, updates turn, and tracks full moves after white', () => {
  const state = createInitialShogiState('t');
  const afterBlack = applyShogiMove(state, { from: '7g', to: '7f' });

  assert.equal(afterBlack.board['7g'], undefined);
  assert.deepEqual(afterBlack.board['7f'], createShogiPiece('black', 'P'));
  assert.deepEqual(afterBlack.status, { type: 'playing', turn: 'white' });
  assert.equal(afterBlack.moveNumber, 1);
  assert.deepEqual(afterBlack.lastMove, { from: '7g', to: '7f' });
  assert.deepEqual(afterBlack.hands, { black: {}, white: {} });

  const afterWhite = applyShogiMove(afterBlack, { from: '3c', to: '3d' });
  assert.deepEqual(afterWhite.status, { type: 'playing', turn: 'black' });
  assert.equal(afterWhite.moveNumber, 2);
});

test('applyShogiMove rejects illegal moves without changing state', () => {
  const state = createInitialShogiState('t');

  assert.equal(applyShogiMove(state, { from: '7g', to: '7e' }), state);
  assert.equal(applyShogiMove(state, { from: '7g', to: '7f', promote: true }), state);
});

test('applyShogiMove captures non-king pieces into hand in unpromoted form', () => {
  const state = buildState({
    '5e': createShogiPiece('black', 'R'),
    '5c': createShogiPiece('white', 'S', true),
  });

  const next = applyShogiMove(state, { from: '5e', to: '5c' });

  assert.equal(next.board['5e'], undefined);
  assert.deepEqual(next.board['5c'], createShogiPiece('black', 'R'));
  assert.deepEqual(next.hands, { black: { S: 1 }, white: {} });
  assert.deepEqual(next.status, { type: 'playing', turn: 'white' });
});

test('applyShogiMove applies optional and mandatory promotion choices', () => {
  const optional = buildState({ '5d': createShogiPiece('black', 'P') });
  assert.deepEqual(
    applyShogiMove(optional, { from: '5d', to: '5c', promote: true }).board['5c'],
    createShogiPiece('black', 'P', true),
  );

  const mandatory = buildState({ '5b': createShogiPiece('black', 'P') });
  assert.equal(applyShogiMove(mandatory, { from: '5b', to: '5a' }), mandatory);
  assert.deepEqual(
    applyShogiMove(mandatory, { from: '5b', to: '5a', promote: true }).board['5a'],
    createShogiPiece('black', 'P', true),
  );
});

test('applyShogiMove ends the game on king capture without adding a hand piece', () => {
  const state = buildState({
    '5e': createShogiPiece('black', 'R'),
    '5c': createShogiPiece('white', 'K'),
  });

  const next = applyShogiMove(state, { from: '5e', to: '5c' });

  assert.deepEqual(next.board['5c'], createShogiPiece('black', 'R'));
  assert.deepEqual(next.hands, { black: {}, white: {} });
  assert.deepEqual(next.status, { type: 'finished', winner: 'black', reason: 'king-captured' });
  assert.deepEqual(next.lastMove, { from: '5e', to: '5c' });
  assert.equal(getLegalShogiMoves(next).length, 0);
});

test('drops: a hand piece drops onto an empty square and leaves the hand', () => {
  const state: ShogiGameState = {
    id: 't',
    board: { '5i': createShogiPiece('black', 'K'), '5a': createShogiPiece('white', 'K') },
    hands: { black: { P: 1 }, white: {} },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
  assert.ok(
    getLegalShogiDrops(state).some((d) => d.drop === 'P' && d.to === '5e'),
    'P drop on 5e should be legal',
  );
  const next = applyShogiMove(state, { drop: 'P', to: '5e' });
  assert.deepEqual(next.board['5e'], createShogiPiece('black', 'P'));
  assert.equal(next.hands.black.P ?? 0, 0);
  assert.equal(next.status.type === 'playing' && next.status.turn, 'white');
  assert.deepEqual(next.lastMove, { drop: 'P', to: '5e' });
});

test('drops: nifu blocks a second pawn in a file, and last-rank pawn drops are dead', () => {
  const state: ShogiGameState = {
    id: 't',
    board: {
      '5i': createShogiPiece('black', 'K'),
      '5a': createShogiPiece('white', 'K'),
      '5g': createShogiPiece('black', 'P'),
    },
    hands: { black: { P: 1 }, white: {} },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
  const drops = getLegalShogiDrops(state);
  assert.ok(!drops.some((d) => d.drop === 'P' && d.to.startsWith('5')), 'nifu blocks file 5');
  assert.ok(
    !drops.some((d) => d.drop === 'P' && d.to.endsWith('a')),
    'last-rank pawn drop is dead',
  );
  assert.ok(
    drops.some((d) => d.drop === 'P' && d.to === '4e'),
    'a pawn drop in file 4 is legal',
  );
  assert.equal(applyShogiMove(state, { drop: 'P', to: '5e' }), state, 'a nifu drop is a no-op');
});

test('fog view: sees own pieces + field of fire, hides far enemies and the enemy hand', () => {
  const state: ShogiGameState = {
    id: 't',
    board: {
      '5i': createShogiPiece('black', 'K'),
      '5g': createShogiPiece('black', 'P'),
      '5a': createShogiPiece('white', 'K'),
      '1a': createShogiPiece('white', 'L'),
    },
    hands: { black: { R: 1 }, white: { B: 2 } },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
  const view = getShogiPlayerView(state, 'black');
  assert.deepEqual(view.board['5i'], createShogiPiece('black', 'K'));
  assert.deepEqual(view.board['5g'], createShogiPiece('black', 'P'));
  assert.equal(view.board['5a'], undefined, 'far white king is fogged');
  assert.equal(view.board['1a'], undefined, 'far white lance is fogged');
  assert.deepEqual(view.hand, { R: 1 }, 'sees its own hand');
  assert.equal((view as { hand: Record<string, number> }).hand.B, undefined, 'not the enemy hand');
  assert.ok(view.visibleSquares.includes('5f'), 'black pawn on 5g controls 5f');
  assert.ok(!view.visibleSquares.includes('5a'), 'far enemy square is not visible');
});

test('shogi drops are OFFERED from the view (parachute) and bounce on a hidden piece', () => {
  // Black sees up file 5 (rook on 5e) to the White pawn on 5c; the White knight
  // tucked in the fogged corner (1a) is invisible to Black.
  const state: ShogiGameState = {
    id: 't',
    board: {
      '5i': createShogiPiece('black', 'K'),
      '5e': createShogiPiece('black', 'R'),
      '5c': createShogiPiece('white', 'P'),
      '1a': createShogiPiece('white', 'N'),
    },
    hands: { black: { S: 1 }, white: {} },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
  const view = getShogiPlayerView(state, 'black');
  // 1a is fogged: it is absent from the view board (no leak of the hidden knight)...
  assert.equal(view.board['1a'], undefined);
  // ...yet a Silver drop onto 1a IS offered, exactly like any other fogged square,
  // so the offer list never reveals which fogged squares are occupied.
  assert.ok(view.legalMoves.some((m) => isShogiDrop(m) && m.drop === 'S' && m.to === '1a'));
  // ...but the drop bounces: 1a is occupied in truth, so it is not legal to resolve.
  assert.equal(isLegalShogiMove(state, { drop: 'S', to: '1a' }), false);
  // The truth-legal drop enumeration (server / bots) correctly excludes 1a.
  assert.ok(!getLegalShogiDrops(state).some((m) => m.drop === 'S' && m.to === '1a'));
});
