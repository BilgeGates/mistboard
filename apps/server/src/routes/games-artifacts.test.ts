import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_ENGINE_DECISION_ARTIFACT_TYPE } from '../persistence-game-lifecycle.js';
import type { GameParticipant } from '../persistence-games.js';
import { engineParticipantColors, parseReviewArtifactType } from './games.js';

// Regression cover for #287: live PvE per-move engine telemetry was persisted and
// unreachable through /api/games/:id/artifacts, behind two independent gates —
// the request-type allowlist did not name the live writer's type, and the seat
// filter recognized only 'engine-version' while live PvE writes 'bot' seats.
// Neither failed loudly: the endpoint answered `{artifacts: []}`, which reads
// exactly like a game that has no artifacts.

function participant(overrides: Partial<GameParticipant> & { color: GameParticipant['color'] }) {
  return {
    displayName: 'seat',
    subjectType: 'user',
    subjectId: null,
    visibility: 'public',
    ...overrides,
  } satisfies GameParticipant;
}

// The roster shape of prod game ce114c05 (dark-chess PvE, Misty as White).
const PVE_ROSTER = {
  participants: [
    participant({ color: 'white', displayName: 'Misty', subjectType: 'bot', subjectId: 'misty' }),
    participant({ color: 'black', displayName: 'someone', subjectType: 'user', subjectId: 'u1' }),
  ],
};

test('a live PvE bot seat counts as an engine seat', () => {
  assert.deepEqual(engineParticipantColors(PVE_ROSTER), ['white']);
});

test('EvE engine-version seats still count, on both sides', () => {
  const roster = {
    participants: [
      participant({ color: 'white', subjectType: 'engine-version', subjectId: 'misty@1.5' }),
      participant({ color: 'black', subjectType: 'engine-version', subjectId: 'misty@1.4' }),
    ],
  };
  assert.deepEqual(engineParticipantColors(roster), ['white', 'black']);
});

test('a human-only game has no engine seats', () => {
  const roster = {
    participants: [
      participant({ color: 'white', subjectType: 'user', subjectId: 'u1' }),
      participant({ color: 'black', subjectType: 'guest', subjectId: null }),
    ],
  };
  assert.deepEqual(engineParticipantColors(roster), []);
});

test('the type the live writer persists is requestable', () => {
  // Coupled to the writer through the shared constant, so renaming the artifact
  // type on one side cannot silently strand the other again.
  assert.equal(
    parseReviewArtifactType(LIVE_ENGINE_DECISION_ARTIFACT_TYPE),
    LIVE_ENGINE_DECISION_ARTIFACT_TYPE,
  );
});

test('the EvE artifact types stay requestable', () => {
  for (const type of ['belief-snapshot', 'trace-row', 'engine-move-choice']) {
    assert.equal(parseReviewArtifactType(type), type);
  }
});

test('unknown artifact types are rejected', () => {
  for (const value of [null, '', 'live-engine-decisions', 'engine-move-choices', 'all']) {
    assert.equal(parseReviewArtifactType(value), null);
  }
});
