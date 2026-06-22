export type FirstPartyBotProfile = {
  id: string;
  displayName: string;
  activeEngineId: string;
  attributionEngineIds?: readonly string[];
  defaultGameSpecId: string;
};

export const MISTY_DARK_CHESS_ACTIVE_ENGINE_ID = 'python-v2-v1.5';

export const FIRST_PARTY_BOT_PROFILES: readonly FirstPartyBotProfile[] = [
  {
    id: 'misty-dark-chess',
    displayName: 'Misty',
    activeEngineId: MISTY_DARK_CHESS_ACTIVE_ENGINE_ID,
    attributionEngineIds: [
      'python-v2-v1.0',
      'python-v2-v1.1',
      'python-v2-v1.2',
      'python-v2-v1.3',
      'python-v2-v1.4',
    ],
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
  {
    id: 'misty-drop-mini-level-1',
    displayName: 'Misty Drop Mini level 1',
    activeEngineId: 'misty-drop-mini-level-1',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
  {
    id: 'misty-drop-mini-level-2',
    displayName: 'Misty Drop Mini level 2',
    activeEngineId: 'misty-drop-mini-level-2',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
  {
    id: 'misty-drop-mini-level-3',
    displayName: 'Misty Drop Mini level 3',
    activeEngineId: 'misty-drop-mini-level-3',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
];

const botByEngineId = new Map<string, FirstPartyBotProfile>();
const botById = new Map<string, FirstPartyBotProfile>();
for (const bot of FIRST_PARTY_BOT_PROFILES) {
  botById.set(bot.id, bot);
  botByEngineId.set(bot.activeEngineId, bot);
  for (const engineId of bot.attributionEngineIds ?? []) {
    botByEngineId.set(engineId, bot);
  }
}

export function firstPartyBotForId(botId: string): FirstPartyBotProfile | null {
  return botById.get(botId) ?? null;
}

export function firstPartyBotForEngine(engineId: string): FirstPartyBotProfile | null {
  return botByEngineId.get(engineId) ?? null;
}
