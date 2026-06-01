// Shared helpers for ingesting JSONL game-event logs (one game per file) into
// Postgres. The pure replay/attribution logic lives here so the generic
// directory importer (import-corpus.ts) and the shard-aware bakeoff importer
// (import-bakeoff-run.ts) derive game summaries identically and stay testable
// without a database.
import { type GameEvent, isGameEndReason, replayGameEvents } from '@mistboard/game';
import type { GameParticipant, GameSummary, GameVisibility } from './persistence.js';

// ── Event-log replay ────────────────────────────────────────────────────────

export function parseEventLog(raw: string): GameEvent[] {
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

export function roomIdFromEvents(events: GameEvent[], source: string): string {
  if (events.length === 0) throw new Error(`empty event log: ${source}`);
  const first = events[0]!;
  if (first.type !== 'room-created') {
    throw new Error(`expected room-created as first event in ${source}`);
  }
  return first.roomId;
}

export type ReplaySummary =
  | { finished: false; plyCount: number }
  | {
      finished: true;
      variant: string;
      result: GameSummary['result'];
      termination: GameSummary['termination'];
      plyCount: number;
    };

// Replay an event log to a terminal outcome. Returns finished:false (the caller
// skips the games row) when the log doesn't reach a finished status — e.g. a
// truncated bakeoff game with no king capture.
export function summarizeReplay(events: GameEvent[]): ReplaySummary {
  const plyCount = events.filter((e) => e.type === 'move-played').length;
  const projection = replayGameEvents(events);
  const status = projection.state.status;
  if (status.type !== 'finished') return { finished: false, plyCount };
  if (!isGameEndReason(status.reason)) {
    throw new Error(`unknown finished-game reason: ${String(status.reason)}`);
  }
  const result: GameSummary['result'] =
    status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw';
  return {
    finished: true,
    variant: projection.variant,
    result,
    termination: status.reason,
    plyCount,
  };
}

// ── Bakeoff shard records + attribution ──────────────────────────────────────

// One per-game record from a bakeoff shard-*.jsonl (or manifest.games[]). The
// v2/tier1 engine's color is the only attribution signal needed: the opponent
// took the other color. Field names differ between the shard log (v2_color,
// game_path) and the manifest (tier1_color, path); both are accepted.
export type BakeoffGameRecord = {
  gameId: string;
  tier1Color: 'white' | 'black';
  gamePath: string;
  wallSeconds: number | undefined;
};

export function parseShardRecord(line: Record<string, unknown>): BakeoffGameRecord | null {
  const gameId = typeof line.game_id === 'string' ? line.game_id : null;
  const color = line.v2_color ?? line.tier1_color;
  const gamePath = line.game_path ?? line.path;
  if (!gameId || (color !== 'white' && color !== 'black') || typeof gamePath !== 'string') {
    return null;
  }
  const wallSeconds = typeof line.wall_seconds === 'number' ? line.wall_seconds : undefined;
  return { gameId, tier1Color: color, gamePath, wallSeconds };
}

// Make a globally-unique room id for an ingested game. Bakeoff game ids
// (v2bakeoff-gNNNN) are only unique within a run, so two runs collide on shared
// indices and the later run's overlapping games are silently dropped. Prefixing
// with the corpus (the run's identity) makes ids unique across runs while
// staying deterministic, so re-ingesting the same run is still idempotent.
// Already-namespaced ids pass through unchanged.
export function namespaceRoomId(corpus: string, rawRoomId: string): string {
  const prefix = `${corpus}--`;
  return rawRoomId.startsWith(prefix) ? rawRoomId : `${prefix}${rawRoomId}`;
}

export type EngineIdentity = { subjectId: string; displayName: string };

// Assign the two engine identities to white/black for one game. The bakeoff
// alternates which color the tier1/v2 engine plays, so this per-game flip is
// exactly what import-corpus's blanket naming gets wrong.
export function participantsForBakeoffGame(
  tier1Color: 'white' | 'black',
  tier1: EngineIdentity,
  opponent: EngineIdentity,
  visibility: GameVisibility,
): GameParticipant[] {
  const white = tier1Color === 'white' ? tier1 : opponent;
  const black = tier1Color === 'black' ? tier1 : opponent;
  return [
    {
      color: 'white',
      subjectType: 'engine-version',
      subjectId: white.subjectId,
      displayName: white.displayName,
      visibility,
    },
    {
      color: 'black',
      subjectType: 'engine-version',
      subjectId: black.subjectId,
      displayName: black.displayName,
      visibility,
    },
  ];
}

// Reconstruct real timestamps for an ingested game. Bakeoff logs carry no
// absolute time, but the game file's mtime approximates when it was written
// (ended), and the shard's wall_seconds gives the duration to back out the
// start. Falls back to ended==started when wall_seconds is absent.
export function reconstructRunTimestamps(
  endedAtMs: number,
  wallSeconds: number | undefined,
): { startedAt: Date; endedAt: Date } {
  const endedAt = new Date(endedAtMs);
  const startedAt =
    wallSeconds && wallSeconds > 0 ? new Date(endedAtMs - Math.round(wallSeconds * 1000)) : endedAt;
  return { startedAt, endedAt };
}
