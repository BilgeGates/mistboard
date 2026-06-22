import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type BotRatingSnapshotAuditRow,
  renderBotRatingSnapshotsMarkdown,
} from './bot-rating-snapshots.js';

test('renders bot rating snapshots as an audit table', () => {
  const markdown = renderBotRatingSnapshotsMarkdown([
    snapshot({
      displayName: 'Misty',
      botId: 'misty-dark-chess',
      activeEngineId: 'python-v2-v1.4',
      rating: 1812,
      ratingDeviation: 77.4,
      games: 32,
      published: true,
      publishedAt: new Date('2026-01-02T00:00:00Z'),
      source: 'eve-anchor',
      sourceRef: 'tournament:test-cup',
    }),
    snapshot({
      displayName: 'Draft Bot',
      botId: 'draft-bot',
      activeEngineId: 'draft-engine',
      rating: 1700,
      ratingDeviation: null,
      games: 8,
      published: false,
      source: 'manual',
      sourceRef: null,
    }),
  ]);

  assert.match(markdown, /\| Misty \(`misty-dark-chess`\)/);
  assert.match(markdown, /\| `python-v2-v1\.4` /);
  assert.match(markdown, /\| 1812 \| 77 \| 32 \| published \| eve-anchor tournament:test-cup /);
  assert.match(markdown, /\| Draft Bot \(`draft-bot`\)/);
  assert.match(markdown, /\| 1700 \| - \| 8 \| draft \| manual /);
});

test('renders an empty snapshot list clearly', () => {
  assert.equal(renderBotRatingSnapshotsMarkdown([]), 'No bot rating snapshots.\n');
});

function snapshot(overrides: Partial<BotRatingSnapshotAuditRow> = {}): BotRatingSnapshotAuditRow {
  return {
    snapshotId: 1,
    botId: 'bot',
    displayName: 'Bot',
    activeEngineId: 'engine',
    gameSpecId: 'dark-chess',
    timeClass: 'blitz',
    rating: 1500,
    ratingDeviation: 100,
    games: 1,
    source: 'import',
    sourceRef: null,
    published: false,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
