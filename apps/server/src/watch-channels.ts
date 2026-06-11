import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  type GameFamilyId,
  type GameSpecId,
} from '@mistboard/game';
import { crossroadsChessEnabled, darkMiniXiangqiEnabled } from './feature-flags.js';

export type WatchChannelId = 'dark-chess' | 'dark-mini-xiangqi' | 'crossroads-chess';

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
  {
    default: false,
    family: 'xiangqi',
    gameSpecIds: [DARK_MINI_XIANGQI_SPEC_ID],
    id: 'dark-mini-xiangqi',
    label: 'Dark Mini Xiangqi',
    legacyVariants: ['dark-mini-xiangqi'],
  },
  {
    default: false,
    family: 'crossroads-chess',
    gameSpecIds: [CROSSROADS_CHESS_SPEC_ID],
    id: 'crossroads-chess',
    label: 'Crossroads Chess',
    legacyVariants: ['crossroads-chess', 'dual-chess'],
  },
];

// Channels can be gated behind a feature flag so a variant's watch tab only
// appears once the variant is being launched. Hidden channels are also
// unreachable by deep link (watchChannelForId returns null for them).
function channelEnabled(channel: WatchChannel): boolean {
  if (channel.id === 'dark-mini-xiangqi') return darkMiniXiangqiEnabled();
  if (channel.id === 'crossroads-chess') return crossroadsChessEnabled();
  return true;
}

export function listWatchChannels(): readonly WatchChannel[] {
  return WATCH_CHANNELS.filter(channelEnabled);
}

export function defaultWatchChannel(): WatchChannel {
  const enabled = listWatchChannels();
  return enabled.find((channel) => channel.default) ?? enabled[0]!;
}

export function watchChannelForId(id: string | null | undefined): WatchChannel | null {
  const enabled = listWatchChannels();
  if (!id) return defaultWatchChannel();
  return enabled.find((channel) => channel.id === id) ?? null;
}
