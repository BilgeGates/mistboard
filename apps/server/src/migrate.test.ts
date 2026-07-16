/**
 * Migration filename ordering is the apply order, so numeric prefixes must be
 * unique. Three legacy pairs shipped before this guard existed and are pinned
 * by filename in prod's _migrations table; they are allowlisted exactly and
 * everything else must not collide. Pure-function tests only: no database.
 */

import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertUniqueMigrationPrefixes } from './migrate.js';

// Same resolution as the runtime default: works from src/ (tsx) and dist/ (node).
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

test('real migrations directory has no unallowlisted duplicate prefixes', async () => {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length > 100, `expected the real migrations listing, got ${files.length} files`);
  assertUniqueMigrationPrefixes(files);
});

test('unique prefixes pass', () => {
  assertUniqueMigrationPrefixes(['001_init.sql', '002_second.sql', '010_tenth.sql']);
});

test('a new duplicate prefix throws with both filenames', () => {
  assert.throws(
    () => assertUniqueMigrationPrefixes(['104_first.sql', '104_second.sql', '105_ok.sql']),
    /104: 104_first\.sql, 104_second\.sql/,
  );
});

test('legacy duplicate pairs are allowlisted as exact sets', () => {
  assertUniqueMigrationPrefixes([
    '051_allow_drop_mini_xiangqi_rating_bucket.sql',
    '051_bot_profiles.sql',
    '064_allow_jungle_rating_buckets.sql',
    '064_puzzle_daily_selections.sql',
    '081_align_forum_categories.sql',
    '081_xiangqi_broadcasts.sql',
  ]);
});

test('a third file on an allowlisted prefix still throws', () => {
  assert.throws(
    () =>
      assertUniqueMigrationPrefixes([
        '051_allow_drop_mini_xiangqi_rating_bucket.sql',
        '051_bot_profiles.sql',
        '051_sneaky_newcomer.sql',
      ]),
    /051/,
  );
});

test('files without a numeric prefix are ignored', () => {
  assertUniqueMigrationPrefixes(['README.sql', 'notes.sql', '001_init.sql']);
});
