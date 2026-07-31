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

  it('rotates the xiangqi ladder and fortress levels while keeping 3+2', () => {
    expect(landingBotOffer('xiangqi', 0)).toMatchObject({
      botId: 'fairy-stockfish-level-1',
      timeControlId: '3m2',
    });
    expect(landingBotOffer('xiangqi', 7)?.botId).toBe('fairy-stockfish-level-8');
    expect(landingBotOffer('xiangqi', 8)?.botId).toBe('pikafish');
    expect(landingBotOffer('fortress-xiangqi', 7)?.botId).toBe('fairy-stockfish-level-8');
    expect(landingBotOffer('fortress-xiangqi', 8)?.botId).toBe('fairy-stockfish-level-1');
  });

  it('adds two distinct rotating FSF xiangqi offers beside the primary opponent', () => {
    expect(landingXiangqiBotOffers(0).map((offer) => offer.botId)).toEqual([
      'fairy-stockfish-level-1',
      'fairy-stockfish-level-4',
      'fairy-stockfish-level-7',
    ]);
    expect(landingXiangqiBotOffers(8).map((offer) => offer.botId)).toEqual([
      'pikafish',
      'fairy-stockfish-level-4',
      'fairy-stockfish-level-7',
    ]);

    // Nine primary opponents and eight FSF levels repeat every 72 buckets.
    for (let bucket = 0; bucket < 72; bucket++) {
      const offers = landingXiangqiBotOffers(bucket);
      expect(offers).toHaveLength(3);
      expect(offers[0]).toEqual(landingBotOffer('xiangqi', bucket));
      expect(new Set(offers.map((offer) => offer.botId)).size).toBe(3);
      expect(
        offers.slice(1).every((offer) => offer.botId.startsWith('fairy-stockfish-level-')),
      ).toBe(true);
    }
  });

  it('uses the established house bot for every other supported variant', () => {
    expect(landingBotOffer('jieqi', 0)?.botId).toBe('pikafish');
    for (const gameSpecId of ['banqi', 'dark-xiangqi', 'dark-chess', 'jungle', 'jungle-flip']) {
      expect(landingBotOffer(gameSpecId, 0)).toMatchObject({
        botId: 'misty',
        timeControlId: '3m2',
      });
    }
    expect(landingBotOffer('dark-shogi', 0)).toBeNull();
  });
});
