/**
 * Bot-match series runner + CLI.
 *
 * Plays N games between two engines reached over HTTP (the redacted protocol),
 * alternating colors each game for fairness, and reports a win/draw/forfeit
 * tally. This is the harness for the local self-test (live Misty v1.5 vs
 * stand-in Misty v1.1) and, by swapping one endpoint, the real external match.
 *
 * CLI:
 *   tsx src/bot-match/run-match.ts \
 *     --live-url  http://127.0.0.1:7801 --live-token  A --live-engine  python-v2-v1.5 \
 *     --threep-url http://127.0.0.1:7802 --threep-token B --threep-engine python-v2-v1.1 \
 *     --games 20 --time-control 180+2 --max-plies 200
 */
import { fileURLToPath } from 'node:url';
import { parseEngineTimeControl } from '../engine-time-policy.js';
import type { EngineTimePolicy } from '../fow-engine-budget.js';
import {
  type EngineEndpoint,
  releaseEngineReservationAt,
  requestEngineReservationAt,
} from '../internal-engine-client.js';
import { type ArbiterResult, runArbiterGame } from './arbiter.js';
import { httpMoveProvider } from './http-move-provider.js';

export type SeriesEngine = {
  label: string;
  engineId: string;
  endpoint: EngineEndpoint;
};

export type SeriesConfig = {
  a: SeriesEngine;
  b: SeriesEngine;
  games: number;
  engineSecret: string;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  /** Per-move budget policy (see fow-engine-budget.ts). Defaults to arbiter's 'self-managed'. */
  timePolicy?: EngineTimePolicy;
  maxPlies?: number;
  /** Per-move think budget when untimed (ms). */
  untimedBudgetMs?: number;
  /** Hard per-move deadline when untimed (ms) — widen for cold engine starts. */
  untimedWatchdogMs?: number;
  gameIdPrefix?: string;
  startedAtMs?: number;
  /**
   * Acquire an engine-worker reservation per seat per game (required by the
   * real engine-worker; not needed for the reference bot). Released after each
   * game so only two seats are ever live at once.
   */
  manageReservations?: boolean;
  onGameEnd?: (
    index: number,
    result: ArbiterResult,
    whiteLabel: string,
    blackLabel: string,
  ) => void;
  /** Per-move observer (forwarded to the arbiter) — e.g. to tally decision sources. */
  onMove?: (info: {
    ply: number;
    color: 'white' | 'black';
    engineId: string;
    thinkTimeMs: number;
    diagnostics?: Record<string, unknown>;
  }) => void;
};

export type SeriesReport = {
  games: number;
  wins: Record<string, number>;
  draws: number;
  forfeits: number;
  clockLosses: number;
  results: ArbiterResult[];
};

const FORFEIT_OUTCOMES = new Set(['illegal-move-forfeit', 'provider-error-forfeit']);

export async function runBotMatchSeries(cfg: SeriesConfig): Promise<SeriesReport> {
  const report: SeriesReport = {
    games: 0,
    wins: { [cfg.a.label]: 0, [cfg.b.label]: 0 },
    draws: 0,
    forfeits: 0,
    clockLosses: 0,
    results: [],
  };
  const prefix = cfg.gameIdPrefix ?? 'botmatch';

  for (let i = 0; i < cfg.games; i++) {
    // Alternate colors so each engine plays white and black equally.
    const white = i % 2 === 0 ? cfg.a : cfg.b;
    const black = i % 2 === 0 ? cfg.b : cfg.a;

    let whiteReservation: string | undefined;
    let blackReservation: string | undefined;
    if (cfg.manageReservations) {
      whiteReservation = (
        await requestEngineReservationAt(white.endpoint, {
          color: 'white',
          engineId: white.engineId,
        })
      ).reservationId;
      blackReservation = (
        await requestEngineReservationAt(black.endpoint, {
          color: 'black',
          engineId: black.engineId,
        })
      ).reservationId;
    }

    let result: ArbiterResult;
    try {
      result = await runArbiterGame({
        gameId: `${prefix}-${i}`,
        engineSecret: cfg.engineSecret,
        timeControl: cfg.timeControl ?? null,
        timePolicy: cfg.timePolicy,
        maxPlies: cfg.maxPlies,
        untimedBudgetMs: cfg.untimedBudgetMs,
        untimedWatchdogMs: cfg.untimedWatchdogMs,
        startedAtMs: cfg.startedAtMs,
        white: {
          engineId: white.engineId,
          provider: httpMoveProvider(white.endpoint, { reservationId: whiteReservation }),
        },
        black: {
          engineId: black.engineId,
          provider: httpMoveProvider(black.endpoint, { reservationId: blackReservation }),
        },
        onMove: cfg.onMove
          ? (info) =>
              cfg.onMove?.({
                ply: info.ply,
                color: info.color,
                engineId: info.engineId,
                thinkTimeMs: info.thinkTimeMs,
                diagnostics: info.diagnostics as Record<string, unknown> | undefined,
              })
          : undefined,
      });
    } finally {
      if (whiteReservation) {
        await releaseEngineReservationAt(white.endpoint, whiteReservation, 'game-ended').catch(
          () => {},
        );
      }
      if (blackReservation) {
        await releaseEngineReservationAt(black.endpoint, blackReservation, 'game-ended').catch(
          () => {},
        );
      }
    }

    report.games += 1;
    report.results.push(result);
    if (result.winner === 'white') report.wins[white.label] = (report.wins[white.label] ?? 0) + 1;
    else if (result.winner === 'black')
      report.wins[black.label] = (report.wins[black.label] ?? 0) + 1;
    else report.draws += 1;
    if (FORFEIT_OUTCOMES.has(result.outcome)) report.forfeits += 1;
    if (result.outcome === 'clock-expired') report.clockLosses += 1;

    cfg.onGameEnd?.(i, result, white.label, black.label);
  }
  return report;
}

// ---- CLI ----

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const req = (flag: string): string => {
    const v = argOf(args, flag);
    if (v === undefined) throw new Error(`missing required flag ${flag}`);
    return v;
  };

  const engineSecret = process.env.MISTBOARD_ENGINE_SECRET ?? argOf(args, '--engine-secret');
  if (!engineSecret) {
    throw new Error(
      'set MISTBOARD_ENGINE_SECRET (recommended: the prod value for live-identical play) or pass --engine-secret',
    );
  }

  const tc = parseEngineTimeControl(argOf(args, '--time-control') ?? 'none');
  const timeControl =
    tc.kind === 'standard'
      ? {
          initialMs: Math.round(tc.initial_seconds * 1000),
          incrementMs: Math.round(tc.increment_seconds * 1000),
        }
      : null;

  const a: SeriesEngine = {
    label: req('--live-engine'),
    engineId: req('--live-engine'),
    endpoint: { baseUrl: req('--live-url'), token: req('--live-token') },
  };
  const b: SeriesEngine = {
    label: req('--threep-engine'),
    engineId: req('--threep-engine'),
    endpoint: { baseUrl: req('--threep-url'), token: req('--threep-token') },
  };
  const games = Number(argOf(args, '--games') ?? 10);
  const maxPlies = Number(argOf(args, '--max-plies') ?? 200);
  const timePolicy: EngineTimePolicy =
    argOf(args, '--time-policy') === 'live-cap' ? 'live-cap' : 'self-managed';

  // eslint-disable-next-line no-console
  const log = (msg: string) => console.log(msg);
  log(
    `bot-match: ${a.label} vs ${b.label}, ${games} games, tc=${timeControl ? `${timeControl.initialMs / 1000}+${timeControl.incrementMs / 1000}` : 'none'}`,
  );

  const report = await runBotMatchSeries({
    a,
    b,
    games,
    engineSecret,
    timeControl,
    timePolicy,
    maxPlies,
    manageReservations: true,
    onGameEnd: (i, r, whiteLabel, blackLabel) => {
      const winnerLabel =
        r.winner === 'white' ? whiteLabel : r.winner === 'black' ? blackLabel : 'draw';
      log(
        `  game ${i + 1}/${games}: ${whiteLabel}(W) vs ${blackLabel}(B) -> ${winnerLabel} [${r.outcome}, ${r.plyCount} plies]`,
      );
    },
  });

  log('');
  log('==== result ====');
  log(`${a.label}: ${report.wins[a.label] ?? 0} wins`);
  log(`${b.label}: ${report.wins[b.label] ?? 0} wins`);
  log(`draws: ${report.draws}  forfeits: ${report.forfeits}  clock-losses: ${report.clockLosses}`);
  const aWins = report.wins[a.label] ?? 0;
  const bWins = report.wins[b.label] ?? 0;
  const decided = aWins + bWins;
  if (decided > 0) {
    log(
      `${a.label} score: ${((aWins / report.games) * 100).toFixed(1)}%  (expected: stronger engine >> 50%)`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
