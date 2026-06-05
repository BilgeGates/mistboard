import { describe, expect, it } from 'vitest';
import {
  displayParticipantName,
  MISTBOARD_ENGINE_MISTY_ID,
  MISTBOARD_ENGINE_MISTY_NAME,
  participantForColor,
} from './game-display.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';

describe('homepageShowcaseGames', () => {
  it('presents every side as the current Misty 1.0 engine', () => {
    for (const game of homepageShowcaseGames()) {
      for (const color of ['white', 'black'] as const) {
        expect(displayParticipantName(game, color)).toBe(MISTBOARD_ENGINE_MISTY_NAME);
        expect(participantForColor(game, color)).toMatchObject({
          color,
          displayName: MISTBOARD_ENGINE_MISTY_NAME,
          subjectType: 'engine-version',
          subjectId: MISTBOARD_ENGINE_MISTY_ID,
        });
      }
    }
  });

  it('shows the winning side as the homepage replay POV', () => {
    for (const game of homepageShowcaseGames()) {
      const winner = game.result === 'black-wins' ? 'black' : 'white';
      // Self-play carries no fixed player side, so POV follows the winner.
      expect(game.playerColor).toBeUndefined();
      expect(pickHeroPovForGame(game)).toBe(winner);
    }
  });
});
