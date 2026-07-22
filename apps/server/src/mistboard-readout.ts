import { createHash } from 'node:crypto';
import type { ElephantChessPuzzleQualityReport } from './elephantchess-puzzle-quality-report.js';

export const MISTBOARD_READOUT_SCHEMA_VERSION = 1 as const;
export const ELEPHANTCHESS_PILOT_RUN_ID = 'xqpmr_dae53626bf845f80a72aa671';
export const ELEPHANTCHESS_QUALITY_ISSUE = 156;

export type MistboardReadoutTrigger = 'daily' | 'weekly' | 'manual';
export type MistboardReadoutVerdict = 'healthy' | 'watch' | 'action' | 'blocked' | 'unknown';
export type MistboardReadoutActionSeverity = 'watch' | 'action' | 'blocked';

export type MistboardReadoutAction = {
  code: string;
  severity: MistboardReadoutActionSeverity;
  dedupeKey: string;
  ownerIssue: number | null;
  text: string;
};

export type MistboardReadoutProduct = {
  accountsCreated: number;
  previousAccountsCreated: number;
  completedGames: number;
  previousCompletedGames: number;
  completedGamesByMode: Record<string, number>;
  completedGamesByVariant: Array<{ variant: string; count: number }>;
};

export type MistboardReadoutMining = {
  runId: string;
  status: string;
  selectedGames: number;
  shards: Record<string, number>;
  remainingGames: number;
  candidates: Record<string, number>;
  staleLeases: number;
};

export type MistboardReadoutEngines = {
  tasks: Record<string, number>;
  failedTasks: number;
  staleWorkers: number;
  activeWorkers: number;
};

export type MistboardReadoutCollectorError = {
  section: 'product' | 'puzzles' | 'mining' | 'engines';
  code: 'collector_failed';
};

export type MistboardReadoutV1 = {
  kind: 'mistboard-readout';
  schemaVersion: typeof MISTBOARD_READOUT_SCHEMA_VERSION;
  snapshotId: string;
  snapshotKey: string | null;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  trigger: MistboardReadoutTrigger;
  verdict: MistboardReadoutVerdict;
  production: {
    revision: string | null;
    activeGames: number;
    databaseRequired: boolean;
    persistence: 'enabled' | 'disabled';
    persistenceErrors: { count1m: number; lastAt: number | null };
  };
  product: MistboardReadoutProduct | null;
  puzzles: ElephantChessPuzzleQualityReport | null;
  mining: MistboardReadoutMining | null;
  engines: MistboardReadoutEngines | null;
  actions: MistboardReadoutAction[];
  collectorErrors: MistboardReadoutCollectorError[];
  decisionFingerprint: string;
};

export type MistboardReadoutFacts = {
  product: MistboardReadoutProduct | null;
  puzzles: ElephantChessPuzzleQualityReport | null;
  mining: MistboardReadoutMining | null;
  engines: MistboardReadoutEngines | null;
  collectorErrors?: MistboardReadoutCollectorError[];
};

export type MistboardReadoutRuntime = MistboardReadoutV1['production'];

const DAY_MS = 24 * 60 * 60 * 1_000;

export function readoutPeriods(now: Date): {
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart: Date;
} {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = new Date(periodEnd.getTime() - 7 * DAY_MS);
  const previousPeriodStart = new Date(periodStart.getTime() - 7 * DAY_MS);
  return { periodStart, periodEnd, previousPeriodStart };
}

export function scheduledReadoutTrigger(now: Date): Exclude<MistboardReadoutTrigger, 'manual'> {
  return now.getUTCDay() === 1 ? 'weekly' : 'daily';
}

export function readoutSnapshotKey(trigger: MistboardReadoutTrigger, now: Date): string | null {
  const date = now.toISOString().slice(0, 10);
  if (trigger === 'daily') return `readout:v1:daily:${date}`;
  if (trigger === 'weekly') return `readout:v1:weekly:${isoWeekKey(now)}`;
  return null;
}

export function buildMistboardReadout(input: {
  snapshotId: string;
  trigger: MistboardReadoutTrigger;
  now: Date;
  runtime: MistboardReadoutRuntime;
  facts: MistboardReadoutFacts;
  previousReport?: MistboardReadoutV1 | null;
}): MistboardReadoutV1 {
  const periods = readoutPeriods(input.now);
  const collectorErrors = [...(input.facts.collectorErrors ?? [])].sort((a, b) =>
    a.section.localeCompare(b.section),
  );
  const actions = buildActions(input.facts, input.previousReport ?? null).sort((a, b) =>
    a.dedupeKey.localeCompare(b.dedupeKey),
  );
  const verdict = readoutVerdict(actions, collectorErrors, input.runtime);
  const reportWithoutFingerprint = {
    kind: 'mistboard-readout' as const,
    schemaVersion: MISTBOARD_READOUT_SCHEMA_VERSION,
    snapshotId: input.snapshotId,
    snapshotKey: readoutSnapshotKey(input.trigger, input.now),
    generatedAt: input.now.toISOString(),
    periodStart: periods.periodStart.toISOString(),
    periodEnd: periods.periodEnd.toISOString(),
    previousPeriodStart: periods.previousPeriodStart.toISOString(),
    trigger: input.trigger,
    verdict,
    production: input.runtime,
    product: input.facts.product,
    puzzles: input.facts.puzzles,
    mining: input.facts.mining,
    engines: input.facts.engines,
    actions,
    collectorErrors,
  };
  return {
    ...reportWithoutFingerprint,
    decisionFingerprint: decisionFingerprint(reportWithoutFingerprint),
  };
}

function buildActions(
  facts: MistboardReadoutFacts,
  previousReport: MistboardReadoutV1 | null,
): MistboardReadoutAction[] {
  const actions: MistboardReadoutAction[] = [];
  const quality = facts.puzzles;
  if (quality?.checkpoint.plumbing === 'ready') {
    actions.push({
      code: 'puzzle-plumbing-ready',
      severity: 'watch',
      dedupeKey: 'puzzle-plumbing-ready:elephantchess-pilot-v1',
      ownerIssue: ELEPHANTCHESS_QUALITY_ISSUE,
      text: 'ElephantChess puzzle telemetry crossed 100 sessions. Verify the funnel, then keep collecting.',
    });
  }
  if (quality?.checkpoint.meaningful === 'ready') {
    actions.push({
      code: 'puzzle-quality-gate-ready',
      severity: 'action',
      dedupeKey: 'puzzle-quality-gate-ready:elephantchess-pilot-v1',
      ownerIssue: ELEPHANTCHESS_QUALITY_ISSUE,
      text: 'ElephantChess puzzle quality crossed 1,000 meaningful starts. Review the gate before expanding the corpus.',
    });
  }
  if (quality && quality.outliers.length > 0) {
    const outlierFingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          quality.outliers.map((outlier) => ({
            puzzleId: outlier.puzzleId,
            flags: [...outlier.flags].sort(),
          })),
        ),
      )
      .digest('hex')
      .slice(0, 16);
    actions.push({
      code: 'puzzle-outlier-set-changed',
      severity: 'action',
      dedupeKey: `puzzle-outliers:${outlierFingerprint}`,
      ownerIssue: ELEPHANTCHESS_QUALITY_ISSUE,
      text: `${quality.outliers.length} sample-qualified ElephantChess puzzle outlier${quality.outliers.length === 1 ? '' : 's'} need review.`,
    });
  } else if (quality) {
    const previousOutliers = previousReport?.actions.find(
      (action) => action.code === 'puzzle-outlier-set-changed',
    );
    if (previousOutliers) {
      actions.push({
        code: 'puzzle-outliers-resolved',
        severity: 'watch',
        dedupeKey: `puzzle-outliers-resolved:${previousOutliers.dedupeKey.split(':').at(-1)}`,
        ownerIssue: ELEPHANTCHESS_QUALITY_ISSUE,
        text: 'The previously qualified ElephantChess puzzle outlier set has cleared.',
      });
    }
  }
  return actions;
}

function readoutVerdict(
  actions: readonly MistboardReadoutAction[],
  errors: readonly MistboardReadoutCollectorError[],
  runtime: MistboardReadoutRuntime,
): MistboardReadoutVerdict {
  if (
    errors.length > 0 ||
    (runtime.databaseRequired && runtime.persistence !== 'enabled') ||
    runtime.persistenceErrors.count1m > 0
  ) {
    return 'unknown';
  }
  if (actions.some((action) => action.severity === 'blocked')) return 'blocked';
  if (actions.some((action) => action.severity === 'action')) return 'action';
  if (actions.some((action) => action.severity === 'watch')) return 'watch';
  return 'healthy';
}

function decisionFingerprint(report: Omit<MistboardReadoutV1, 'decisionFingerprint'>): string {
  const normalized = {
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    production: report.production,
    product: report.product,
    puzzles: report.puzzles
      ? {
          checkpoint: report.puzzles.checkpoint,
          pilot: report.puzzles.pilot,
          baseline: report.puzzles.baseline,
          outliers: report.puzzles.outliers,
          recommendation: report.puzzles.recommendation,
        }
      : null,
    mining: report.mining,
    engines: report.engines,
    actions: report.actions,
    collectorErrors: report.collectorErrors,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function isoWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function renderMistboardReadoutMarkdown(report: MistboardReadoutV1): string {
  const lines = [
    `# Mistboard Readout - ${report.generatedAt.slice(0, 10)}`,
    '',
    `**Verdict:** ${report.verdict.toUpperCase()}`,
    '',
    '## Actions',
    '',
  ];
  if (report.actions.length === 0) lines.push('No action needed.');
  else {
    report.actions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action.text}`);
    });
  }

  lines.push('', '## Product', '');
  if (!report.product) lines.push('Product activity unavailable.');
  else {
    lines.push(
      `- Completed games: ${report.product.completedGames} (${signedDelta(report.product.completedGames - report.product.previousCompletedGames)} week over week)`,
      `- New accounts: ${report.product.accountsCreated} (${signedDelta(report.product.accountsCreated - report.product.previousAccountsCreated)} week over week)`,
    );
  }

  lines.push('', '## Puzzles', '');
  if (!report.puzzles) lines.push('Puzzle quality unavailable.');
  else {
    lines.push(
      `- ElephantChess pilot: ${report.puzzles.pilot.sessions} sessions, ${report.puzzles.pilot.starts} starts`,
      `- Checkpoints: ${report.puzzles.checkpoint.sessionsRemaining} sessions to plumbing, ${report.puzzles.checkpoint.startsRemaining} starts to quality gate`,
      `- Quality: ${report.puzzles.outliers.length} sample-qualified outliers, recommendation \`${report.puzzles.recommendation}\``,
    );
  }

  lines.push('', '## Operations', '');
  lines.push(
    `- Production revision: \`${report.production.revision ?? 'unknown'}\`; active games: ${report.production.activeGames}`,
  );
  if (!report.mining) lines.push('- Mining status unavailable.');
  else {
    lines.push(
      `- Mining: ${report.mining.status}; ${report.mining.candidates.published ?? 0} published; ${report.mining.remainingGames} games remaining`,
    );
  }
  if (!report.engines) lines.push('- Engine status unavailable.');
  else if (
    Object.values(report.engines.tasks).reduce((sum, count) => sum + count, 0) === 0 &&
    report.engines.activeWorkers === 0
  ) {
    lines.push('- Engines: idle, no queued work.');
  } else {
    lines.push(
      `- Engines: ${report.engines.activeWorkers} active workers, ${report.engines.failedTasks} failed tasks, ${report.engines.staleWorkers} stale workers`,
    );
  }
  if (report.collectorErrors.length > 0) {
    lines.push(
      `- Unknown sections: ${report.collectorErrors.map((error) => error.section).join(', ')}`,
    );
  }
  lines.push('', `<!-- mistboard-readout-snapshot:${report.snapshotId} -->`, '');
  return lines.join('\n');
}

function signedDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
