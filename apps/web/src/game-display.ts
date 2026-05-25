export const MISTBOARD_ENGINE_SNAPSHOT_ID = 'engine-v2-2026-05-24';
export const MISTBOARD_ENGINE_SNAPSHOT_NAME = 'Mistboard Engine v2.0';
export const MISTBOARD_ENGINE_BASELINE_NAME = 'Mistboard Engine v0.9.5';

export type GameParticipant = {
  color: 'white' | 'black';
  displayName: string;
  subjectType: 'guest' | 'user' | 'engine-version' | 'manual' | 'imported';
  subjectId: string | null;
  visibility: 'private' | 'link' | 'unlisted' | 'public';
  ratingBefore?: number | null;
  ratingAfter?: number | null;
};

export type FeaturedGame = {
  roomId: string;
  variant: string;
  mode?: 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
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
  participants?: GameParticipant[];
  playerColor?: 'white' | 'black';
};

export function displayParticipantName(game: FeaturedGame, color: 'white' | 'black'): string {
  const participant = participantForColor(game, color);
  if (participant)
    return displayParticipant(
      participant.displayName,
      color === 'white' ? 'White' : 'Black',
      participant.subjectId,
    );
  const fallback = color === 'white' ? 'White' : 'Black';
  const legacyName =
    color === 'white'
      ? (game.whiteEngineId ?? game.whiteName)
      : (game.blackEngineId ?? game.blackName);
  return displayParticipant(legacyName, fallback);
}

export function participantForColor(
  game: FeaturedGame,
  color: 'white' | 'black',
): GameParticipant | null {
  return game.participants?.find((participant) => participant.color === color) ?? null;
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

export function sourceLabel(mode: FeaturedGame['mode']): string {
  if (mode === 'eve') return 'Engine vs engine';
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'pvp') return 'Human vs human';
  if (mode === 'imported') return 'Imported game';
  if (mode === 'manual') return 'Manual game';
  return 'Dark chess game';
}

function engineDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const known: Record<string, string> = {
    'builtin-capture-seeker': 'Capture Seeker v1',
    'builtin-random-legal': 'Random Legal v1',
    [MISTBOARD_ENGINE_SNAPSHOT_ID]: MISTBOARD_ENGINE_SNAPSHOT_NAME,
    'python-random-legal': 'Random Legal Python v1',
    'python-tier1-v0.7.0': 'Mistboard Engine preview',
    'python-tier1-v0.7.22': 'Mistboard Engine preview',
    'python-tier1-v0.8.9': 'Mistboard Engine preview',
    'python-tier1-v0.9.1': 'Mistboard Engine preview',
    'python-tier1-v0.9.5': MISTBOARD_ENGINE_BASELINE_NAME,
    'python-tier1-current': 'Mistboard Engine dev build',
  };
  return known[name] ?? null;
}
