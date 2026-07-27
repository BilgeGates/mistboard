// FEN bridge between canonical Jungle (Dou Shou Qi) state and the `jungle-engine`
// Rust UCI binary (jungle_rust::engine).
//
// Jungle is PERFECT-INFORMATION, so — unlike banqi/jieqi — there is no redaction:
// the full board is handed to the engine. The binary's FEN is
//   "<board> <turn> <progressClock> <moveNumber>"
// with ranks emitted HIGH→LOW (rank 9 first), files a..g left→right, run-length
// digits for empty squares, and '/' between ranks. Red pieces are UPPERCASE, black
// lowercase; role letters are R C D W P T L E (P = leoPard so L stays Lion) — the
// SAME mapping as JUNGLE_ROLE_LETTER, which keeps the kernel and the engine in
// lockstep. Parity against the binary is pinned by jungle-fen.test.ts.
//
// Lives in @mistboard/game (not apps/server) so the in-browser client engine
// (jungle-wasm) builds the identical FEN the server does — one encoder, both sides.

import {
  JUNGLE_DENS,
  JUNGLE_HEIGHT,
  JUNGLE_ROLE_LETTER,
  JUNGLE_WIDTH,
  type JungleBoard,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePieceRole,
  type JungleSquare,
  jungleIsWater,
  junglePositionRepetitionKey,
  jungleSquareOf,
} from './variants-jungle.js';

// Canonical state → the FEN the binary parses. Matches jungle_rust::engine::to_fen
// byte-for-byte (verified in jungle-fen.test.ts against binary-produced goldens).
export function jungleStateToEngineFen(state: JungleGameState): string {
  const rows: string[] = [];
  for (let rank = JUNGLE_HEIGHT; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < JUNGLE_WIDTH; file += 1) {
      const piece = state.board[jungleSquareOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      const letter = JUNGLE_ROLE_LETTER[piece.role];
      row += piece.color === 'red' ? letter : letter.toLowerCase();
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  // The engine is only queried mid-game, so turn is always defined; default to red
  // for type totality (a finished/aborted state is never sent to the engine).
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  const turnChar = turn === 'red' ? 'r' : 'b';
  return `${rows.join('/')} ${turnChar} ${state.progressClock} ${state.moveNumber}`;
}

/**
 * Representative FENs for positions that have already occurred twice in a game.
 *
 * The engine hashes only board + side to move, ignoring the progress clock and move
 * number carried by the FEN. Seeding one representative for every twice-seen kernel
 * repetition key lets the search score re-entering that position as the third occurrence
 * and therefore a draw. Finished states are excluded because their status no longer
 * carries the side to move that belongs to the repetition key.
 */
export function jungleRepSeedFens(states: readonly JungleGameState[]): string[] {
  const firstFen = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const state of states) {
    if (state.status.type !== 'playing') continue;
    const key = junglePositionRepetitionKey(state);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstFen.has(key)) firstFen.set(key, jungleStateToEngineFen(state));
  }
  const seeds: string[] = [];
  for (const [key, count] of counts) {
    if (count >= 2) seeds.push(firstFen.get(key)!);
  }
  return seeds;
}

// The binary speaks "<from><to>" in the SAME algebraic coords as the kernel
// (files a..g, ranks 1..9), e.g. "d8d9". Jungle has no promotions/flips, so there
// is never a suffix.
export function jungleMoveToEngineUci(move: JungleMove): string {
  return `${move.from}${move.to}`;
}

const ENGINE_UCI_RE = /^([a-g][1-9])([a-g][1-9])$/;

export function engineUciToJungleMove(uci: string | null | undefined): JungleMove | null {
  if (!uci) return null;
  const match = ENGINE_UCI_RE.exec(uci.trim());
  if (!match) return null;
  return { from: match[1] as JungleSquare, to: match[2] as JungleSquare };
}

// ── FEN parsing ──────────────────────────────────────────────────────────────
// The inverse of jungleStateToEngineFen: reads a FEN back into canonical state so
// a hand-set position can seed a study chapter or an analysis board. Rejections
// are specific because a bad FEN is nearly always a mistyped diagram, and the
// message is the only clue the author gets.
//
// What is rejected is limited to what CANNOT arise from play: a piece in water
// that is not a rat, a piece standing in its own den, a duplicated animal, an
// already-decided position (a piece in the enemy den, a side with no pieces
// left). Everything else, including lopsided material, is a legal study.

export type ParseJungleFenResult =
  | { ok: true; state: JungleGameState }
  | { ok: false; error: string };

const LETTER_TO_JUNGLE_ROLE: Record<string, JunglePieceRole> = Object.fromEntries(
  Object.entries(JUNGLE_ROLE_LETTER).map(([role, letter]) => [
    letter.toLowerCase(),
    role as JunglePieceRole,
  ]),
);

export function parseJungleFen(fen: string, gameId = 'fen-import'): ParseJungleFenResult {
  const fields = fen.trim().split(/\s+/);
  const placement = fields[0];
  if (!placement) return { ok: false, error: 'Empty FEN.' };

  const rows = placement.split('/');
  if (rows.length !== JUNGLE_HEIGHT) {
    return {
      ok: false,
      error: `Expected ${JUNGLE_HEIGHT} ranks in the placement, got ${rows.length}.`,
    };
  }

  const board: JungleBoard = {};
  const counts: Record<JungleColor, Partial<Record<JunglePieceRole, number>>> = {
    red: {},
    black: {},
  };
  for (let i = 0; i < JUNGLE_HEIGHT; i += 1) {
    const rank = JUNGLE_HEIGHT - i;
    let file = 0;
    for (const ch of rows[i]!) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      const role = LETTER_TO_JUNGLE_ROLE[ch.toLowerCase()];
      if (!role) return { ok: false, error: `Unknown piece "${ch}" on rank ${rank}.` };
      if (file > JUNGLE_WIDTH - 1) {
        return { ok: false, error: `Rank ${rank} runs past ${JUNGLE_WIDTH} files.` };
      }
      const color: JungleColor = /[A-Z]/.test(ch) ? 'red' : 'black';
      const square = jungleSquareOf(file, rank);
      if (jungleIsWater(square) && role !== 'rat') {
        return {
          ok: false,
          error: `Only the rat may stand in water; found a ${role} on ${square}.`,
        };
      }
      if (square === JUNGLE_DENS[color]) {
        return { ok: false, error: `The ${color} ${role} on ${square} is in its own den.` };
      }
      counts[color][role] = (counts[color][role] ?? 0) + 1;
      board[square] = { color, role };
      file += 1;
    }
    if (file !== JUNGLE_WIDTH) {
      return { ok: false, error: `Rank ${rank} covers ${file} files, expected ${JUNGLE_WIDTH}.` };
    }
  }

  for (const color of ['red', 'black'] as const) {
    const roles = Object.entries(counts[color]);
    if (roles.length === 0) {
      return { ok: false, error: `The ${color} side has no pieces, so the game is already over.` };
    }
    for (const [role, count] of roles) {
      if (count > 1)
        return { ok: false, error: `Two ${color} ${role}s: a side has one of each animal.` };
    }
    // Reaching the opponent's den ends the game, so a piece sitting there is a
    // finished position, not a study start.
    const enemyDen = JUNGLE_DENS[color === 'red' ? 'black' : 'red'];
    if (board[enemyDen]?.color === color) {
      return {
        ok: false,
        error: `A ${color} piece already occupies the enemy den on ${enemyDen}.`,
      };
    }
  }

  const turnToken = fields[1] ?? 'r';
  let turn: JungleColor;
  if (turnToken === 'r' || turnToken === 'w') turn = 'red';
  else if (turnToken === 'b') turn = 'black';
  else return { ok: false, error: `Unknown side-to-move "${turnToken}" (expected r or b).` };

  const progressField = fields[2];
  const moveField = fields[3];
  const base: JungleGameState = {
    id: gameId,
    board,
    status: { type: 'playing', turn },
    moveNumber: moveField && /^\d+$/.test(moveField) ? Number(moveField) : 1,
    progressClock: progressField && /^\d+$/.test(progressField) ? Number(progressField) : 0,
    positionCounts: {},
  };
  return {
    ok: true,
    state: { ...base, positionCounts: { [junglePositionRepetitionKey(base)]: 1 } },
  };
}
