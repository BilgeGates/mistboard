#!/usr/bin/env node
// Random self-play Fog of War games. Emits mistboard-shaped event logs as JSONL
// plus a manifest with per-game rule-edge coverage flags. Used to feed the
// python-fow-lab parity test (P1 gate). See docs/fog-of-war/engine-roadmap.md.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { darkChessVariant } from '@mistboard/game';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    'max-plies': { type: 'string', default: '300' },
    out: { type: 'string', default: 'research/python-fow-lab/corpora/random-ep-bias-v2' },
    bias: { type: 'string', default: 'ep-mild' },
  },
});

const biasMode = values.bias;
const EP_BIAS_WEIGHT = 8;

const gameCount = Number.parseInt(values.games, 10);
const baseSeed = Number.parseInt(values.seed, 10);
const maxPlies = Number.parseInt(values['max-plies'], 10);
const outDir = resolve(repoRoot, values.out);
const gamesDir = join(outDir, 'games');

const viewsDir = join(outDir, 'views');
await mkdir(gamesDir, { recursive: true });
await mkdir(viewsDir, { recursive: true });

const manifestEntries = [];
const totals = {
  has_capture: 0,
  has_promotion: 0,
  has_en_passant: 0,
  has_castling: 0,
  ended_by_king_capture: 0,
  truncated: 0,
};

for (let i = 0; i < gameCount; i++) {
  const seed = baseSeed + i;
  const result = playRandomGame(seed, maxPlies);
  const fileName = `game-${String(seed).padStart(6, '0')}.jsonl`;
  const filePath = join(gamesDir, fileName);
  await writeFile(filePath, `${result.events.map((e) => JSON.stringify(e)).join('\n')}\n`);

  const viewsPath = join(viewsDir, fileName);
  await writeFile(viewsPath, `${result.views.map((v) => JSON.stringify(v)).join('\n')}\n`);

  const entry = {
    path: relative(outDir, filePath),
    views_path: relative(outDir, viewsPath),
    seed,
    plies: result.plies,
    winner: result.winner,
    end_reason: result.endReason,
    ended_by_king_capture: result.endedByKingCapture,
    truncated: result.truncated,
    has_capture: result.flags.has_capture,
    has_promotion: result.flags.has_promotion,
    has_en_passant: result.flags.has_en_passant,
    has_castling: result.flags.has_castling,
  };
  manifestEntries.push(entry);

  for (const k of Object.keys(totals)) totals[k] += entry[k] ? 1 : 0;
}

const manifest = {
  generator: biasMode === 'none' ? 'random-v1' : `random-${biasMode}-v2`,
  bias: biasMode,
  ep_bias_weight: biasMode === 'ep-mild' ? EP_BIAS_WEIGHT : null,
  generated_at: new Date().toISOString(),
  variant: 'fog-of-war',
  base_seed: baseSeed,
  game_count: gameCount,
  max_plies: maxPlies,
  totals,
  games: manifestEntries,
};

await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const pct = (n) => `${((n / gameCount) * 100).toFixed(0)}%`;
console.log(`wrote ${gameCount} games to ${relative(repoRoot, outDir)}`);
console.log(`coverage:`);
console.log(`  capture:        ${totals.has_capture}/${gameCount} (${pct(totals.has_capture)})`);
console.log(
  `  promotion:      ${totals.has_promotion}/${gameCount} (${pct(totals.has_promotion)})`,
);
console.log(
  `  en passant:     ${totals.has_en_passant}/${gameCount} (${pct(totals.has_en_passant)})`,
);
console.log(`  castling:       ${totals.has_castling}/${gameCount} (${pct(totals.has_castling)})`);
console.log(
  `  king-cap end:   ${totals.ended_by_king_capture}/${gameCount} (${pct(totals.ended_by_king_capture)})`,
);
console.log(`  truncated:      ${totals.truncated}/${gameCount} (${pct(totals.truncated)})`);

function playRandomGame(seed, plyCap) {
  const rng = mulberry32(seed);
  const roomId = `corpus-random-${seed}`;
  let state = darkChessVariant.createInitialState(roomId);

  const events = [{ type: 'room-created', at: 0, roomId, variant: 'fog-of-war', offer: [] }];
  const views = [snapshotViews(state, 0)];
  const flags = {
    has_capture: false,
    has_promotion: false,
    has_en_passant: false,
    has_castling: false,
  };
  let plies = 0;
  let endedByKingCapture = false;
  let truncated = false;

  while (state.status.type === 'playing') {
    if (plies >= plyCap) {
      truncated = true;
      break;
    }
    const turn = state.status.turn;
    const legals = darkChessVariant.getLegalMoves(state, turn);
    if (legals.length === 0) break; // defensive — variant should mark finished

    const move = pickMove(state, legals, rng);
    classify(state, move, flags);

    const targetBefore = state.board[move.to];
    state = darkChessVariant.applyMove(state, move);
    plies += 1;
    events.push({
      type: 'move-played',
      at: plies,
      roomId,
      color: turn,
      move,
    });
    views.push(snapshotViews(state, plies));

    if (state.status.type === 'finished' && targetBefore?.role === 'king') {
      endedByKingCapture = true;
    }
  }

  const winner = state.status.type === 'finished' ? state.status.winner : null;
  const endReason =
    state.status.type === 'finished' ? state.status.reason : truncated ? 'truncated' : 'unfinished';

  return { events, views, plies, winner, endReason, endedByKingCapture, truncated, flags };
}

function snapshotViews(state, ply) {
  // Canonical TS view of which squares each color sees at this state.
  // Sorted for stable on-disk diff and trivial set comparison in the lab.
  // `final: true` marks post-game-end snapshots — TS short-circuits visibility
  // to own-pieces-only on finished states; the lab doesn't replicate that, so
  // parity comparisons skip these by design.
  const whiteView = darkChessVariant.getPlayerView(state, 'white');
  const blackView = darkChessVariant.getPlayerView(state, 'black');
  const out = {
    ply,
    white: [...whiteView.visibleSquares].sort(),
    black: [...blackView.visibleSquares].sort(),
  };
  if (state.status.type === 'finished') out.final = true;
  return out;
}

function pickMove(state, legals, rng) {
  if (biasMode === 'none') return legals[Math.floor(rng() * legals.length)];

  // ep-mild: weight EP-capture moves by EP_BIAS_WEIGHT, all others by 1.
  // Mild because per-opportunity boost, and EP opportunities are themselves rare.
  const epIndices = [];
  for (let i = 0; i < legals.length; i++) {
    if (isEnPassantMove(state, legals[i])) epIndices.push(i);
  }
  if (epIndices.length === 0) return legals[Math.floor(rng() * legals.length)];

  const totalWeight = legals.length - epIndices.length + epIndices.length * EP_BIAS_WEIGHT;
  let r = rng() * totalWeight;
  const epSet = new Set(epIndices);
  for (let i = 0; i < legals.length; i++) {
    const w = epSet.has(i) ? EP_BIAS_WEIGHT : 1;
    if (r < w) return legals[i];
    r -= w;
  }
  return legals[legals.length - 1];
}

function isEnPassantMove(state, move) {
  const piece = state.board[move.from];
  if (piece?.role !== 'pawn') return false;
  if (state.board[move.to]) return false;
  if (fileDelta(move.from, move.to) !== 1) return false;
  return state.enPassantSquare === move.to;
}

function classify(state, move, flags) {
  const piece = state.board[move.from];
  const target = state.board[move.to];

  if (move.promotion) flags.has_promotion = true;
  if (target) flags.has_capture = true;

  if (
    piece?.role === 'pawn' &&
    !target &&
    fileDelta(move.from, move.to) === 1 &&
    state.enPassantSquare === move.to
  ) {
    flags.has_en_passant = true;
    flags.has_capture = true;
  }

  if (piece?.role === 'king') {
    // Standard castling: king moves 2 files. Chess960: king moves onto own rook.
    if (fileDelta(move.from, move.to) >= 2) flags.has_castling = true;
    if (target?.role === 'rook' && target.color === piece.color) flags.has_castling = true;
  }
}

function fileDelta(from, to) {
  return Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
