import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Color, GameEvent } from '@mistboard/game';
import { engineDir } from './engine-paths.js';
import type { GameDebugArtifactSummary } from './persistence.js';

type DecisionRecord = {
  ply: number;
  color: Color;
  chosen_move: string;
  profile?: string;
  telemetry?: {
    beliefSize?: number;
    iters?: number;
    moveRanking?: Array<[string, number]>;
  };
};

export type DevArtifact = {
  id: number;
  gameId: string;
  ply: number;
  engineColor: Color;
  artifactType: 'belief-snapshot' | 'trace-row';
  payload: Record<string, unknown>;
  createdAt: string;
};

function logPath(roomId: string): string {
  const dir = process.env.FOW_DECISION_LOG_DIR ?? join(engineDir(), 'lab', 'decision_log');
  return join(dir, `${roomId}.jsonl`);
}

export function decisionLogAvailable(roomId: string): boolean {
  try {
    return existsSync(logPath(roomId));
  } catch {
    return false;
  }
}

function readLog(roomId: string): DecisionRecord[] {
  const records = readFileSync(logPath(roomId), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DecisionRecord);
  records.sort((left, right) => left.ply - right.ply);
  return records;
}

function enginePlies(events: GameEvent[], engineColor: Color): number[] {
  const plies: number[] = [];
  let ply = 0;
  for (const event of events) {
    if (event.type !== 'move-played') continue;
    ply += 1;
    const mover: Color = ply % 2 === 1 ? 'white' : 'black';
    if (mover === engineColor) plies.push(ply);
  }
  return plies;
}

function buildArtifacts(
  roomId: string,
  events: GameEvent[],
): { engineColor: Color; artifacts: DevArtifact[] } | null {
  const records = readLog(roomId);
  if (records.length === 0) return null;
  const engineColor = records[0]!.color;
  const plies = enginePlies(events, engineColor);
  const artifacts: DevArtifact[] = [];
  let id = 1;

  records.forEach((record, index) => {
    const ply = plies[index] ?? record.ply;
    const telemetry = record.telemetry ?? {};
    const ranking = telemetry.moveRanking ?? [];
    const particles = telemetry.beliefSize ?? 0;
    const path = record.profile ?? 'live-pve';

    artifacts.push({
      id: id++,
      gameId: roomId,
      ply,
      engineColor,
      artifactType: 'belief-snapshot',
      createdAt: new Date(0).toISOString(),
      payload: {
        tier1_side: engineColor,
        tier1_seat: engineColor,
        ply,
        snapshot_kind: 'decision',
        decision_path: path,
        particle_count: particles,
        particle_count_unique: particles,
        opp_remaining_counts: {},
        marginal_field: {},
        top_k_clusters: [],
        move_chosen_uci: record.chosen_move,
      },
    });
    artifacts.push({
      id: id++,
      gameId: roomId,
      ply,
      engineColor,
      artifactType: 'trace-row',
      createdAt: new Date(0).toISOString(),
      payload: {
        tier1_side: engineColor,
        tier1_seat: engineColor,
        ply,
        decision_path: path,
        move_chosen_uci: record.chosen_move,
        particle_count_pre_sample: particles,
        belief_unique_count: particles,
        iters: telemetry.iters ?? null,
        top_k_scores: ranking
          .slice(0, 8)
          .map(([uci, ev]) => ({ uci, score: Math.round(ev * 100), support: undefined })),
      },
    });
  });

  return { engineColor, artifacts };
}

function summaryFor(
  artifactType: DevArtifact['artifactType'],
  artifacts: DevArtifact[],
  engineColor: Color,
): GameDebugArtifactSummary {
  const matching = artifacts.filter((artifact) => artifact.artifactType === artifactType);
  const plies = matching.map((artifact) => artifact.ply);
  return {
    artifactType,
    count: matching.length,
    engineColors: [engineColor],
    minPly: plies.length > 0 ? Math.min(...plies) : null,
    maxPly: plies.length > 0 ? Math.max(...plies) : null,
    snapshotKinds: artifactType === 'belief-snapshot' ? ['decision'] : [],
  };
}

export function devArtifactSummaries(
  roomId: string,
  events: GameEvent[],
): { summaries: GameDebugArtifactSummary[]; engineColors: Color[] } | null {
  const built = buildArtifacts(roomId, events);
  if (!built) return null;
  return {
    engineColors: [built.engineColor],
    summaries: [
      summaryFor('belief-snapshot', built.artifacts, built.engineColor),
      summaryFor('trace-row', built.artifacts, built.engineColor),
    ],
  };
}

export function devArtifactPayloads(
  roomId: string,
  events: GameEvent[],
  artifactType: string,
  color: Color | null,
): DevArtifact[] | null {
  const built = buildArtifacts(roomId, events);
  if (!built) return null;
  return built.artifacts.filter(
    (artifact) =>
      artifact.artifactType === artifactType && (!color || artifact.engineColor === color),
  );
}
