import {
  CANONICAL_VARIANT_ORDER,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  type GameFamilyId,
  type GameSpecId,
} from '@mistboard/game';
import { registeredVariantTenants } from './variant-tenant/registry.js';

// Channel ids are open-ended (one per watchable variant tenant) plus the
// hardcoded dark-chess channel, so this is a string alias rather than a closed
// union — adding a watchable variant must not require editing this type.
export type WatchChannelId = string;

export type WatchChannel = {
  default: boolean;
  family: GameFamilyId;
  gameSpecIds: readonly GameSpecId[];
  id: WatchChannelId;
  label: string;
  legacyVariants: readonly string[];
};

// Fog Chess is the one channel that cannot be derived from the registry: it is
// a registry MISS (the legacy chess stack is deliberately unregistered), so it
// stays a hardcoded constant and is always enabled + the default. Every other
// channel derives from a registered tenant's `watch` field.
const DARK_CHESS_CHANNEL: WatchChannel = {
  default: true,
  family: 'chess',
  gameSpecIds: [DARK_CHESS_SPEC_ID, DARK_DRAFT960_SPEC_ID],
  id: 'dark-chess',
  label: 'Fog Chess',
  legacyVariants: ['dark-chess', 'draft960'],
};

// Rail order, derived from the shared CANONICAL_VARIANT_ORDER so the watch rail
// matches the play menu / leaderboard / rules rail. Every watch channel id equals
// its spec id, so the spec order IS the channel order (dark-draft960 has no
// channel and is simply never matched). The registry's Map iteration order tracks
// tenant import order, not the rail's order, so channels are sorted by this list;
// dark-chess sorts to its canonical position like any other id (ids absent here
// sort to the end), and remains the default landing channel via its `default`.
const WATCH_CHANNEL_ORDER: readonly string[] = CANONICAL_VARIANT_ORDER;

function channelOrderIndex(channelId: string): number {
  const index = WATCH_CHANNEL_ORDER.indexOf(channelId);
  return index === -1 ? WATCH_CHANNEL_ORDER.length : index;
}

// The per-variant channels mapped from every registered tenant that declares a
// watch surface, sorted into the canonical rail order. Derived (not hardcoded)
// so adding a watchable variant = setting `watch` on its registration.
function channelsDerivedFromRegistry(): WatchChannel[] {
  const channels: WatchChannel[] = [];
  for (const registration of registeredVariantTenants()) {
    const watch = registration.watch;
    if (!watch) continue;
    channels.push({
      default: watch.default ?? false,
      family: watch.family as GameFamilyId,
      gameSpecIds: [registration.gameSpecId as GameSpecId],
      id: watch.channelId,
      label: watch.label,
      legacyVariants: watch.legacyVariants,
    });
  }
  return channels;
}

// Channels can be gated behind a feature flag so a variant's watch tab only
// appears once the variant is being launched. Hidden channels are also
// unreachable by deep link (watchChannelForId returns null for them). Dark
// chess is always on; every derived channel reuses its tenant's enabled() so
// the watch rail can never drift from the live-room gate.
function channelEnabled(channel: WatchChannel): boolean {
  if (channel.id === DARK_CHESS_CHANNEL.id) return true;
  const registration = registeredVariantTenants().find(
    (entry) => entry.watch?.channelId === channel.id,
  );
  return registration?.enabled() ?? false;
}

export function listWatchChannels(): readonly WatchChannel[] {
  // Fog Chess sorts into its canonical rail position alongside the derived
  // channels rather than always leading — the xiangqi pivot deranks chess, so
  // the watch rail must match the play menu / rules rail order. It stays the
  // default landing channel (see defaultWatchChannel) regardless of position.
  const all = [DARK_CHESS_CHANNEL, ...channelsDerivedFromRegistry()];
  all.sort((a, b) => channelOrderIndex(a.id) - channelOrderIndex(b.id));
  return all.filter(channelEnabled);
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
