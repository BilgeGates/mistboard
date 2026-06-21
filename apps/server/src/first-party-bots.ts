export type FirstPartyBotProfile = {
  id: string;
  displayName: string;
  activeEngineId: string;
  defaultGameSpecId: string;
};

export const FIRST_PARTY_BOT_PROFILES: readonly FirstPartyBotProfile[] = [
  {
    id: 'misty-dark-chess',
    displayName: 'Misty',
    activeEngineId: 'python-v2-v1.4',
    defaultGameSpecId: 'dark-chess',
  },
  {
    id: 'misty-dmx',
    displayName: 'Misty DMX',
    activeEngineId: 'python-dmx-v1.0',
    defaultGameSpecId: 'dark-mini-xiangqi',
  },
  {
    id: 'pika-jieqi',
    displayName: 'PikaJieQi',
    activeEngineId: 'pikafish-jieqi-strong',
    defaultGameSpecId: 'jieqi',
  },
  {
    id: 'misty-banqi',
    displayName: 'MistyBanqi',
    activeEngineId: 'misty-banqi',
    defaultGameSpecId: 'banqi',
  },
  {
    id: 'fairy-stockfish-crossroads',
    displayName: 'Fairy Stockfish Crossroads',
    activeEngineId: 'fairy-stockfish-crossroads-strong',
    defaultGameSpecId: 'crossroads-chess',
  },
];

const botByEngineId = new Map(FIRST_PARTY_BOT_PROFILES.map((bot) => [bot.activeEngineId, bot]));

export function firstPartyBotForEngine(engineId: string): FirstPartyBotProfile | null {
  return botByEngineId.get(engineId) ?? null;
}
