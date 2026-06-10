import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCrossroadsChessMove,
  applyCrossroadsChessOpenMove,
  type CrossroadsChessBoard,
  type CrossroadsChessMove,
  type CrossroadsChessPieceRole,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  isCrossroadsChessLegalMove,
  isCrossroadsChessOpenLegalMove,
} from './variants-crossroads-chess.js';
import { CROSSROADS_CHESS_REPLAY_GAMES } from './variants-crossroads-chess.replay-fixtures.js';

// Cross-check the rules engine against ground truth: real Fairy-Stockfish
// self-play games from the meerkat lab. FSF plays perfect-information (it never
// leaves its own king in check), so every FSF move is a strict subset of our
// pseudo-legal moves and MUST be accepted. We also rebuild FSF's own FEN after
// each move, so move-gen and apply-move are validated frame by frame.

const ROLE_LETTER: Record<CrossroadsChessPieceRole, string> = {
  king: 'k',
  queen: 'q',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
  chariot: 'v',
  cannon: 'c',
  horse: 'h',
  soldier: 'o',
};

function boardToFenField(board: CrossroadsChessBoard): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 6; f += 1) {
      const sq = `${'abcdef'[f]}${rank}` as CrossroadsChessSquare;
      const piece = board[sq];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = ROLE_LETTER[piece.role];
      row += piece.color === 'white' ? letter.toUpperCase() : letter;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

function parseUci(uci: string): CrossroadsChessMove {
  const from = uci.slice(0, 2) as CrossroadsChessSquare;
  const to = uci.slice(2, 4) as CrossroadsChessSquare;
  return uci.length > 4 ? { from, to, promotion: 'queen' } : { from, to };
}

for (const game of CROSSROADS_CHESS_REPLAY_GAMES) {
  test(`replays meerkat x_L5 game #${game.srcIndex} (${game.reason}, ${game.plies} plies)`, () => {
    let s = createInitialCrossroadsChessState('replay');
    for (let i = 0; i < game.frames.length; i += 1) {
      const [uci, expected] = game.frames[i];
      const [expectedPlacement, expectedSide] = expected.split(' ');
      const ply = i + 1;

      assert.equal(s.status.type, 'playing', `ply ${ply} (${uci}): engine ended the game early`);
      const move = parseUci(uci);
      assert.ok(
        isCrossroadsChessLegalMove(s, move),
        `ply ${ply}: FSF move ${uci} is not pseudo-legal in our engine`,
      );

      // High progress limit so the 50-move rule never masks a move-gen check.
      s = applyCrossroadsChessMove(s, move, { progressClockLimit: 100_000 });

      assert.equal(
        boardToFenField(s.board),
        expectedPlacement,
        `ply ${ply} (${uci}): board diverged from FSF's FEN`,
      );
      if (s.status.type === 'playing') {
        assert.equal(
          s.status.turn === 'white' ? 'w' : 'b',
          expectedSide,
          `ply ${ply} (${uci}): side-to-move diverged`,
        );
      }
    }

    // Terminal cross-check. FSF ends "Try" games exactly when the King reaches
    // the enemy home rank — our 'race' terminal must agree on side + reason.
    // ("checkmate/stalemate" games end on a check our king-capture engine does
    // not adjudicate, so we only assert the full move sequence replayed.)
    if (game.reason.startsWith('Try')) {
      assert.equal(s.status.type, 'finished');
      if (s.status.type === 'finished') {
        assert.equal(s.status.reason, 'race');
        assert.equal(s.status.winner, game.result === 'W' ? 'white' : 'red');
      }
    }
  });
}

// The same games under the PERFECT-INFORMATION referee. FSF never leaves its own
// king in check, so every move must be open-legal (a strict subset of pseudo-legal)
// and, crucially, the checkmate game must now terminate as 'checkmate'/'stalemate'.
for (const game of CROSSROADS_CHESS_REPLAY_GAMES) {
  test(`replays game #${game.srcIndex} under the perfect-info referee (${game.reason})`, () => {
    let s = createInitialCrossroadsChessState('open-replay');
    for (let i = 0; i < game.frames.length; i += 1) {
      const [uci, expected] = game.frames[i];
      const [expectedPlacement] = expected.split(' ');
      const ply = i + 1;

      assert.equal(s.status.type, 'playing', `ply ${ply} (${uci}): engine ended the game early`);
      const move = parseUci(uci);
      assert.ok(
        isCrossroadsChessOpenLegalMove(s, move),
        `ply ${ply}: FSF move ${uci} is not perfect-info-legal in our engine`,
      );
      s = applyCrossroadsChessOpenMove(s, move, { progressClockLimit: 100_000 });
      assert.equal(
        boardToFenField(s.board),
        expectedPlacement,
        `ply ${ply} (${uci}): board diverged from FSF's FEN`,
      );
    }

    assert.equal(s.status.type, 'finished', 'perfect-info referee should adjudicate a terminal');
    if (s.status.type === 'finished') {
      const expectedWinner = game.result === 'W' ? 'white' : 'red';
      if (game.reason.startsWith('Try')) {
        assert.equal(s.status.reason, 'race');
      } else {
        // "checkmate/stalemate" in the meerkat data.
        assert.ok(
          s.status.reason === 'checkmate' || s.status.reason === 'stalemate',
          `expected checkmate/stalemate, got ${s.status.reason}`,
        );
      }
      assert.equal(s.status.winner, expectedWinner);
    }
  });
}
