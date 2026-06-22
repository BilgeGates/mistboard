// Mini / Drop Mini Xiangqi mate-in-one puzzle miner.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --events tmp/games
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --states tmp/states.json --json

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  applyDropMiniXiangqiMove,
  applyMiniXiangqiOpenMove,
  createInitialDropMiniXiangqiState,
  createInitialMiniXiangqiState,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  dropMiniXiangqiPositionRepetitionKey,
  findMiniXiangqiMateInOneCandidates,
  isDropMiniXiangqiDropMove,
  isLegalDropMiniXiangqiMove,
  isMiniXiangqiOpenLegalMove,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPuzzleMove,
  type MiniXiangqiPuzzleState,
  type MiniXiangqiPuzzleVariant,
  type MiniXiangqiSquare,
  miniXiangqiPositionRepetitionKey,
  miniXiangqiPuzzleMoveLabel,
} from '../../packages/game/src/index.ts';

type CliOptions = {
  allowMultiple: boolean;
  curated: boolean;
  events: string[];
  json: boolean;
  limit: number;
  states: string[];
};

type SourcePosition = {
  source: string;
  variant: MiniXiangqiPuzzleVariant;
  ply: number;
  state: MiniXiangqiPuzzleState;
};

type MinedCandidate = {
  key: string;
  source: string;
  variant: MiniXiangqiPuzzleVariant;
  ply: number;
  sideToMove: MiniXiangqiColor;
  move: MiniXiangqiPuzzleMove;
  moveLabel: string;
  alternatives: number;
};

type MinerStats = {
  candidatePositions: number;
  duplicatePositions: number;
  emitted: number;
  invalidEventLogs: number;
  invalidMoves: number;
  multiAnswerPositions: number;
  positions: number;
  skippedFinished: number;
};

const SQUARE_RE = /^[a-g][1-7]$/;
const DEFAULT_LIMIT = 100;

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    'allow-multiple': { type: 'boolean', default: false },
    curated: { type: 'string', default: 'true' },
    events: { type: 'string', multiple: true },
    help: { type: 'boolean', default: false, short: 'h' },
    json: { type: 'boolean', default: false },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    states: { type: 'string', multiple: true },
  },
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const options: CliOptions = {
  allowMultiple: values['allow-multiple'] === true,
  curated: parseBooleanString(values.curated, true),
  events: values.events ?? [],
  json: values.json === true,
  limit: parsePositiveInt(values.limit, DEFAULT_LIMIT),
  states: values.states ?? [],
};

const stats: MinerStats = {
  candidatePositions: 0,
  duplicatePositions: 0,
  emitted: 0,
  invalidEventLogs: 0,
  invalidMoves: 0,
  multiAnswerPositions: 0,
  positions: 0,
  skippedFinished: 0,
};
const seenPositions = new Set<string>();
const emitted: MinedCandidate[] = [];

for (const position of await loadSourcePositions(options)) {
  scanPosition(position, options, stats, seenPositions, emitted);
  if (emitted.length >= options.limit) break;
}

if (options.json) {
  console.log(
    JSON.stringify(
      {
        stats,
        candidates: emitted,
      },
      null,
      2,
    ),
  );
} else {
  for (const candidate of emitted) {
    console.log(
      [
        candidate.variant,
        candidate.source,
        `ply=${candidate.ply}`,
        `${candidate.sideToMove} to move`,
        candidate.moveLabel,
        candidate.alternatives > 1 ? `alternatives=${candidate.alternatives}` : null,
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
  console.log(
    [
      `scanned ${stats.positions} positions`,
      `emitted ${stats.emitted}`,
      `duplicates ${stats.duplicatePositions}`,
      `multi-answer ${stats.multiAnswerPositions}`,
      `invalid logs ${stats.invalidEventLogs}`,
      `invalid moves ${stats.invalidMoves}`,
    ].join('\n'),
  );
}

async function loadSourcePositions(options: CliOptions): Promise<SourcePosition[]> {
  const positions: SourcePosition[] = [];
  if (options.curated) {
    positions.push(
      ...MINI_XIANGQI_PUZZLES.map((puzzle) => ({
        source: `curated:${puzzle.id}`,
        variant: puzzle.variant,
        ply: 0,
        state: puzzle.initial,
      })),
    );
  }
  for (const path of options.states) {
    positions.push(...(await loadStatePositions(path)));
  }
  for (const path of options.events) {
    positions.push(...(await loadEventPositions(path)));
  }
  return positions;
}

async function loadStatePositions(path: string): Promise<SourcePosition[]> {
  const fullPath = resolve(path);
  const records = await readRecords(fullPath);
  const positions: SourcePosition[] = [];
  let index = 0;
  for (const record of records) {
    index += 1;
    const variant = parseVariant(readRecordField(record, 'variant'));
    const state = readRecordField(record, 'state');
    if (!variant || !state || typeof state !== 'object') continue;
    positions.push({
      source: String(
        readRecordField(record, 'source') ?? `${relative(process.cwd(), fullPath)}#${index}`,
      ),
      variant,
      ply: Number(readRecordField(record, 'ply') ?? 0),
      state: state as MiniXiangqiPuzzleState,
    });
  }
  return positions;
}

async function loadEventPositions(path: string): Promise<SourcePosition[]> {
  const paths = await listInputFiles(resolve(path));
  const positions: SourcePosition[] = [];
  for (const fullPath of paths) {
    const records = await readRecords(fullPath);
    if (records.length === 0) continue;
    const first = readObject(records[0]);
    if (first?.type !== 'room-created') {
      stats.invalidEventLogs += 1;
      continue;
    }
    const variant = parseVariant(first.gameSpecId ?? first.variant);
    const roomId = typeof first.roomId === 'string' ? first.roomId : fileRoomId(fullPath);
    if (!variant) {
      stats.invalidEventLogs += 1;
      continue;
    }

    let ply = 0;
    let state: MiniXiangqiPuzzleState =
      variant === MINI_XIANGQI_SPEC_ID
        ? createInitialMiniXiangqiState(roomId)
        : createInitialDropMiniXiangqiState(roomId);
    const sourceBase = relative(process.cwd(), fullPath);
    positions.push({ source: `${sourceBase}:start`, variant, ply, state });

    for (const record of records.slice(1)) {
      const event = readObject(record);
      if (!event || event.type !== 'move-played') continue;
      const move = parseMove(event.move);
      if (!move) {
        stats.invalidMoves += 1;
        continue;
      }
      const next = applyMove(variant, state, move);
      if (!next) {
        stats.invalidMoves += 1;
        continue;
      }
      state = next;
      ply += 1;
      positions.push({ source: `${sourceBase}:ply-${ply}`, variant, ply, state });
    }
  }
  return positions;
}

function scanPosition(
  position: SourcePosition,
  options: CliOptions,
  stats: MinerStats,
  seen: Set<string>,
  emitted: MinedCandidate[],
): void {
  stats.positions += 1;
  if (position.state.status.type !== 'playing') {
    stats.skippedFinished += 1;
    return;
  }
  const key = `${position.variant}|${positionKey(position.variant, position.state)}`;
  if (seen.has(key)) {
    stats.duplicatePositions += 1;
    return;
  }
  seen.add(key);

  const candidates = findMiniXiangqiMateInOneCandidates(position.variant, position.state);
  if (candidates.length === 0) return;
  stats.candidatePositions += 1;
  if (candidates.length > 1 && !options.allowMultiple) {
    stats.multiAnswerPositions += 1;
    return;
  }

  for (const candidate of candidates) {
    emitted.push({
      key,
      source: position.source,
      variant: position.variant,
      ply: position.ply,
      sideToMove: position.state.status.turn,
      move: candidate.move,
      moveLabel: miniXiangqiPuzzleMoveLabel(candidate.move),
      alternatives: candidates.length,
    });
    stats.emitted += 1;
    if (emitted.length >= options.limit) return;
  }
}

async function listInputFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];
  const names = await readdir(path);
  return names
    .filter((name) => ['.json', '.jsonl'].includes(extname(name)))
    .sort()
    .map((name) => join(path, name));
}

async function readRecords(path: string): Promise<unknown[]> {
  const raw = await readFile(path, 'utf8');
  if (extname(path) === '.jsonl') {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed;
  const records = readRecordField(parsed, 'records') ?? readRecordField(parsed, 'states');
  if (Array.isArray(records)) return records;
  return [parsed];
}

function applyMove(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  move: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleState | null {
  if (variant === MINI_XIANGQI_SPEC_ID) {
    if (
      isDropMiniXiangqiDropMove(move) ||
      !isMiniXiangqiOpenLegalMove(state as MiniXiangqiGameState, move)
    ) {
      return null;
    }
    return applyMiniXiangqiOpenMove(state as MiniXiangqiGameState, move);
  }
  if (!isLegalDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move)) return null;
  return applyDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move);
}

function parseMove(value: unknown): MiniXiangqiPuzzleMove | null {
  const move = readObject(value);
  if (!move) return null;
  if (
    typeof move.from === 'string' &&
    isMiniXiangqiSquare(move.from) &&
    typeof move.to === 'string' &&
    isMiniXiangqiSquare(move.to)
  ) {
    return { from: move.from, to: move.to } as MiniXiangqiMove;
  }
  if (
    typeof move.drop === 'string' &&
    isDropRole(move.drop) &&
    typeof move.to === 'string' &&
    isMiniXiangqiSquare(move.to)
  ) {
    return { drop: move.drop, to: move.to } as DropMiniXiangqiMove;
  }
  return null;
}

function positionKey(variant: MiniXiangqiPuzzleVariant, state: MiniXiangqiPuzzleState): string {
  return variant === MINI_XIANGQI_SPEC_ID
    ? miniXiangqiPositionRepetitionKey(state as MiniXiangqiGameState)
    : dropMiniXiangqiPositionRepetitionKey(state as DropMiniXiangqiGameState);
}

function parseVariant(value: unknown): MiniXiangqiPuzzleVariant | null {
  return value === MINI_XIANGQI_SPEC_ID || value === DROP_MINI_XIANGQI_SPEC_ID ? value : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readRecordField(value: unknown, key: string): unknown {
  return readObject(value)?.[key];
}

function isMiniXiangqiSquare(value: string): value is MiniXiangqiSquare {
  return SQUARE_RE.test(value);
}

function isDropRole(value: string): value is Exclude<DropMiniXiangqiMove, MiniXiangqiMove>['drop'] {
  return value === 'chariot' || value === 'horse' || value === 'cannon' || value === 'soldier';
}

function fileRoomId(path: string): string {
  return path
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.(jsonl|json)$/i, '');
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanString(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'false' || value === '0' || value === 'no') return false;
  if (value === 'true' || value === '1' || value === 'yes') return true;
  return fallback;
}

function printUsage(): void {
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts [options]

Options:
  --curated=false         Do not scan built-in curated puzzle seeds.
  --events PATH           Scan a JSON/JSONL tenant event log file, or a directory of logs.
  --states PATH           Scan JSON/JSONL records shaped like { variant, state, ply?, source? }.
  --allow-multiple        Emit positions with more than one mate-in-one move.
  --limit N               Maximum emitted candidates. Default: ${DEFAULT_LIMIT}.
  --json                  Print structured JSON instead of compact text.`);
}
