// Per-player accuracy summary for the review board's analysisSummary slot (P3.5),
// matching lichess's analyse ACC block: per player, a stacked count · label list
// (inaccuracies / mistakes / blunders / ACPL / accuracy) with the judgment counts
// coloured like the move-list glyphs. Anonymous games have no names, so sides are
// labelled Red / Black.
import './analysis-summary.css';
import type { GameAnalysis, PlayerAnalysis } from './game-analysis.js';

/** Optional real player names; fall back to the side colors for anonymous games. */
export type AnalysisSummaryLabels = { red?: string; black?: string };

export type AnalysisSummaryOptions = {
  /** Label for the accuracy row. Chance/hidden-info variants pass 'Non-reveal accuracy' so it
   *  reads as distinct from the separate reveal-decision accuracy. Defaults to 'Accuracy'. */
  accuracyLabel?: string;
};

export function createAnalysisSummary(
  analysis: GameAnalysis,
  labels?: AnalysisSummaryLabels,
  options?: AnalysisSummaryOptions,
): HTMLElement {
  const el = document.createElement('section');
  el.className = 'analysis-summary';
  const accuracyLabel = options?.accuracyLabel ?? 'Accuracy';
  el.append(
    playerBlock(labels?.red || 'Red', 'analysis-summary__dot--red', analysis.red, accuracyLabel),
  );
  el.append(
    playerBlock(
      labels?.black || 'Black',
      'analysis-summary__dot--black',
      analysis.black,
      accuracyLabel,
    ),
  );
  return el;
}

function playerBlock(
  label: string,
  dotClass: string,
  player: PlayerAnalysis,
  accuracyLabel: string,
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'analysis-summary__player';

  const head = document.createElement('div');
  head.className = 'analysis-summary__head';
  const dot = document.createElement('span');
  dot.className = `analysis-summary__dot ${dotClass}`;
  const name = document.createElement('span');
  name.className = 'analysis-summary__name';
  name.textContent = label;
  head.append(dot, name);

  const stats = document.createElement('div');
  stats.className = 'analysis-summary__stats';
  stats.append(
    statRow(
      String(player.inaccuracies),
      plural(player.inaccuracies, 'Inaccuracy', 'Inaccuracies'),
      player.inaccuracies > 0 ? 'inaccuracy' : null,
    ),
    statRow(
      String(player.mistakes),
      plural(player.mistakes, 'Mistake', 'Mistakes'),
      player.mistakes > 0 ? 'mistake' : null,
    ),
    statRow(
      String(player.blunders),
      plural(player.blunders, 'Blunder', 'Blunders'),
      player.blunders > 0 ? 'blunder' : null,
    ),
    statRow(String(player.acpl), 'Average centipawn loss', null),
    statRow(`${Math.round(player.accuracy)}%`, accuracyLabel, null),
  );

  block.append(head, stats);
  return block;
}

function statRow(value: string, label: string, judgment: string | null): HTMLElement {
  const row = document.createElement('div');
  row.className = 'analysis-summary__stat';
  if (judgment) row.classList.add(`analysis-summary__stat--${judgment}`);
  const num = document.createElement('strong');
  num.className = 'analysis-summary__stat-value';
  num.textContent = value;
  const text = document.createElement('span');
  text.className = 'analysis-summary__stat-label';
  text.textContent = label;
  row.append(num, text);
  return row;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
