import {
  BANQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
  JIEQI_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
  JUNGLE_SPEC_ID,
  type TimeControlId,
  XIANGQI_SPEC_ID,
} from '@mistboard/game';

// One small merchandising policy shared by the Lobby rows and Quick Pairing's
// Computer chips. Room creation remains server-authoritative.

export type LandingBotGameSpecId =
  | typeof XIANGQI_SPEC_ID
  | typeof BANQI_SPEC_ID
  | typeof JIEQI_SPEC_ID
  | typeof FORTRESS_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID
  | typeof DARK_CHESS_SPEC_ID
  | typeof JUNGLE_SPEC_ID
  | typeof JUNGLE_FLIP_SPEC_ID;

export type LandingBotOffer = {
  botId: string;
  botName: string;
  gameSpecId: LandingBotGameSpecId;
  timeControlId: TimeControlId;
};

const ROTATION_BUCKET_MS = 6 * 60 * 60 * 1_000;

export const LANDING_BOT_GAME_SPEC_IDS: readonly LandingBotGameSpecId[] = [
  XIANGQI_SPEC_ID,
  BANQI_SPEC_ID,
  JIEQI_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  JUNGLE_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
];

const ROTATING_LINEUPS: readonly (readonly LandingBotGameSpecId[])[] = [
  [BANQI_SPEC_ID, JIEQI_SPEC_ID, FORTRESS_XIANGQI_SPEC_ID, DARK_XIANGQI_SPEC_ID],
  [FORTRESS_XIANGQI_SPEC_ID, DARK_XIANGQI_SPEC_ID, JUNGLE_SPEC_ID, JUNGLE_FLIP_SPEC_ID],
  [BANQI_SPEC_ID, JIEQI_SPEC_ID, JUNGLE_SPEC_ID, JUNGLE_FLIP_SPEC_ID],
];

const XIANGQI_FSF_BOT_IDS = [
  'fairy-stockfish-level-1',
  'fairy-stockfish-level-2',
  'fairy-stockfish-level-3',
  'fairy-stockfish-level-4',
  'fairy-stockfish-level-5',
  'fairy-stockfish-level-6',
  'fairy-stockfish-level-7',
  'fairy-stockfish-level-8',
] as const;

const XIANGQI_BOT_IDS = [...XIANGQI_FSF_BOT_IDS, 'pikafish'] as const;

// Spread the two extra Lobby opponents across the FSF ladder instead of showing
// three neighboring difficulties. A third candidate handles the occasional
// bucket where the primary rotating opponent already occupies one of the first
// two slots.
const XIANGQI_EXTRA_FSF_OFFSETS = [3, 6, 1] as const;

export function landingBotRotationBucket(now: Date = new Date()): number {
  return Math.floor(now.getTime() / ROTATION_BUCKET_MS);
}

// Xiangqi and Fog Chess anchor every lineup. Four other slots rotate in paired
// families; any two consecutive buckets cover all eight live variants.
export function landingBotLineup(bucket: number): readonly LandingBotGameSpecId[] {
  const rotating = ROTATING_LINEUPS[positiveModulo(bucket, ROTATING_LINEUPS.length)]!;
  return [XIANGQI_SPEC_ID, DARK_CHESS_SPEC_ID, ...rotating];
}

export function landingBotOffer(gameSpecId: string, bucket: number): LandingBotOffer | null {
  if (!isLandingBotGameSpecId(gameSpecId)) return null;

  let botId = 'misty';
  let botName = 'Misty';
  if (gameSpecId === XIANGQI_SPEC_ID) {
    const xiangqiBotId = XIANGQI_BOT_IDS[positiveModulo(bucket, XIANGQI_BOT_IDS.length)]!;
    botId = xiangqiBotId;
    botName = xiangqiBotName(xiangqiBotId);
  } else if (gameSpecId === JIEQI_SPEC_ID) {
    botId = 'pikafish';
    botName = 'Pikafish';
  } else if (gameSpecId === FORTRESS_XIANGQI_SPEC_ID) {
    const level = positiveModulo(bucket, 8) + 1;
    botId = `fairy-stockfish-level-${level}`;
    botName = `Fairy-Stockfish Level ${level}`;
  }

  return {
    botId,
    botName,
    gameSpecId,
    timeControlId: '3m2',
  };
}

// The Lobby carries three Xiangqi requests at once: the canonical rotating
// opponent used by Quick Pairing plus two additional, always-FSF difficulty
// choices. The candidates are deterministic per bucket and filtered by bot id,
// so Pikafish buckets still receive two FSF rows and FSF buckets never duplicate
// their primary level.
export function landingXiangqiBotOffers(bucket: number): readonly LandingBotOffer[] {
  const primary = landingBotOffer(XIANGQI_SPEC_ID, bucket)!;
  const offers = [primary];

  for (const offset of XIANGQI_EXTRA_FSF_OFFSETS) {
    const botId = XIANGQI_FSF_BOT_IDS[positiveModulo(bucket + offset, XIANGQI_FSF_BOT_IDS.length)]!;
    if (offers.some((offer) => offer.botId === botId)) continue;
    offers.push({
      botId,
      botName: xiangqiBotName(botId),
      gameSpecId: XIANGQI_SPEC_ID,
      timeControlId: '3m2',
    });
    if (offers.length === 3) break;
  }

  return offers;
}

function xiangqiBotName(botId: (typeof XIANGQI_BOT_IDS)[number]): string {
  return botId === 'pikafish'
    ? 'Pikafish'
    : `Fairy-Stockfish Level ${botId.slice('fairy-stockfish-level-'.length)}`;
}

function isLandingBotGameSpecId(gameSpecId: string): gameSpecId is LandingBotGameSpecId {
  return (LANDING_BOT_GAME_SPEC_IDS as readonly string[]).includes(gameSpecId);
}

function positiveModulo(value: number, divisor: number): number {
  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}
