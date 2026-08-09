import { describe, expect, it } from 'vitest';
import {
  LANDING_BOT_GAME_SPEC_IDS,
  landingBotLineup,
  landingBotOffer,
  landingBotRotationBucket,
  landingXiangqiBotOffers,
} from './landing-bot-policy.js';

describe('landing bot policy', () => {
  it('uses shared six-hour UTC buckets', () => {
    const before = landingBotRotationBucket(new Date('2026-07-23T05:59:59.999Z'));
    const after = landingBotRotationBucket(new Date('2026-07-23T06:00:00.000Z'));

    expect(landingBotRotationBucket(new Date('2026-07-23T00:00:00.000Z'))).toBe(before);
    expect(after).toBe(before + 1);
  });

  it('shows six distinct variants and covers the full shelf in any two buckets', () => {
    for (let bucket = 0; bucket < 3; bucket++) {
      const current = landingBotLineup(bucket);
      const next = landingBotLineup(bucket + 1);

      expect(current).toHaveLength(6);
      expect(new Set(current).size).toBe(6);
      expect(new Set([...current, ...next])).toEqual(new Set(LANDING_BOT_GAME_SPEC_IDS));
    }
  });

  it('pins one stable FSF opponent per variant at 3+2', () => {
    expect(landingBotOffer('xiangqi')).toMatchObject({
      botId: 'fairy-stockfish-level-5',
      botName: 'Fairy-Stockfish Level 5',
      timeControlId: '3m2',
    });
    expect(landingBotOffer('fortress-xiangqi')?.botId).toBe('fairy-stockfish-level-4');
  });

  it('offers the xiangqi ladder ascending, with the primary as one of its rungs', () => {
    const offers = landingXiangqiBotOffers();
    expect(offers.map((offer) => offer.botId)).toEqual([
      'fairy-stockfish-level-2',
      'fairy-stockfish-level-5',
      'fairy-stockfish-level-8',
    ]);

    // Ascending strength is the point of the block: the Rating column is read
    // top-to-bottom as one gradient, so a rung out of order is the bug.
    const levels = offers.map((offer) =>
      Number(offer.botId.slice('fairy-stockfish-level-'.length)),
    );
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    // Quick Pairing starts the canonical offer, so it has to be a rung the
    // Lobby shows or the two surfaces disagree about who "the computer" is.
    expect(offers.map((offer) => offer.botId)).toContain(landingBotOffer('xiangqi')?.botId);
    // Pikafish is the separate elite challenge, never a rung on this ladder.
    expect(offers.every((offer) => offer.botId.startsWith('fairy-stockfish-level-'))).toBe(true);
  });

  it('uses the established house bot for every other supported variant', () => {
    expect(landingBotOffer('jieqi')?.botId).toBe('pikafish');
    for (const gameSpecId of ['banqi', 'dark-xiangqi', 'dark-chess', 'jungle', 'jungle-flip']) {
      expect(landingBotOffer(gameSpecId)).toMatchObject({
        botId: 'misty',
        timeControlId: '3m2',
      });
    }
    expect(landingBotOffer('dark-shogi')).toBeNull();
  });
});
