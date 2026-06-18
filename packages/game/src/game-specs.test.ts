import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  FOG_DRAFT960_SPEC_ID,
  GAME_SPECS,
  gameSpecForId,
  gameSpecForLegacyLiveRoom,
  isGameSpecId,
  isRatedPoolBase,
  JIEQI_SPEC_ID,
  legacyLiveRoomForGameSpec,
  maybeGameSpecForId,
  RATED_POOL_BASES,
  type RatingVariant,
  REVEAL_CHESS_SPEC_ID,
  ratingPoolForSpec,
} from './game-specs.js';

test('current dark chess maps to the flagship chess spec', () => {
  const spec = gameSpecForId(DARK_CHESS_SPEC_ID);

  assert.equal(spec.publicName, 'Dark chess');
  assert.equal(spec.family, 'chess');
  assert.equal(spec.board, 'chess-8x8');
  assert.equal(spec.movement, 'orthodox-chess');
  assert.equal(spec.objective, 'king-capture');
  assert.equal(spec.visibility, 'dark');
  assert.equal(spec.setup, 'standard');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'fog');
  assert.equal(spec.publicSurface, 'casual');
  assert.equal(spec.runtimeStatus, 'live');
  assert.deepEqual(spec.legacyLiveRoom, { variant: 'dark-chess', hiddenDraft960: false });
});

test('Draft960 is modeled as a dark chess setup module, not a family', () => {
  const spec = gameSpecForId(DARK_DRAFT960_SPEC_ID);

  assert.equal(spec.id, 'dark-draft960');
  assert.equal(spec.publicName, 'Dark Draft960');
  assert.equal(spec.family, 'chess');
  assert.equal(spec.board, 'chess-8x8');
  assert.equal(spec.movement, 'orthodox-chess');
  assert.equal(spec.objective, 'king-capture');
  assert.equal(spec.visibility, 'dark');
  assert.equal(spec.setup, 'draft960');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'fog_draft960');
  assert.equal(spec.runtimeStatus, 'live');
  assert.deepEqual(spec.legacyLiveRoom, { variant: 'dark-chess', hiddenDraft960: true });
});

test('Dark Xiangqi is representable as a separate family without live-room mapping', () => {
  const spec = gameSpecForId(DARK_XIANGQI_SPEC_ID);

  assert.equal(spec.publicName, 'Dark Xiangqi');
  assert.equal(spec.family, 'xiangqi');
  assert.equal(spec.board, 'xiangqi-9x10');
  assert.equal(spec.movement, 'xiangqi');
  assert.equal(spec.objective, 'general-capture');
  assert.equal(spec.visibility, 'dark');
  assert.equal(spec.setup, 'standard');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'dark_xiangqi');
  assert.equal(spec.rated, true);
  assert.equal(spec.publicSurface, 'hidden');
  assert.equal(spec.runtimeStatus, 'dev-spike');
  assert.equal(spec.legacyLiveRoom, undefined);
});

test('Dark Mini Xiangqi is a separate xiangqi-family spike spec', () => {
  const spec = gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID);

  assert.equal(spec.publicName, 'Dark Mini Xiangqi');
  assert.equal(spec.family, 'xiangqi');
  assert.equal(spec.board, 'xiangqi-7x7');
  assert.equal(spec.movement, 'mini-xiangqi');
  assert.equal(spec.objective, 'general-capture');
  assert.equal(spec.visibility, 'dark');
  assert.equal(spec.setup, 'mini-standard');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'dark_mini_xiangqi');
  assert.equal(spec.publicSurface, 'hidden');
  assert.equal(spec.runtimeStatus, 'dev-spike');
  assert.equal(spec.legacyLiveRoom, undefined);
});

test('Dark Shogi is reserved as a future shogi family spec', () => {
  const spec = gameSpecForId(DARK_SHOGI_SPEC_ID);

  assert.equal(spec.publicName, 'Dark Shogi');
  assert.equal(spec.family, 'shogi');
  assert.equal(spec.board, 'shogi-9x9');
  assert.equal(spec.movement, 'shogi');
  assert.equal(spec.objective, 'king-capture');
  assert.equal(spec.visibility, 'dark');
  assert.equal(spec.setup, 'standard');
  assert.equal(spec.reserves, 'shogi-hands');
  assert.equal(spec.dropPolicy, 'seen-squares-only');
  assert.equal(spec.ratingPoolBase, 'dark_shogi');
  assert.equal(spec.publicSurface, 'hidden');
  assert.equal(spec.runtimeStatus, 'future');
  assert.equal(spec.legacyLiveRoom, undefined);
});

test('Jieqi is an xiangqi-family spec on its own hidden-identity axis', () => {
  const spec = gameSpecForId(JIEQI_SPEC_ID);

  assert.equal(spec.publicName, 'Jieqi');
  assert.equal(spec.family, 'xiangqi');
  assert.equal(spec.board, 'xiangqi-9x10');
  assert.equal(spec.movement, 'xiangqi');
  // Jieqi is the first checkmate + hidden-identity spec: identities hidden,
  // positions public (distinct from the fog 'dark' specs).
  assert.equal(spec.objective, 'checkmate');
  assert.equal(spec.visibility, 'hidden-identity');
  assert.equal(spec.setup, 'jieqi-deal');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'jieqi');
  assert.equal(spec.publicSurface, 'hidden');
  assert.equal(spec.runtimeStatus, 'future');
  assert.equal(spec.legacyLiveRoom, undefined);
});

test('Banqi is an xiangqi-family hidden-identity spec on the 8x4 board', () => {
  const spec = gameSpecForId(BANQI_SPEC_ID);

  assert.equal(spec.publicName, 'Banqi');
  assert.equal(spec.family, 'xiangqi');
  assert.equal(spec.board, 'banqi-8x4');
  assert.equal(spec.movement, 'banqi');
  // Banqi wins by leaving the opponent with no legal move (the general is not
  // royal), and like jieqi hides identities on a public board.
  assert.equal(spec.objective, 'last-mover');
  assert.equal(spec.visibility, 'hidden-identity');
  assert.equal(spec.setup, 'banqi-deal');
  assert.equal(spec.reserves, 'none');
  assert.equal(spec.dropPolicy, 'none');
  assert.equal(spec.ratingPoolBase, 'banqi');
  assert.equal(spec.publicSurface, 'hidden');
  assert.equal(spec.runtimeStatus, 'future');
  assert.equal(spec.legacyLiveRoom, undefined);
});

test('future composites are composed from rule modules', () => {
  const sunTzu = gameSpecForId('sun-tzu');
  const laoTzu = gameSpecForId('lao-tzu');
  const darkCrazyhouse = gameSpecForId('dark-crazyhouse');
  const darkAntichess = gameSpecForId('dark-antichess');
  const darkSeirawan = gameSpecForId('dark-seirawan');
  const darkOmega = gameSpecForId('dark-omega');

  assert.equal(darkCrazyhouse.reserves, 'crazyhouse');
  assert.equal(darkCrazyhouse.dropPolicy, 'any-legal-square');
  assert.equal(darkAntichess.objective, 'antichess');
  assert.equal(sunTzu.setup, 'double-fischer-random');
  assert.equal(sunTzu.reserves, 'crazyhouse');
  assert.equal(sunTzu.dropPolicy, 'any-legal-square');
  assert.equal(laoTzu.setup, 'double-fischer-random');
  assert.equal(laoTzu.reserves, 'crazyhouse');
  assert.equal(laoTzu.dropPolicy, 'seen-squares-only');
  assert.equal(darkSeirawan.movement, 'seirawan');
  assert.equal(darkSeirawan.reserves, 'seirawan-gating');
  assert.equal(darkOmega.family, 'omega-chess');
  assert.equal(darkOmega.board, 'omega-10x10-plus-corners');
});

test('Crossroads Chess is two specs sharing one family/board, split on visibility', () => {
  const open = gameSpecForId('crossroads-chess');
  const dark = gameSpecForId('dark-crossroads-chess');

  for (const spec of [open, dark]) {
    assert.equal(spec.family, 'crossroads-chess');
    assert.equal(spec.board, 'crossroads-6x8');
    assert.equal(spec.movement, 'crossroads-chess');
    assert.equal(spec.objective, 'royal-capture-or-race');
    assert.equal(spec.setup, 'crossroads-standard');
    assert.equal(spec.publicSurface, 'hidden');
  }
  assert.equal(open.runtimeStatus, 'dev-spike');
  assert.equal(dark.runtimeStatus, 'future');
  // The split: perfect-info onboarding vs the real fog mode, on separate pools.
  assert.equal(open.publicName, 'Crossroads Chess');
  assert.equal(dark.publicName, 'Dark Crossroads Chess');
  assert.equal(open.visibility, 'open');
  assert.equal(dark.visibility, 'dark');
  assert.equal(open.ratingPoolBase, 'crossroads_chess_open');
  assert.equal(dark.ratingPoolBase, 'crossroads_chess');
});

test('game spec ids are unique and discoverable', () => {
  const ids = GAME_SPECS.map((spec) => spec.id);
  assert.equal(new Set(ids).size, ids.length);

  assert.equal(isGameSpecId('dark-chess'), true);
  assert.equal(isGameSpecId('dark-draft960'), true);
  assert.equal(isGameSpecId('fog-draft960'), false);
  assert.equal(isGameSpecId('dark-mini-xiangqi'), true);
  assert.equal(isGameSpecId('dark-xiangqi'), true);
  assert.equal(isGameSpecId('dark-shogi'), true);
  assert.equal(isGameSpecId('banqi'), true);
  assert.equal(isGameSpecId('not-a-spec'), false);
  assert.equal(maybeGameSpecForId('dark-draft960')?.id, DARK_DRAFT960_SPEC_ID);
  assert.equal(maybeGameSpecForId('fog-draft960')?.id, DARK_DRAFT960_SPEC_ID);
  assert.equal(maybeGameSpecForId('not-a-spec'), null);
});

test('legacy Fog Draft960 spec constant aliases the canonical Dark Draft960 id', () => {
  assert.equal(FOG_DRAFT960_SPEC_ID, DARK_DRAFT960_SPEC_ID);
  assert.equal(gameSpecForId(FOG_DRAFT960_SPEC_ID).id, DARK_DRAFT960_SPEC_ID);
});

test('legacy live-room inputs map to current game specs', () => {
  assert.equal(gameSpecForLegacyLiveRoom({ variant: 'dark-chess' }).id, DARK_CHESS_SPEC_ID);
  assert.equal(
    gameSpecForLegacyLiveRoom({ variant: 'dark-chess', hiddenDraft960: true }).id,
    DARK_DRAFT960_SPEC_ID,
  );
  assert.equal(
    gameSpecForLegacyLiveRoom({ variant: 'dark-chess', hiddenDraft960: 'yes' }).id,
    DARK_DRAFT960_SPEC_ID,
  );
  assert.equal(gameSpecForLegacyLiveRoom({ variant: 'draft960' }).id, DARK_DRAFT960_SPEC_ID);
  assert.equal(gameSpecForLegacyLiveRoom({ variant: 'dark-draft960' }).id, DARK_DRAFT960_SPEC_ID);
  assert.equal(gameSpecForLegacyLiveRoom({ variant: 'fog-draft960' }).id, DARK_DRAFT960_SPEC_ID);
  assert.equal(gameSpecForLegacyLiveRoom({ variant: 'unknown' }).id, DARK_CHESS_SPEC_ID);
});

test('current live specs can be converted back to the existing room wire shape', () => {
  assert.deepEqual(legacyLiveRoomForGameSpec(DARK_CHESS_SPEC_ID), {
    variant: 'dark-chess',
    hiddenDraft960: false,
  });
  assert.deepEqual(legacyLiveRoomForGameSpec(DARK_DRAFT960_SPEC_ID), {
    variant: 'dark-chess',
    hiddenDraft960: true,
  });
  assert.equal(legacyLiveRoomForGameSpec(DARK_MINI_XIANGQI_SPEC_ID), null);
  assert.equal(legacyLiveRoomForGameSpec(DARK_XIANGQI_SPEC_ID), null);
  assert.equal(legacyLiveRoomForGameSpec(DARK_SHOGI_SPEC_ID), null);
});

test('RATED_POOL_BASES derives from the rated flag and matches the RatingVariant union', () => {
  // The runtime set is exactly the ratingPoolBase of every `rated: true` spec.
  const fromFlag = GAME_SPECS.filter((spec) => spec.rated).map((spec) => spec.ratingPoolBase);
  assert.deepEqual([...RATED_POOL_BASES].sort(), [...fromFlag].sort());

  // The compile-time RatingVariant union must match the runtime set. This Record
  // literal forces every union member to appear exactly once (a missing or extra
  // member is a compile error); comparing its keys to RATED_POOL_BASES guards the
  // type, the `rated` flags, and the user_ratings CHECK migration against drift.
  const unionMembers: Record<RatingVariant, true> = {
    fog: true,
    fog_draft960: true,
    dark_mini_xiangqi: true,
    dark_xiangqi: true,
    crossroads_chess_open: true,
    jieqi: true,
    banqi: true,
    reveal_chess: true,
  };
  assert.deepEqual(Object.keys(unionMembers).sort(), [...RATED_POOL_BASES].sort());
});

test('ratingPoolForSpec is rated for launched pools and null for casual-only specs', () => {
  assert.equal(ratingPoolForSpec(DARK_CHESS_SPEC_ID), 'fog');
  assert.equal(ratingPoolForSpec(DARK_DRAFT960_SPEC_ID), 'fog_draft960');
  assert.equal(ratingPoolForSpec(CROSSROADS_CHESS_SPEC_ID), 'crossroads_chess_open');
  assert.equal(ratingPoolForSpec(JIEQI_SPEC_ID), 'jieqi');
  assert.equal(ratingPoolForSpec(BANQI_SPEC_ID), 'banqi');
  assert.equal(ratingPoolForSpec(REVEAL_CHESS_SPEC_ID), 'reveal_chess');
  assert.equal(ratingPoolForSpec(DARK_XIANGQI_SPEC_ID), 'dark_xiangqi');
  // Casual-only specs (no `rated` flag) have no active pool.
  assert.equal(ratingPoolForSpec(DARK_SHOGI_SPEC_ID), null);
  assert.equal(isRatedPoolBase('jieqi'), true);
  assert.equal(isRatedPoolBase('dark_xiangqi'), true);
  assert.equal(isRatedPoolBase('not-a-pool'), false);
});
