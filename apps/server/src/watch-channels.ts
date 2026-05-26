import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  type GameFamilyId,
  type GameSpecId,
} from '@mistboard/game';

export type WatchChannelId = 'dark-chess';

export type WatchChannel = {
  default: boolean;
  family: GameFamilyId;
  gameSpecIds: readonly GameSpecId[];
  id: WatchChannelId;
  label: string;
  legacyVariants: readonly string[];
};

const WATCH_CHANNELS: readonly WatchChannel[] = [
  {
    default: true,
    family: 'chess',
    gameSpecIds: [DARK_CHESS_SPEC_ID, DARK_DRAFT960_SPEC_ID],
    id: 'dark-chess',
    label: 'Dark chess',
    legacyVariants: ['dark-chess', 'draft960'],
  },
];

export function listWatchChannels(): readonly WatchChannel[] {
  return WATCH_CHANNELS;
}

export function defaultWatchChannel(): WatchChannel {
  return WATCH_CHANNELS.find((channel) => channel.default) ?? WATCH_CHANNELS[0]!;
}

export function watchChannelForId(id: string | null | undefined): WatchChannel | null {
  if (!id) return defaultWatchChannel();
  return WATCH_CHANNELS.find((channel) => channel.id === id) ?? null;
}
