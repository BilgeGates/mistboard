// Format-agnostic import of a standard-xiangqi game into canonical moves.
//
// Xiangqi move notation is fragmented (coordinate, engine UCI, WXF/human,
// Chinese, DhtmlXQ records), so we do NOT ask the user to pick one: every format
// is a codec that normalizes down to our canonical XiangqiMove ({from,to}), and
// a legality-guided sniffer picks the codec whose moves actually replay into a
// legal game from the standard opening. That single trick resolves the two hard
// ambiguities at once: coordinate 1-indexed vs 0-indexed (the same token string
// is valid in both, only one replays legally), and relative-notation
// disambiguation (WXF/Chinese need the board to know WHICH piece moves).
//
// resolveMove is board-aware for that reason; coordinate codecs ignore the state.

import {
  coordOf,
  createInitialXiangqiState,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from './variants-xiangqi.js';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
  isStandardXiangqiLegalMove,
} from './variants-xiangqi-standard.js';
import { fsfUciToXiangqiSquares, pikafishUciToXiangqiSquares } from './xiangqi-uci.js';

export type XiangqiMoveFormat =
  | 'coordinate' // our square notation = Fairy-Stockfish UCI: files a-i, ranks 1-10
  | 'uci-0indexed' // Pikafish / UCCI / ICCS style: files a-i, ranks 0-9
  | 'wxf' // WXF / human relative notation: C2.5, H2+3, +C.5
  | 'chinese' // Chinese relative notation: 炮二平五, 马8进7, 前炮平五
  | 'dhtmlxq'; // dpxq.com / dhtmlxq packed record: 4 digits per move

export interface XiangqiImportResult {
  moves: XiangqiMove[];
  /** The format that replayed legally, or null when nothing matched. */
  format: XiangqiMoveFormat | null;
  /** Set when no codec produced a fully-legal game; the most useful reason. */
  error?: string;
}

// A codec turns one notation into canonical moves. detect() is a cheap
// whole-input shape gate that narrows candidates before the (more expensive)
// legality replay; resolveMove() decodes one token, board-aware so relative
// notations can disambiguate against the legal move set.
interface XiangqiNotationCodec {
  format: XiangqiMoveFormat;
  detect(input: string): boolean;
  tokenize(input: string): string[];
  resolveMove(token: string, state: XiangqiGameState): XiangqiMove | null;
}

const MOVE_NUMBER = /^\d+\.?$/; // "1." / "23" ordinals, dropped

// Whitespace/comma separated, minus bare move-number ordinals.
function splitTokens(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !MOVE_NUMBER.test(token));
}

const COORD1_MOVE = /^[a-i](?:10|[1-9])-?[a-i](?:10|[1-9])$/;
const coordinate1Codec: XiangqiNotationCodec = {
  format: 'coordinate',
  detect: (input) => {
    const tokens = splitTokens(input);
    return tokens.length > 0 && tokens.every((token) => COORD1_MOVE.test(token));
  },
  tokenize: splitTokens,
  resolveMove: (token) => {
    const squares = fsfUciToXiangqiSquares(token.replace(/-/g, ''));
    return squares ? { from: squares.from, to: squares.to } : null;
  },
};

const COORD0_MOVE = /^[a-i][0-9]-?[a-i][0-9]$/;
const coordinate0Codec: XiangqiNotationCodec = {
  format: 'uci-0indexed',
  detect: (input) => {
    const tokens = splitTokens(input);
    return tokens.length > 0 && tokens.every((token) => COORD0_MOVE.test(token));
  },
  tokenize: splitTokens,
  resolveMove: (token) => {
    const squares = pikafishUciToXiangqiSquares(token.replace(/-/g, ''));
    return squares ? { from: squares.from, to: squares.to } : null;
  },
};

// --- relative notation (WXF + Chinese share this resolver) -------------------
// Both notations name a move relative to the mover: which piece (by file, or
// front/rear when stacked), which direction (advance / retreat / traverse), and
// an argument that is a destination FILE for pieces that change file when moving
// vertically (horse/elephant/advisor) or a RANK COUNT for straight movers
// (chariot/cannon/soldier/general). File numbers run 1-9 from each side's own
// right: red file N is our file index 9-N (file 2 = 'h'), black file N is index
// N-1 (file 2 = 'b'). Verified against the documented game in articles/content
// (h3e3 = C2.5, h1g3 = H2+3).

type RelativeSelector =
  | { kind: 'file'; wxfFile: number }
  | { kind: 'tandem'; end: 'front' | 'rear' };
interface RelativeMoveSpec {
  role: XiangqiPieceRole;
  selector: RelativeSelector;
  /** '+' advance, '-' retreat, '.' traverse (we normalize '=' to '.'). */
  op: '+' | '-' | '.';
  /** Destination file for '.', and for '+'/'-' of a file-arg role; else rank count. */
  arg: number;
}

// Roles whose +/- argument is the destination FILE (they always change file on a
// vertical move); everything else uses a rank-count argument.
const FILE_ARG_ROLES = new Set<XiangqiPieceRole>(['horse', 'elephant', 'advisor']);

function wxfFileNumber(fileIndex: number, color: XiangqiColor): number {
  return color === 'red' ? 9 - fileIndex : fileIndex + 1;
}

// Resolve a relative spec to the single legal move that fits — we filter the
// rules engine's legal moves rather than re-deriving piece geometry. Returns null
// if the spec is unsatisfiable or ambiguous (so the codec fails cleanly).
function resolveRelativeMove(state: XiangqiGameState, spec: RelativeMoveSpec): XiangqiMove | null {
  if (state.status.type !== 'playing') return null;
  const color = state.status.turn;
  const forwardUp = color === 'red';

  const sources = Object.entries(state.board)
    .filter(([, piece]) => piece && piece.color === color && piece.role === spec.role)
    .map(([square]) => square as XiangqiSquare);

  let candidates: XiangqiSquare[];
  if (spec.selector.kind === 'file') {
    const wanted = spec.selector.wxfFile;
    candidates = sources.filter((sq) => wxfFileNumber(coordOf(sq).file, color) === wanted);
  } else {
    // Tandem: the file holding >=2 of this role, ordered front (nearest enemy) to rear.
    const byFile = new Map<number, XiangqiSquare[]>();
    for (const sq of sources) {
      const file = coordOf(sq).file;
      const list = byFile.get(file) ?? [];
      list.push(sq);
      byFile.set(file, list);
    }
    const stacked = [...byFile.values()].find((list) => list.length >= 2) ?? [];
    const ordered = [...stacked].sort((a, b) =>
      forwardUp ? coordOf(b).rank - coordOf(a).rank : coordOf(a).rank - coordOf(b).rank,
    );
    const pick = spec.selector.end === 'front' ? ordered[0] : ordered[ordered.length - 1];
    candidates = pick ? [pick] : [];
  }

  const legal = getStandardXiangqiLegalMoves(state);
  const matches: XiangqiMove[] = [];
  for (const from of candidates) {
    for (const move of legal) {
      if (move.from !== from) continue;
      const a = coordOf(move.from);
      const b = coordOf(move.to);
      if (spec.op === '.') {
        if (b.rank === a.rank && wxfFileNumber(b.file, color) === spec.arg) matches.push(move);
        continue;
      }
      const goesForward = forwardUp ? b.rank > a.rank : b.rank < a.rank;
      if (goesForward !== (spec.op === '+')) continue;
      if (FILE_ARG_ROLES.has(spec.role)) {
        if (wxfFileNumber(b.file, color) === spec.arg) matches.push(move);
      } else if (b.file === a.file && Math.abs(b.rank - a.rank) === spec.arg) {
        matches.push(move);
      }
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

// --- WXF codec ---------------------------------------------------------------

const WXF_LETTER_TO_ROLE: Record<string, XiangqiPieceRole> = {
  K: 'general',
  A: 'advisor',
  E: 'elephant',
  B: 'elephant', // Bishop
  H: 'horse',
  N: 'horse', // kNight
  R: 'chariot',
  C: 'cannon',
  P: 'soldier',
};
// normal <letter><file 1-9><op><arg 1-9>, or tandem <+|-><letter><op><arg>.
const WXF_TOKEN = /^(?:([kaebhnrcp])([1-9])|([+-])([kaebhnrcp]))([+\-.=])([1-9])$/i;

function parseWxfToken(token: string): RelativeMoveSpec | null {
  const match = WXF_TOKEN.exec(token);
  if (!match) return null;
  const role = WXF_LETTER_TO_ROLE[(match[1] ?? match[4]!).toUpperCase()];
  if (!role) return null;
  const selector: RelativeSelector = match[1]
    ? { kind: 'file', wxfFile: Number(match[2]) }
    : { kind: 'tandem', end: match[3] === '+' ? 'front' : 'rear' };
  const opChar = match[5]!;
  const op = opChar === '=' ? '.' : (opChar as '+' | '-' | '.');
  return { role, selector, op, arg: Number(match[6]) };
}

const wxfCodec: XiangqiNotationCodec = {
  format: 'wxf',
  detect: (input) => {
    const tokens = splitTokens(input);
    return tokens.length > 0 && tokens.every((token) => WXF_TOKEN.test(token));
  },
  tokenize: splitTokens,
  resolveMove: (token, state) => {
    const spec = parseWxfToken(token);
    return spec ? resolveRelativeMove(state, spec) : null;
  },
};

// --- Chinese codec -----------------------------------------------------------
// Same relative structure as WXF, in CJK: piece char, then either a file numeral
// or a 前/后 (front/rear) tandem marker, an operator (进 advance / 退 retreat /
// 平 traverse), and an argument numeral. Red conventionally writes numerals in
// Chinese (一-九), black in Arabic (1-9); we accept either glyph and let the
// mover's colour drive the file mapping (identical to WXF). Every move is exactly
// four characters, so a spaceless record chunks cleanly by four.

const CN_PIECE_TO_ROLE: Record<string, XiangqiPieceRole> = {
  车: 'chariot',
  車: 'chariot',
  马: 'horse',
  馬: 'horse',
  相: 'elephant',
  象: 'elephant',
  仕: 'advisor',
  士: 'advisor',
  帅: 'general',
  将: 'general',
  帥: 'general',
  將: 'general',
  炮: 'cannon',
  砲: 'cannon',
  兵: 'soldier',
  卒: 'soldier',
};
const CN_OP: Record<string, '+' | '-' | '.'> = { 进: '+', 進: '+', 退: '-', 平: '.' };
const CN_TANDEM: Record<string, 'front' | 'rear'> = { 前: 'front', 后: 'rear', 後: 'rear' };
const CN_NUMERAL: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
};

// Drop move-number ordinals (digits + period) and all whitespace/commas, leaving
// a run of 4-character moves.
function chineseCleaned(input: string): string {
  return input.replace(/\d+\./g, '').replace(/[\s,]+/g, '');
}

function chineseChunks(input: string): string[] {
  const cleaned = chineseCleaned(input);
  const chunks: string[] = [];
  for (let i = 0; i + 4 <= cleaned.length; i += 4) chunks.push(cleaned.slice(i, i + 4));
  return chunks;
}

function parseChineseToken(token: string): RelativeMoveSpec | null {
  if (token.length !== 4) return null;
  const c0 = token[0]!;
  const c1 = token[1]!;
  const op = CN_OP[token[2]!];
  const arg = CN_NUMERAL[token[3]!];
  if (!op || !arg) return null;
  let role: XiangqiPieceRole | undefined;
  let selector: RelativeSelector;
  if (CN_TANDEM[c0]) {
    role = CN_PIECE_TO_ROLE[c1];
    selector = { kind: 'tandem', end: CN_TANDEM[c0]! };
  } else {
    role = CN_PIECE_TO_ROLE[c0];
    const file = CN_NUMERAL[c1];
    if (!file) return null;
    selector = { kind: 'file', wxfFile: file };
  }
  return role ? { role, selector, op, arg } : null;
}

const chineseCodec: XiangqiNotationCodec = {
  format: 'chinese',
  detect: (input) => {
    const cleaned = chineseCleaned(input);
    if (cleaned.length === 0 || cleaned.length % 4 !== 0) return false;
    const chunks = chineseChunks(input);
    return chunks.length > 0 && chunks.every((token) => parseChineseToken(token) !== null);
  },
  tokenize: chineseChunks,
  resolveMove: (token, state) => {
    const spec = parseChineseToken(token);
    return spec ? resolveRelativeMove(state, spec) : null;
  },
};

// --- DhtmlXQ codec -----------------------------------------------------------
// dpxq.com / dhtmlxq records pack each move as 4 digits: fromCol fromRow toCol
// toRow, columns 0-8 left-to-right (= our file index) and rows 0-9 with row 0 at
// black's top, so our rank is 10 - row. Confirmed against the dpxq clipboard
// writer (GGchessQi) and anchored by 炮二平五 = h3->e3 = "7747". Accepts either a
// raw movelist digit string or a full [DhtmlXQ_movelist]...[ block. Only games
// from the standard opening import (a custom [DhtmlXQ_binit] start is not applied).

function dhtmlxqDigits(input: string): string {
  const tag = input.match(/\[DhtmlXQ_movelist\]([^[]*)/i);
  return (tag ? tag[1]! : input).replace(/\D/g, '');
}

function dhtmlxqChunks(input: string): string[] {
  const digits = dhtmlxqDigits(input);
  const chunks: string[] = [];
  for (let i = 0; i + 4 <= digits.length; i += 4) chunks.push(digits.slice(i, i + 4));
  return chunks;
}

function decodeDhtmlxqMove(token: string): XiangqiMove | null {
  if (!/^\d{4}$/.test(token)) return null;
  const fromCol = Number(token[0]);
  const fromRow = Number(token[1]);
  const toCol = Number(token[2]);
  const toRow = Number(token[3]);
  if (fromCol > 8 || toCol > 8) return null; // columns are 0-8; rows 0-9 always fit
  const file = (col: number): string => String.fromCharCode(97 + col); // 'a' + col
  return {
    from: `${file(fromCol)}${10 - fromRow}` as XiangqiSquare,
    to: `${file(toCol)}${10 - toRow}` as XiangqiSquare,
  };
}

const dhtmlxqCodec: XiangqiNotationCodec = {
  format: 'dhtmlxq',
  detect: (input) => {
    const digits = dhtmlxqDigits(input);
    return digits.length >= 4 && digits.length % 4 === 0;
  },
  tokenize: dhtmlxqChunks,
  resolveMove: (token) => decodeDhtmlxqMove(token),
};

// Priority order. Distinctive notations (Chinese CJK chars, WXF piece letters +
// operators, DhtmlXQ pure digits) go first; the two coordinate codecs overlap for
// ranks 1-9, and coordinate (1-indexed, our native) is tried before uci-0indexed
// so a game legal under both is read as ours. A rank-10 token is unambiguously
// 1-indexed (fails the 0-indexed shape) and a rank-0 token is unambiguously
// 0-indexed, so only the genuinely-ambiguous middle needs the legality tiebreak.
const CODECS: XiangqiNotationCodec[] = [
  chineseCodec,
  wxfCodec,
  dhtmlxqCodec,
  coordinate1Codec,
  coordinate0Codec,
];

/** Parse a pasted game in any supported notation into canonical moves. Returns
 *  the detected format, or an error when nothing replays legally. */
export function importXiangqiGame(input: string): XiangqiImportResult {
  const trimmed = input.trim();
  if (!trimmed) return { moves: [], format: null, error: 'Enter a game to import.' };
  let firstError: string | undefined;
  for (const codec of CODECS) {
    if (!codec.detect(trimmed)) continue;
    const attempt = replayWithCodec(codec, trimmed);
    if (attempt.moves.length > 0 && !attempt.error) {
      return { moves: attempt.moves, format: codec.format };
    }
    firstError ??= attempt.error;
  }
  return { moves: [], format: null, error: firstError ?? 'Unrecognized move notation.' };
}

// Fold a codec's tokens through the rules engine; a token that does not resolve
// to a legal move fails the whole codec (so the sniffer moves on to the next).
function replayWithCodec(
  codec: XiangqiNotationCodec,
  input: string,
): { moves: XiangqiMove[]; error?: string } {
  const tokens = codec.tokenize(input);
  if (tokens.length === 0) return { moves: [], error: 'No moves found.' };
  let state = createInitialXiangqiState('import');
  const moves: XiangqiMove[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const move = codec.resolveMove(token, state);
    if (!move || state.status.type !== 'playing' || !isStandardXiangqiLegalMove(state, move)) {
      return { moves, error: `Move ${index + 1} ("${token}") is not legal as ${codec.format}.` };
    }
    state = applyStandardXiangqiMove(state, move);
    moves.push(move);
  }
  return { moves };
}
