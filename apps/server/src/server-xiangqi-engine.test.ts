import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import { legalMoveForUci } from './server-xiangqi-engine.js';
import {
  isXiangqiEngineClientId,
  XIANGQI_DEFAULT_ENGINE_ID,
  XIANGQI_LEGACY_ENGINE_TIERS,
  XIANGQI_PLAYABLE_ENGINES,
  xiangqiEngineDisplayName,
  xiangqiEngineTierFor,
  xiangqiEngineVersion,
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafish,
} from './xiangqi-pikafish-engine.js';

// Our XiangqiSquare is `${file a-i}${rank 1-10}` (red back rank = rank 1);
// Pikafish UCI uses rank 0-9 (red back rank = rank 0). The only translation is a
// rank-1 shift. Empirically validated end-to-end against the mainline binary in
// src/scripts/xiangqi-pikafish-validate.ts — these lock the contract as a unit.

test('xiangqiSquareToPikafish applies the rank-1 shift', () => {
  assert.equal(xiangqiSquareToPikafish('e1'), 'e0'); // red general
  assert.equal(xiangqiSquareToPikafish('a1'), 'a0');
  assert.equal(xiangqiSquareToPikafish('i10'), 'i9');
  assert.equal(xiangqiSquareToPikafish('e10'), 'e9'); // black general
  assert.equal(xiangqiSquareToPikafish('h3'), 'h2'); // red right cannon
});

test('xiangqiMoveToPikafishUci concatenates the shifted squares', () => {
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h3', to: 'e3' }), 'h2e2'); // cannon to center
  assert.equal(xiangqiMoveToPikafishUci({ from: 'b1', to: 'c3' }), 'b0c2'); // horse
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h10', to: 'g8' }), 'h9g7'); // black horse
});

test('legalMoveForUci matches a Pikafish bestmove against the legal set', () => {
  const legal: XiangqiMove[] = [
    { from: 'h3', to: 'e3' },
    { from: 'b1', to: 'c3' },
  ];
  assert.deepEqual(legalMoveForUci(legal, 'h2e2'), { from: 'h3', to: 'e3' });
  assert.deepEqual(legalMoveForUci(legal, 'b0c2'), { from: 'b1', to: 'c3' });
});

test('legalMoveForUci rejects moves outside the legal set and malformed uci', () => {
  const legal: XiangqiMove[] = [{ from: 'h3', to: 'e3' }];
  assert.equal(legalMoveForUci(legal, 'a0a1'), null); // legal-format, not in set
  assert.equal(legalMoveForUci(legal, 'h3e3'), null); // our coords, not Pikafish coords
  assert.equal(legalMoveForUci(legal, 'garbage'), null);
  assert.equal(legalMoveForUci(legal, ''), null);
});

// ── Ladder tier-table invariants ────────────────────────────────────────────

test('xiangqi ladder exposes exactly eight levels with unique level-N ids', () => {
  assert.equal(XIANGQI_PLAYABLE_ENGINES.length, 8);
  const ids = XIANGQI_PLAYABLE_ENGINES.map((tier) => tier.id);
  assert.equal(new Set(ids).size, ids.length, 'tier ids must be unique');
  ids.forEach((id, index) => {
    assert.equal(id, `pikafish-xiangqi-level-${index + 1}`);
  });
});

test('xiangqi ladder parameters are within range and monotonic', () => {
  for (const tier of XIANGQI_PLAYABLE_ENGINES) {
    assert.ok(
      tier.skill >= 0 && tier.skill <= 20,
      `${tier.id}: skill ${tier.skill} outside Pikafish's 0-20 range`,
    );
    assert.ok(tier.nodes >= 1, `${tier.id}: node budget must be positive`);
    assert.ok(tier.movetimeMs >= 1, `${tier.id}: movetime must be positive`);
  }
  for (let i = 1; i < XIANGQI_PLAYABLE_ENGINES.length; i++) {
    const prev = XIANGQI_PLAYABLE_ENGINES[i - 1]!;
    const next = XIANGQI_PLAYABLE_ENGINES[i]!;
    // Nodes pin strength: strictly increasing keeps the ladder monotonic even
    // where adjacent skill values tie. Skill and movetime never regress.
    assert.ok(next.nodes > prev.nodes, `${next.id}: nodes must exceed ${prev.id}`);
    assert.ok(next.skill >= prev.skill, `${next.id}: skill must not regress from ${prev.id}`);
    assert.ok(
      next.movetimeMs >= prev.movetimeMs,
      `${next.id}: movetime must not regress from ${prev.id}`,
    );
  }
});

test('xiangqi default engine is a playable level with the old default strength', () => {
  const tier = XIANGQI_PLAYABLE_ENGINES.find((entry) => entry.id === XIANGQI_DEFAULT_ENGINE_ID);
  assert.ok(tier, 'default engine id must be in XIANGQI_PLAYABLE_ENGINES');
  // The retired 'pikafish-xiangqi-strong' default was skill 12; the successor
  // default keeps that skill so default difficulty does not jump.
  assert.equal(tier.skill, 12);
});

// ── Retired-tier back-compat ────────────────────────────────────────────────
// Finished prod PvE games, replays, and bot-profile attribution reference the
// pre-ladder ids. They must resolve (with their original parameters) without
// being offered in the picker.

test('retired xiangqi engine ids stay resolvable with their original parameters', () => {
  const expected = [
    { id: 'pikafish-xiangqi-amateur', skill: 3, nodes: 20_000, movetimeMs: 400 },
    { id: 'pikafish-xiangqi-strong', skill: 12, nodes: 300_000, movetimeMs: 1_500 },
    { id: 'pikafish-xiangqi-strongest', skill: 20, nodes: 3_000_000, movetimeMs: 4_000 },
  ];
  assert.deepEqual(
    XIANGQI_LEGACY_ENGINE_TIERS.map(({ id, skill, nodes, movetimeMs }) => ({
      id,
      skill,
      nodes,
      movetimeMs,
    })),
    expected,
  );
  for (const legacy of expected) {
    const tier = xiangqiEngineTierFor(legacy.id);
    assert.ok(tier, `${legacy.id} must resolve via xiangqiEngineTierFor`);
    assert.equal(tier.skill, legacy.skill);
    assert.equal(tier.nodes, legacy.nodes);
    assert.equal(tier.movetimeMs, legacy.movetimeMs);
    assert.equal(isXiangqiEngineClientId(legacy.id), true);
    assert.equal(typeof xiangqiEngineVersion(legacy.id), 'string');
    assert.notEqual(xiangqiEngineDisplayName(legacy.id), legacy.id, 'display name must resolve');
    assert.ok(
      !XIANGQI_PLAYABLE_ENGINES.some((entry) => entry.id === legacy.id),
      `${legacy.id} must not be offered as a playable engine`,
    );
  }
});
