import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
} from '@mistboard/game';
import { describe, expect, it, vi } from 'vitest';
import {
  enabledVariants,
  leaderboardVariants,
  profileRatingVariants,
  VARIANTS,
} from './variants.js';

describe('web variant launch registry', () => {
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

  it('keeps Dark Xiangqi represented but not launch-enabled', () => {
    expect(gameSpecForId(DARK_XIANGQI_SPEC_ID).runtimeStatus).toBe('dev-spike');
    expect(VARIANTS.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(profileRatingVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
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
    expect(gameSpecForId(DARK_SHOGI_SPEC_ID).runtimeStatus).toBe('future');
    expect(VARIANTS.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
    expect(enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
    expect(leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(DARK_SHOGI_SPEC_ID);
  });

  it('uses canonical game-spec API params for current variants', () => {
    expect(VARIANTS.map((v) => [v.gameSpecId, v.apiParam])).toEqual([
      [DARK_CHESS_SPEC_ID, 'fog'],
      [DARK_DRAFT960_SPEC_ID, 'dark-draft960'],
      [DARK_MINI_XIANGQI_SPEC_ID, 'dark-mini-xiangqi'],
      [CROSSROADS_CHESS_SPEC_ID, 'crossroads-chess'],
    ]);
  });
});
