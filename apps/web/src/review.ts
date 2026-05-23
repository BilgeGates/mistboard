// Game-review data plumbing extracted from landing.ts.
//
// Owns the fetchers + row-converters that hydrate the engine-review panels
// on /game/:id. Consumed by mountGame in landing.ts.

import { replayGameEvents, type GameEvent } from '@mistboard/game';
import type { BeliefRow, TraceRow } from './belief-panel.js';
import type { EngineReviewPanels } from './replay.js';

export type GameReviewPayload = {
  game: FeaturedGame;
  events: GameEvent[];
  capabilities: {
    canViewEngineArtifacts: boolean;
    canAnnotate: boolean;
    canManageEngineArtifacts: boolean;
  };
  panels: {
    belief: {
      available: boolean;
      defaultOpen: boolean;
      seats: Array<'white' | 'black'>;
      snapshotKinds: string[];
    };
    trace: {
      available: boolean;
      defaultOpen: boolean;
      seats: Array<'white' | 'black'>;
    };
    annotations: {
      available: boolean;
      writable: boolean;
    };
  };
};

export type GameArtifactPayload = {
  id: number;
  gameId: string;
  ply: number | null;
  engineColor: 'white' | 'black' | null;
  artifactType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type GameArtifactType = 'belief-snapshot' | 'trace-row' | 'engine-move-choice';

// FeaturedGame / GameParticipant are mirrored here to avoid a circular import
// with landing.ts. They must stay in sync with the same types in landing.ts —
// extract to a shared types module if a third caller appears.
type FeaturedGame = {
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

type GameParticipant = {
  color: 'white' | 'black';
  displayName: string;
  subjectType: 'guest' | 'user' | 'engine-version' | 'manual' | 'imported';
  subjectId: string | null;
  visibility: 'private' | 'link' | 'unlisted' | 'public';
};

export async function loadGameForReview(roomId: string): Promise<{
  beliefRows: BeliefRow[];
  events?: GameEvent[];
  game: FeaturedGame;
  review?: GameReviewPayload;
  traceRows: TraceRow[];
} | null> {
  const review = await fetchGameReview(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (review) {
    const [beliefArtifacts, traceArtifacts] = await Promise.all([
      review.panels.belief.available
        ? fetchGameArtifacts(roomId, 'belief-snapshot').catch((err) => {
            console.warn(err);
            return [];
          })
        : Promise.resolve([]),
      review.panels.trace.available
        ? fetchTraceArtifacts(roomId).catch((err) => {
            console.warn(err);
            return [];
          })
        : Promise.resolve([]),
    ]);
    const beliefRows = beliefArtifacts.map((artifact) => beliefRowFromArtifact(review.game, artifact));
    const traceRows = traceArtifacts.map((artifact) => traceRowFromArtifact(review.game, artifact));
    return {
      beliefRows,
      game: review.game,
      events: review.events,
      review,
      traceRows,
    };
  }

  const game = await fetchGameSummary(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (game) return { game, beliefRows: [], traceRows: [] };

  const events = await fetchEventsByRoomId(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!events || events.length === 0) return null;

  const fallback = gameSummaryFromEvents(roomId, events);
  return fallback ? { game: fallback, events, beliefRows: [], traceRows: [] } : null;
}

export function enginePanelsForReview(
  review: GameReviewPayload,
  hasBeliefRows: boolean,
  hasTraceRows = false,
): EngineReviewPanels {
  return {
    belief: hasBeliefRows ? undefined : review.panels.belief,
    trace: hasTraceRows ? undefined : review.panels.trace,
  };
}

async function fetchGameReview(roomId: string): Promise<GameReviewPayload | null> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/review`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load review for ${roomId}: ${resp.status}`);
  return await resp.json() as GameReviewPayload;
}

async function fetchGameSummary(roomId: string): Promise<FeaturedGame | null> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load game summary for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { game: FeaturedGame };
  return data.game;
}

// Sibling to apiEventLoader in landing.ts — inlined here to avoid a
// circular import with landing.ts. Both fetch the same endpoint.
async function fetchEventsByRoomId(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

async function fetchGameArtifacts(
  roomId: string,
  type: GameArtifactType,
): Promise<GameArtifactPayload[]> {
  const url = new URL(`/api/games/${encodeURIComponent(roomId)}/artifacts`, window.location.origin);
  url.searchParams.set('type', type);
  const resp = await fetch(url.pathname + url.search);
  if (resp.status === 404 || resp.status === 403) return [];
  if (!resp.ok) throw new Error(`failed to load ${type} artifacts for ${roomId}: ${resp.status}`);
  const data = await resp.json() as { artifacts: GameArtifactPayload[] };
  return data.artifacts;
}

async function fetchTraceArtifacts(roomId: string): Promise<GameArtifactPayload[]> {
  const groups = await Promise.all([
    fetchGameArtifacts(roomId, 'trace-row'),
    fetchGameArtifacts(roomId, 'engine-move-choice'),
  ]);
  return groups
    .flat()
    .sort((left, right) => (
      (left.ply ?? Number.MAX_SAFE_INTEGER) - (right.ply ?? Number.MAX_SAFE_INTEGER)
      || left.id - right.id
    ));
}

function beliefRowFromArtifact(game: FeaturedGame, artifact: GameArtifactPayload): BeliefRow {
  const payload = artifact.payload;
  const side = colorValue(payload.tier1_side) ?? artifact.engineColor ?? 'white';
  const snapshotKind = snapshotKindValue(payload.snapshot_kind);
  return {
    ...(payload as Partial<BeliefRow>),
    game_index: numberValue(payload.game_index) ?? game.gameIndex ?? 0,
    tier1_seat: stringValue(payload.tier1_seat) ?? artifact.engineColor ?? side,
    tier1_side: side,
    ply: numberValue(payload.ply) ?? artifact.ply ?? 0,
    snapshot_kind: snapshotKind ?? undefined,
    decision_path: stringValue(payload.decision_path) ?? artifact.artifactType,
    particle_count: numberValue(payload.particle_count) ?? 0,
    particle_count_unique: numberValue(payload.particle_count_unique) ?? numberValue(payload.particle_count) ?? 0,
    opp_remaining_counts: recordValue(payload.opp_remaining_counts) as BeliefRow['opp_remaining_counts'],
    last_constraint_pruned: numberValue(payload.last_constraint_pruned) ?? 0,
    marginal_field: recordValue(payload.marginal_field) as BeliefRow['marginal_field'],
    top_k_clusters: Array.isArray(payload.top_k_clusters) ? payload.top_k_clusters as BeliefRow['top_k_clusters'] : [],
  };
}

function traceRowFromArtifact(game: FeaturedGame, artifact: GameArtifactPayload): TraceRow {
  const payload = artifact.payload;
  const side = colorValue(payload.tier1_side) ?? artifact.engineColor ?? 'white';
  return {
    ...(payload as Partial<TraceRow>),
    game_index: numberValue(payload.game_index) ?? game.gameIndex ?? 0,
    tier1_seat: stringValue(payload.tier1_seat) ?? artifact.engineColor ?? side,
    tier1_side: side,
    ply: numberValue(payload.ply) ?? artifact.ply ?? 0,
    decision_path: stringValue(payload.decision_path) ?? artifact.artifactType,
    move_chosen_uci: moveUciFromPayload(payload),
  };
}

function gameSummaryFromEvents(roomId: string, events: GameEvent[]): FeaturedGame | null {
  const projection = replayGameEvents(events);
  const status = projection.state.status;
  if (status.type !== 'finished') return null;

  return {
    roomId,
    variant: projection.variant,
    mode: modeFromSeats(projection.seats.white, projection.seats.black),
    result: status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw',
    termination: status.reason,
    plyCount: events.filter((event) => event.type === 'move-played').length,
    whiteName: null,
    blackName: null,
    corpusId: null,
    participants: [
      participantFromSeat('white', projection.seats.white, null),
      participantFromSeat('black', projection.seats.black, null),
    ],
  };
}

function modeFromSeats(whiteClient: string | undefined, blackClient: string | undefined): FeaturedGame['mode'] {
  const whiteEngine = isEngineClient(whiteClient);
  const blackEngine = isEngineClient(blackClient);
  if (whiteEngine && blackEngine) return 'eve';
  if (whiteEngine || blackEngine) return 'pve';
  return 'pvp';
}

function participantFromSeat(
  color: 'white' | 'black',
  clientId: string | undefined,
  fallbackName: string | null,
): GameParticipant {
  if (isEngineClient(clientId)) {
    const subjectId = canonicalEngineId(clientId!);
    return {
      color,
      displayName: fallbackName ?? subjectId,
      subjectType: 'engine-version',
      subjectId,
      visibility: 'public',
    };
  }
  return {
    color,
    displayName: fallbackName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'public',
  };
}

function isEngineClient(clientId: string | undefined): boolean {
  return !!clientId && (
    clientId === 'random-engine'
    || clientId === 'engine:white'
    || clientId === 'engine:black'
    || clientId.startsWith('engine:')
    || clientId.startsWith('builtin-')
    || clientId.startsWith('python-')
  );
}

function canonicalEngineId(clientId: string): string {
  if (clientId === 'random-engine') return 'builtin-random-legal';
  return clientId;
}

function colorValue(value: unknown): 'white' | 'black' | null {
  return value === 'white' || value === 'black' ? value : null;
}

function snapshotKindValue(value: unknown): BeliefRow['snapshot_kind'] | null {
  return value === 'decision' || value === 'after-own-move' || value === 'after-opp-move' ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recordValue(value: unknown): Record<string, never> | Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function moveUciFromPayload(payload: Record<string, unknown>): string {
  const explicit = stringValue(payload.move_chosen_uci);
  if (explicit) return explicit;
  const selectedMove = recordValue(payload.selected_move);
  const from = stringValue(selectedMove.from);
  const to = stringValue(selectedMove.to);
  if (!from || !to) return '';
  return `${from}${to}${stringValue(selectedMove.promotion) ?? ''}`;
}
