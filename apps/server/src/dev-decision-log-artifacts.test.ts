import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { GameEvent } from '@mistboard/game';
import {
  decisionLogAvailable,
  devArtifactPayloads,
  devArtifactSummaries,
} from './dev-decision-log-artifacts.js';

const roomId = 'dev_artifacts_game';

test('dev decision logs expose review summaries and artifact payloads', () => {
  const before = process.env.FOW_DECISION_LOG_DIR;
  const dir = mkdtempSync(join(tmpdir(), 'mistboard-decision-log-'));
  process.env.FOW_DECISION_LOG_DIR = dir;
  try {
    writeFileSync(
      join(dir, `${roomId}.jsonl`),
      [
        JSON.stringify({
          ply: 101,
          color: 'black',
          chosen_move: 'g8f6',
          profile: 'live-pve',
          telemetry: {
            beliefSize: 128,
            iters: 7,
            moveRanking: [
              ['g8f6', 0.42],
              ['b8c6', -0.15],
            ],
          },
        }),
        JSON.stringify({
          ply: 102,
          color: 'black',
          chosen_move: 'f8b4',
          telemetry: { beliefSize: 96, iters: 11, moveRanking: [['f8b4', 0.25]] },
        }),
      ].join('\n'),
    );

    const events: GameEvent[] = [
      { type: 'room-created', at: 0, roomId, variant: 'dark-chess' },
      { type: 'move-played', at: 1, roomId, color: 'white', move: { from: 'e2', to: 'e4' } },
      { type: 'move-played', at: 2, roomId, color: 'black', move: { from: 'g8', to: 'f6' } },
      { type: 'move-played', at: 3, roomId, color: 'white', move: { from: 'd2', to: 'd4' } },
      { type: 'move-played', at: 4, roomId, color: 'black', move: { from: 'f8', to: 'b4' } },
    ];

    assert.equal(decisionLogAvailable(roomId), true);
    assert.deepEqual(devArtifactSummaries(roomId, events), {
      engineColors: ['black'],
      summaries: [
        {
          artifactType: 'belief-snapshot',
          count: 2,
          engineColors: ['black'],
          minPly: 2,
          maxPly: 4,
          snapshotKinds: ['decision'],
        },
        {
          artifactType: 'trace-row',
          count: 2,
          engineColors: ['black'],
          minPly: 2,
          maxPly: 4,
          snapshotKinds: [],
        },
      ],
    });

    const trace = devArtifactPayloads(roomId, events, 'trace-row', 'black');
    assert.equal(trace?.length, 2);
    assert.deepEqual(trace?.[0]?.payload.top_k_scores, [
      { uci: 'g8f6', score: 42, support: undefined },
      { uci: 'b8c6', score: -15, support: undefined },
    ]);
    assert.equal(trace?.[0]?.payload.ply, 2);
    assert.equal(devArtifactPayloads(roomId, events, 'trace-row', 'white')?.length, 0);
  } finally {
    if (before === undefined) {
      delete process.env.FOW_DECISION_LOG_DIR;
    } else {
      process.env.FOW_DECISION_LOG_DIR = before;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing dev decision logs are unavailable', () => {
  const before = process.env.FOW_DECISION_LOG_DIR;
  const dir = mkdtempSync(join(tmpdir(), 'mistboard-decision-log-'));
  process.env.FOW_DECISION_LOG_DIR = dir;
  try {
    assert.equal(decisionLogAvailable('missing-room'), false);
  } finally {
    if (before === undefined) {
      delete process.env.FOW_DECISION_LOG_DIR;
    } else {
      process.env.FOW_DECISION_LOG_DIR = before;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
