import { describe, expect, it } from 'vitest';
import {
  displayParticipantName,
  MISTBOARD_ENGINE_V2_BASE_ID,
  MISTBOARD_ENGINE_V2_BASE_NAME,
  MISTBOARD_ENGINE_V2_KLUSS_ID,
  MISTBOARD_ENGINE_V2_KLUSS_NAME,
  participantForColor,
} from './game-display.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';

describe('homepageShowcaseGames', () => {
  const expectedKlussColorByRoom = new Map<string, 'white' | 'black'>([
    ['engine-v2-g0000', 'white'],
    ['engine-v2-g0001', 'black'],
    ['engine-v2-g0002', 'white'],
    ['engine-v2-g0003', 'black'],
    ['engine-v2-g0004', 'black'],
    ['engine-v2-g0005', 'white'],
    ['engine-v2-g0006', 'black'],
    ['engine-v2-g0007', 'black'],
    ['engine-v2-g0008', 'black'],
    ['engine-v2-g0009', 'black'],
    ['engine-v2-g0010', 'black'],
  ]);

  it('uses the KLUSS side as the homepage replay POV', () => {
    for (const game of homepageShowcaseGames()) {
      const klussColor = expectedKlussColorByRoom.get(game.roomId);

      expect(klussColor).toBeDefined();
      expect(game.playerColor).toBe(klussColor);
      expect(pickHeroPovForGame(game)).toBe(klussColor);
    }
  });

  it('keeps engine names attached to the side that played that config', () => {
    for (const game of homepageShowcaseGames()) {
      const klussColor = expectedKlussColorByRoom.get(game.roomId)!;
      const baseColor = klussColor === 'white' ? 'black' : 'white';

      expect(displayParticipantName(game, klussColor)).toBe(MISTBOARD_ENGINE_V2_KLUSS_NAME);
      expect(participantForColor(game, klussColor)).toMatchObject({
        color: klussColor,
        displayName: MISTBOARD_ENGINE_V2_KLUSS_NAME,
        subjectId: MISTBOARD_ENGINE_V2_KLUSS_ID,
      });
      expect(displayParticipantName(game, baseColor)).toBe(MISTBOARD_ENGINE_V2_BASE_NAME);
      expect(participantForColor(game, baseColor)).toMatchObject({
        color: baseColor,
        displayName: MISTBOARD_ENGINE_V2_BASE_NAME,
        subjectId: MISTBOARD_ENGINE_V2_BASE_ID,
      });
    }
  });
});
