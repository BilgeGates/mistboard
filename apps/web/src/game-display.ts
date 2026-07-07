import { maybeGameSpecForId } from '@mistboard/game';

export const MISTBOARD_ENGINE_SNAPSHOT_ID = 'engine-v2-2026-05-24';
export const MISTBOARD_ENGINE_SNAPSHOT_NAME = 'Mistboard Engine v2.0';
export const MISTBOARD_ENGINE_BASELINE_NAME = 'Mistboard Engine v0.9.5';

// Current player-facing engine identity (the v2 engine). v1.1 shipped 2026-06-16,
// superseding v1.0. Used for the homepage self-play showcase and as the canonical
// display name wherever the engine's subject id appears.
export const MISTBOARD_ENGINE_MISTY_ID = 'python-v2-v1.1';
export const MISTBOARD_ENGINE_MISTY_NAME = 'Misty 1.1';

export type GameParticipant = {
  color: 'white' | 'black' | 'red';
  displayName: string;
  subjectType: 'guest' | 'user' | 'bot' | 'engine-version' | 'manual' | 'imported';
  subjectId: string | null;
  visibility: 'private' | 'link' | 'unlisted' | 'public';
  ratingBefore?: number | null;
  ratingAfter?: number | null;
};

export type FeaturedGame = {
  roomId: string;
  variant: string;
  mode?: 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
  // Whether the game counted toward ratings. Absent on feeds that don't carry
  // it (treated as rated by COALESCE on the server); the profile list relies on
  // it to tag rows rated vs casual.
  rated?: boolean;
  result: string;
  termination: string;
  plyCount: number;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  endedAt?: string;
  jobId?: string | null;
  gameIndex?: number | null;
  whiteEngineId?: string | null;
  blackEngineId?: string | null;
  timeControl?: Record<string, unknown> | null;
  // Real-clock games (PvP/PvE) carry their time control in these columns; the
  // legacy `timeControl` blob is null for them. gameMetaForGame rebuilds a
  // time-control object from these when `timeControl` is absent.
  initialMs?: number | null;
  incrementMs?: number | null;
  participants?: GameParticipant[];
  playerColor?: GameParticipant['color'];
  // Banqi only: the ink bound to the first-mover seat on the opening flip, so list
  // surfaces can show the result by ink ("Black wins") rather than the seat token.
  // Absent/null for every other variant (seat == ink) and for unreplayable games.
  firstColor?: 'red' | 'black' | null;
};

export function displayParticipantName(
  game: FeaturedGame,
  color: GameParticipant['color'],
): string {
  const participant = participantForColor(game, color);
  if (participant)
    return displayParticipant(
      participant.displayName,
      fallbackSeatName(color),
      participant.subjectId,
    );
  const fallback = fallbackSeatName(color);
  const legacyName =
    color === 'white'
      ? (game.whiteEngineId ?? game.whiteName)
      : color === 'black'
        ? (game.blackEngineId ?? game.blackName)
        : null;
  return displayParticipant(legacyName, fallback);
}

export function participantForColor(
  game: FeaturedGame,
  color: GameParticipant['color'],
): GameParticipant | null {
  return game.participants?.find((participant) => participant.color === color) ?? null;
}

function fallbackSeatName(color: GameParticipant['color']): string {
  if (color === 'red') return 'Red';
  if (color === 'white') return 'White';
  return 'Black';
}

function displayParticipant(
  name: string | null | undefined,
  fallback: string,
  subjectId?: string | null,
): string {
  const detailed = engineDisplayName(subjectId ?? name);
  if (detailed) return detailed;
  if (!name) return fallback;
  return name;
}

// Human label for a persisted games.variant value. Legacy/alias strings + the
// 'Dark Chess' casing are handled explicitly (the dark-chess spec publicName is
// the lowercase 'Fog Chess'); everything else derives from the canonical spec
// so new variants are labelled without editing here.
export function variantDisplayLabel(variant: string): string {
  if (variant === 'fog' || variant === 'dark-chess') return 'Dark Chess';
  if (variant === 'draft960' || variant === 'fog-draft960' || variant === 'dark-draft960')
    return 'Dark Draft960';
  if (variant === 'crossroads-chess' || variant === 'dual-chess') return 'Crossroads Chess';
  return maybeGameSpecForId(variant)?.publicName ?? variant;
}

export function sourceLabel(mode: FeaturedGame['mode']): string {
  if (mode === 'eve') return 'Engine vs engine';
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'pvp') return 'Human vs human';
  if (mode === 'imported') return 'Imported game';
  if (mode === 'manual') return 'Manual game';
  return 'Fog Chess game';
}

function engineDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const known: Record<string, string> = {
    'builtin-capture-seeker': 'Capture Seeker v1',
    'builtin-random-legal': 'Random Legal v1',
    [MISTBOARD_ENGINE_SNAPSHOT_ID]: MISTBOARD_ENGINE_SNAPSHOT_NAME,
    [MISTBOARD_ENGINE_MISTY_ID]: MISTBOARD_ENGINE_MISTY_NAME,
    'python-v2-v1.0': 'Misty 1.0', // historical: 1.0 games still display correctly post-1.1

    'python-random-legal': 'Random Legal Python v1',
    'python-tier1-v0.7.0': 'Mistboard Engine preview',
    'python-tier1-v0.7.22': 'Mistboard Engine preview',
    'python-tier1-v0.8.9': 'Mistboard Engine preview',
    'python-tier1-v0.9.1': 'Mistboard Engine preview',
    'python-tier1-v0.9.5': MISTBOARD_ENGINE_BASELINE_NAME,
    'python-tier1-current': 'Mistboard Engine dev build',
    'python-dmx-v1.0': 'Misty DMX 1.0',
  };
  return known[name] ?? null;
}
