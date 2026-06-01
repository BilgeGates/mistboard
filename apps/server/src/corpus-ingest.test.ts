import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameEvent } from '@mistboard/game';
import {
  namespaceRoomId,
  parseEventLog,
  parseShardRecord,
  participantsForBakeoffGame,
  reconstructRunTimestamps,
  roomIdFromEvents,
  summarizeReplay,
} from './corpus-ingest.js';

// ── Event-log parsing ────────────────────────────────────────────────────────

test('parseEventLog drops blank lines and parses each JSONL event', () => {
  const raw =
    '{"type":"room-created","at":0,"roomId":"r1","variant":"dark-chess","offer":[]}\n\n{"type":"move-played","at":1,"roomId":"r1","color":"white","move":{"from":"e2","to":"e3"}}\n';
  const events = parseEventLog(raw);
  assert.equal(events.length, 2);
  assert.equal(events[0]!.type, 'room-created');
  assert.equal(events[1]!.type, 'move-played');
});

test('roomIdFromEvents returns the room id and rejects logs not starting with room-created', () => {
  const created = [{ type: 'room-created', roomId: 'r42' }] as unknown as GameEvent[];
  assert.equal(roomIdFromEvents(created, 'x.jsonl'), 'r42');
  assert.throws(() => roomIdFromEvents([], 'empty.jsonl'), /empty event log/);
  const noCreate = [{ type: 'move-played' }] as unknown as GameEvent[];
  assert.throws(() => roomIdFromEvents(noCreate, 'bad.jsonl'), /expected room-created/);
});

test('summarizeReplay reports an unfinished game without throwing', () => {
  // room-created + one move never reaches a finished status.
  const events = parseEventLog(
    '{"type":"room-created","at":0,"roomId":"r1","variant":"dark-chess","offer":[]}\n' +
      '{"type":"move-played","at":1,"roomId":"r1","color":"white","move":{"from":"e2","to":"e3"}}\n',
  );
  const summary = summarizeReplay(events);
  assert.equal(summary.finished, false);
  assert.equal(summary.plyCount, 1);
});

// ── Bakeoff shard record parsing ─────────────────────────────────────────────

test('parseShardRecord reads the shard log shape (v2_color, game_path)', () => {
  const record = parseShardRecord({
    game_id: 'v2bakeoff-g0001',
    v2_color: 'black',
    game_path: 'games/game-0001-W-tier1-black.jsonl',
    wall_seconds: 217.14,
  });
  assert.deepEqual(record, {
    gameId: 'v2bakeoff-g0001',
    tier1Color: 'black',
    gamePath: 'games/game-0001-W-tier1-black.jsonl',
    wallSeconds: 217.14,
  });
});

test('parseShardRecord also reads the manifest shape (tier1_color, path)', () => {
  const record = parseShardRecord({
    game_id: 'v2bakeoff-g0000',
    tier1_color: 'white',
    path: 'games/game-0000-W-tier1-white.jsonl',
  });
  assert.equal(record?.tier1Color, 'white');
  assert.equal(record?.gamePath, 'games/game-0000-W-tier1-white.jsonl');
  assert.equal(record?.wallSeconds, undefined);
});

test('parseShardRecord rejects records missing id, color, or path', () => {
  assert.equal(parseShardRecord({ v2_color: 'white', game_path: 'g.jsonl' }), null);
  assert.equal(parseShardRecord({ game_id: 'g', game_path: 'g.jsonl' }), null);
  assert.equal(parseShardRecord({ game_id: 'g', v2_color: 'green', game_path: 'g.jsonl' }), null);
  assert.equal(parseShardRecord({ game_id: 'g', v2_color: 'white' }), null);
});

// ── Room-id namespacing (cross-run collision guard) ─────────────────────────

test('namespaceRoomId prefixes the corpus so different runs cannot collide', () => {
  // Both runs name a game v2bakeoff-g0000; the corpus prefix keeps them distinct.
  assert.equal(namespaceRoomId('two-step', 'v2bakeoff-g0000'), 'two-step--v2bakeoff-g0000');
  assert.equal(
    namespaceRoomId('mirror-robustness', 'v2bakeoff-g0000'),
    'mirror-robustness--v2bakeoff-g0000',
  );
  assert.notEqual(
    namespaceRoomId('two-step', 'v2bakeoff-g0000'),
    namespaceRoomId('mirror-robustness', 'v2bakeoff-g0000'),
  );
});

test('namespaceRoomId is idempotent — re-prefixing an already-namespaced id is a no-op', () => {
  const once = namespaceRoomId('two-step', 'v2bakeoff-g0000');
  assert.equal(namespaceRoomId('two-step', once), once);
});

// ── Per-game attribution ─────────────────────────────────────────────────────

const TIER1 = { subjectId: 'engine-v2-2026-05-24', displayName: 'Mistboard Engine v2.0' };
const OPP = { subjectId: 'python-tier1-v0.9.5', displayName: 'Mistboard Engine v0.9.5' };

test('participantsForBakeoffGame puts tier1 on white when it played white', () => {
  const participants = participantsForBakeoffGame('white', TIER1, OPP, 'public');
  const white = participants.find((p) => p.color === 'white');
  const black = participants.find((p) => p.color === 'black');
  assert.equal(white?.subjectId, TIER1.subjectId);
  assert.equal(black?.subjectId, OPP.subjectId);
  assert.equal(white?.subjectType, 'engine-version');
});

test('participantsForBakeoffGame flips identities when tier1 played black', () => {
  // The bug import-corpus blanket naming would get wrong: half the games.
  const participants = participantsForBakeoffGame('black', TIER1, OPP, 'public');
  assert.equal(participants.find((p) => p.color === 'white')?.subjectId, OPP.subjectId);
  assert.equal(participants.find((p) => p.color === 'black')?.subjectId, TIER1.subjectId);
});

// ── Timestamp reconstruction ─────────────────────────────────────────────────

test('reconstructRunTimestamps backs the start out of the file mtime via wall_seconds', () => {
  const endedAtMs = Date.UTC(2026, 4, 30, 12, 0, 0);
  const { startedAt, endedAt } = reconstructRunTimestamps(endedAtMs, 60);
  assert.equal(endedAt.getTime(), endedAtMs);
  assert.equal(startedAt.getTime(), endedAtMs - 60_000);
});

test('reconstructRunTimestamps falls back to ended==started without wall_seconds', () => {
  const endedAtMs = Date.UTC(2026, 4, 30, 12, 0, 0);
  const { startedAt, endedAt } = reconstructRunTimestamps(endedAtMs, undefined);
  assert.equal(startedAt.getTime(), endedAt.getTime());
});
