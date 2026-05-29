import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { enabledVariants, leaderboardVariants, VARIANTS } from './variants.js';

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

  it('keeps the current public leaderboard scoped to Dark chess', () => {
    expect(leaderboardVariants.map((v) => v.gameSpecId)).toEqual([DARK_CHESS_SPEC_ID]);
  });

  it('keeps Dark Xiangqi represented but not launch-enabled', () => {
    expect(gameSpecForId(DARK_XIANGQI_SPEC_ID).runtimeStatus).toBe('dev-spike');
    expect(VARIANTS.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(enabledVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
    expect(leaderboardVariants.map((v) => v.gameSpecId)).not.toContain(DARK_XIANGQI_SPEC_ID);
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
    ]);
  });
});
