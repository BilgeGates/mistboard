// Game-phase segmentation for standard xiangqi: the Opening / Middlegame /
// Endgame boundaries behind the advantage chart's dividers and the summary's
// per-phase accuracy (lichess anatomy). This is a HEURISTIC, not rules:
//
//   - Middlegame starts at the first move where real contact exists: two pieces
//     captured, or any non-soldier captured (an early central-soldier trade is
//     still opening theory), or the development budget is spent (ply 17).
//   - Endgame starts when attacking material is thin: the total on-board
//     attackers (chariots + cannons + horses, both sides) drop to <= 5 — the
//     xiangqi analog of lila's "majors and minors <= 6" division rule.
//
// Input is the mainline truth per ply cursor (index 0 = start position); output
// plies follow game-analysis GamePhases semantics (the FIRST move of the phase).
import type { XiangqiGameState, XiangqiPiece } from '@mistboard/game';
import type { GamePhases } from './game-analysis.js';

const OPENING_MAX_PLIES = 16;
const ENDGAME_ATTACKERS_MAX = 5;

export function xiangqiGamePhases(truths: readonly XiangqiGameState[]): GamePhases {
  const start = truths[0];
  if (!start || truths.length < 2) return {};
  const initialPieces = countPieces(start);
  const initialNonSoldiers = countNonSoldiers(start);

  let middle: number | undefined;
  let end: number | undefined;
  for (let ply = 1; ply < truths.length; ply += 1) {
    const state = truths[ply]!;
    if (middle === undefined) {
      const captured = initialPieces - countPieces(state);
      const nonSoldierCaptured = countNonSoldiers(state) < initialNonSoldiers;
      if (captured >= 2 || nonSoldierCaptured || ply > OPENING_MAX_PLIES) middle = ply;
    }
    if (middle !== undefined && countAttackers(state) <= ENDGAME_ATTACKERS_MAX) {
      end = ply;
      break;
    }
  }
  return { middle, end };
}

function pieces(state: XiangqiGameState): XiangqiPiece[] {
  return Object.values(state.board).filter((piece): piece is XiangqiPiece => Boolean(piece));
}

function countPieces(state: XiangqiGameState): number {
  return pieces(state).length;
}

function countNonSoldiers(state: XiangqiGameState): number {
  return pieces(state).filter((piece) => piece.role !== 'soldier').length;
}

function countAttackers(state: XiangqiGameState): number {
  return pieces(state).filter(
    (piece) => piece.role === 'chariot' || piece.role === 'cannon' || piece.role === 'horse',
  ).length;
}
