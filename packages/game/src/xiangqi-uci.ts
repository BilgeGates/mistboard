// Xiangqi move -> engine UCI. The two engines we drive use DIFFERENT rank
// conventions, so there are two converters:
//
//   - Pikafish (server binary): files a-i, ranks 0-9. Our XiangqiSquare is
//     `${file a-i}${rank 1-10}` (red back rank = rank 1), so every rank drops by
//     one: our 'e1' -> 'e0', 'i10' -> 'i9'.
//   - Fairy-Stockfish (browser wasm): files a-i, ranks 1-10 — IDENTICAL to our
//     XiangqiSquare notation (verified against the engine: it accepts 'h3e3' and
//     rejects the 0-indexed 'h2e2'). So the FSF converter is a plain square
//     concatenation with no shift.
//
// Do not collapse these into one "engine UCI" — the shift difference means a
// Pikafish move fed to FSF is a different (often illegal) move.
import { coordOf, type XiangqiMove, type XiangqiSquare } from './variants-xiangqi.js';

const ENGINE_FILE_CHARS = 'abcdefghi';

export function xiangqiSquareToPikafishUci(sq: XiangqiSquare): string {
  const { file, rank } = coordOf(sq);
  return `${ENGINE_FILE_CHARS[file]}${rank - 1}`;
}

export function xiangqiMoveToPikafishUci(move: XiangqiMove): string {
  return `${xiangqiSquareToPikafishUci(move.from)}${xiangqiSquareToPikafishUci(move.to)}`;
}

/** Our square notation already matches Fairy-Stockfish xiangqi UCI, so a move is
 *  just its from/to squares concatenated. */
export function xiangqiMoveToFsfUci(move: XiangqiMove): string {
  return `${move.from}${move.to}`;
}

/** Split a Fairy-Stockfish xiangqi UCI move back into our squares (for PV display).
 *  Files break the string cleanly, so ranks 1 and 10 are both unambiguous. */
export function fsfUciToXiangqiSquares(
  uci: string,
): { from: XiangqiSquare; to: XiangqiSquare } | null {
  const match = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(uci);
  if (!match) return null;
  return { from: match[1] as XiangqiSquare, to: match[2] as XiangqiSquare };
}
