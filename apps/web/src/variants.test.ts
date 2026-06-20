import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  canonicalVariantOrderIndex,
  DARK_CHESS_SPEC_ID,
  DARK_CRAZYHOUSE_SPEC_ID,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
  JIEQI_SPEC_ID,
  REVEAL_CHESS_SPEC_ID,
} from '@mistboard/game';
import { describe, expect, it, vi } from 'vitest';
import {
  enabledVariants,
  leaderboardVariants,
  profileRatingVariants,
  VARIANTS,
  variantMiniIdForGameSpec,
} from './variants.js';

describe('web variant launch registry', () => {
  it('lists VARIANTS in the shared canonical variant order', () => {
    // The leaderboard/profile grids render in VARIANTS order; it must match the
    // one canonical order every surface (picker, watch, rules rail) sorts by, so
    // the variant sequence is identical everywhere.
    const order = VARIANTS.map((v) => v.gameSpecId);
    const canonical = [...order].sort(
      (a, b) => canonicalVariantOrderIndex(a) - canonicalVariantOrderIndex(b),
    );
    expect(order).toEqual(canonical);
  });

  it('uses shared game-spec labels for current dark chess formats', () => {
    expect(VARIANTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fog',
          gameSpecId: DARK_CHESS_SPEC_ID,
          label: gameSpecForId(DARK_CHESS_SPEC_ID).publicName,
        }),
        expect.objectContaining({
          id: 'fog_draft960',
          gameSpecId: DARK_DRAFT960_SPEC_ID,
          label: gameSpecForId(DARK_DRAFT960_SPEC_ID).publicName,
        }),
      ]),
    );
  });

  it('shows public leaderboard buckets for live public variants', async () => {
    // Pin prod semantics: dev auto-on would otherwise surface the soft-launch DMX bucket.
    vi.resetModules();
    vi.stubEnv('DEV', false);
    const prod = await import('./variants.js');
    expect(prod.leaderboardVariants.map((v) => v.gameSpecId)).toEqual([
      DARK_CHESS_SPEC_ID,
      CROSSROADS_CHESS_SPEC_ID,
    ]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('adds Dark Mini Xiangqi profile buckets behind the DMX render flag', async () => {
    vi.resetModules();
    // Pin prod semantics so the render flag alone (no public-entry) keeps DMX off the leaderboard.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const flagged = await import('./variants.js');
    expect(flagged.profileRatingVariants.map((v) => v.gameSpecId)).toEqual([
      DARK_CHESS_SPEC_ID,
      DARK_MINI_XIANGQI_SPEC_ID,
      CROSSROADS_CHESS_SPEC_ID,
    ]);
    expect(flagged.leaderboardVariants.map((v) => v.gameSpecId)).toEqual([
      DARK_CHESS_SPEC_ID,
      CROSSROADS_CHESS_SPEC_ID,
    ]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('adds Dark Mini Xiangqi leaderboard buckets behind the public-entry flag', async () => {
    vi.resetModules();
    // Pin prod semantics so dev-on variants (jieqi/banqi) don't pollute the assertion.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const flagged = await import('./variants.js');
    expect(flagged.leaderboardVariants.map((v) => v.gameSpecId)).toEqual([
      DARK_CHESS_SPEC_ID,
      DARK_MINI_XIANGQI_SPEC_ID,
      CROSSROADS_CHESS_SPEC_ID,
    ]);
    expect(flagged.enabledVariants.map((v) => v.gameSpecId)).toContain(DARK_MINI_XIANGQI_SPEC_ID);
    expect(
      flagged.leaderboardVariants.find((v) => v.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID),
    ).toEqual(
      expect.objectContaining({
        id: 'dark_mini_xiangqi',
        apiParam: DARK_MINI_XIANGQI_SPEC_ID,
        label: gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID).publicName,
      }),
    );
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('makes Dark Xiangqi rating-ready behind its flag, never lobby-selectable, with a thumbnail', async () => {
    // In VARIANTS (so it has a picker mini-board + a rating bucket) but never
    // lobby-selectable (no open-seek), and on the rating surfaces only when its
    // flag is on — gated globally by MISTBOARD_RATED_ENABLED on the server.
    expect(VARIANTS.map((v) => v.gameSpecId)).toContain(DARK_XIANGQI_SPEC_ID);
    expect(enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(variantMiniIdForGameSpec(DARK_XIANGQI_SPEC_ID)).toBe('dark-xiangqi');
    // Flag off (default test env): off the rating surfaces.
    expect(leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(profileRatingVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);

    // Flag on: shown on leaderboard + profile, still not lobby-selectable.
    vi.resetModules();
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    const flagged = await import('./variants.js');
    expect(flagged.leaderboardVariants.map((v) => v.gameSpecId)).toContain(DARK_XIANGQI_SPEC_ID);
    expect(flagged.profileRatingVariants.map((v) => v.gameSpecId)).toContain(DARK_XIANGQI_SPEC_ID);
    expect(flagged.enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('shows Crossroads on rating surfaces and enables it behind its play flag', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const flagged = await import('./variants.js');

    expect(flagged.enabledVariants.map((v) => v.gameSpecId)).toContain(CROSSROADS_CHESS_SPEC_ID);
    expect(flagged.leaderboardVariants.map((v) => v.gameSpecId)).toContain(
      CROSSROADS_CHESS_SPEC_ID,
    );
    expect(flagged.profileRatingVariants.map((v) => v.gameSpecId)).toContain(
      CROSSROADS_CHESS_SPEC_ID,
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps Dark Shogi represented but not launch-enabled', () => {
    expect(gameSpecForId(DARK_SHOGI_SPEC_ID).runtimeStatus).toBe('dev-spike');
    expect(VARIANTS.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
    expect(enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
    expect(leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
    expect(variantMiniIdForGameSpec(DARK_SHOGI_SPEC_ID)).toBe('dark-shogi');
  });

  it('uses mini-board markers for soft-launch play-menu variants', () => {
    expect(variantMiniIdForGameSpec(DARK_CROSSROADS_CHESS_SPEC_ID)).toBe('dark-crossroads');
    expect(variantMiniIdForGameSpec(DARK_CRAZYHOUSE_SPEC_ID)).toBe('dark-crazyhouse');
  });

  it('uses canonical game-spec API params for current variants', () => {
    expect(VARIANTS.map((v) => [v.gameSpecId, v.apiParam])).toEqual([
      [DARK_CHESS_SPEC_ID, 'fog'],
      [DARK_DRAFT960_SPEC_ID, 'dark-draft960'],
      [DARK_MINI_XIANGQI_SPEC_ID, 'dark-mini-xiangqi'],
      [DARK_XIANGQI_SPEC_ID, 'dark-xiangqi'],
      [JIEQI_SPEC_ID, 'jieqi'],
      [BANQI_SPEC_ID, 'banqi'],
      [REVEAL_CHESS_SPEC_ID, 'reveal-chess'],
      // Perfect-info Crossroads is ranked last on purpose (hidden-info variants first).
      [CROSSROADS_CHESS_SPEC_ID, 'crossroads-chess'],
    ]);
  });

  it('shows Jieqi + Banqi + Reveal Chess on rating surfaces behind their flags, never in the lobby', async () => {
    // Rating-ready: visible on leaderboard/profile when their variant flag is on
    // (gated globally by MISTBOARD_RATED_ENABLED on the server), but never
    // lobby-selectable — none has open-seek matchmaking.
    vi.resetModules();
    vi.stubEnv('VITE_JIEQI_ENABLED', 'true');
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');
    vi.stubEnv('VITE_REVEAL_CHESS_ENABLED', 'true');
    const flagged = await import('./variants.js');

    for (const specId of [JIEQI_SPEC_ID, BANQI_SPEC_ID, REVEAL_CHESS_SPEC_ID]) {
      expect(flagged.leaderboardVariants.map((v) => v.gameSpecId)).toContain(specId);
      expect(flagged.profileRatingVariants.map((v) => v.gameSpecId)).toContain(specId);
      expect(flagged.enabledVariants.map((v) => v.gameSpecId)).not.toContain(specId);
    }

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps Jieqi + Banqi + Reveal Chess off the rating surfaces when their flags are off', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    const prod = await import('./variants.js');
    for (const specId of [JIEQI_SPEC_ID, BANQI_SPEC_ID, REVEAL_CHESS_SPEC_ID]) {
      expect(prod.leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(specId);
      expect(prod.profileRatingVariants.map((v) => v.gameSpecId)).not.toContain(specId);
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
