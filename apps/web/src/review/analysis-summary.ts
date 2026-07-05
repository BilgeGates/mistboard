// Per-player accuracy summary for the review board's analysisSummary slot (P3.5).
// Anonymous games have no names, so sides are labelled Red / Black.
import './analysis-summary.css';
import type { GameAnalysis, PlayerAnalysis } from './game-analysis.js';

export function createAnalysisSummary(analysis: GameAnalysis): HTMLElement {
  const el = document.createElement('section');
  el.className = 'analysis-summary';
  const title = document.createElement('p');
  title.className = 'analysis-summary__title';
  title.textContent = 'Analysis';
  el.append(title);

  el.append(playerRow('Red', 'analysis-summary__dot--red', analysis.red));
  el.append(playerRow('Black', 'analysis-summary__dot--black', analysis.black));
  return el;
}

function playerRow(label: string, dotClass: string, player: PlayerAnalysis): HTMLElement {
  const row = document.createElement('div');
  row.className = 'analysis-summary__player';

  const head = document.createElement('div');
  head.className = 'analysis-summary__head';
  const dot = document.createElement('span');
  dot.className = `analysis-summary__dot ${dotClass}`;
  const name = document.createElement('span');
  name.className = 'analysis-summary__name';
  name.textContent = label;
  const accuracy = document.createElement('strong');
  accuracy.className = 'analysis-summary__accuracy';
  accuracy.textContent = `${Math.round(player.accuracy)}%`;
  head.append(dot, name, accuracy);

  const detail = document.createElement('div');
  detail.className = 'analysis-summary__detail';
  detail.textContent = `${player.inaccuracies} inaccuracies · ${player.mistakes} mistakes · ${player.blunders} blunders · ACPL ${player.acpl}`;

  row.append(head, detail);
  return row;
}
