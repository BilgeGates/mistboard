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

const XIANGQI_BOT_IDS = [
  'fairy-stockfish-level-1',
  'fairy-stockfish-level-2',
  'fairy-stockfish-level-3',
  'fairy-stockfish-level-4',
  'fairy-stockfish-level-5',
  'fairy-stockfish-level-6',
  'fairy-stockfish-level-7',
  'fairy-stockfish-level-8',
  'pikafish',
] as const;

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
    botId = XIANGQI_BOT_IDS[positiveModulo(bucket, XIANGQI_BOT_IDS.length)]!;
    botName =
      botId === 'pikafish'
        ? 'Pikafish'
        : `Fairy-Stockfish Level ${botId.slice('fairy-stockfish-level-'.length)}`;
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

function isLandingBotGameSpecId(gameSpecId: string): gameSpecId is LandingBotGameSpecId {
  return (LANDING_BOT_GAME_SPEC_IDS as readonly string[]).includes(gameSpecId);
}

function positiveModulo(value: number, divisor: number): number {
  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}
