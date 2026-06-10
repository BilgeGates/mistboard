// Homepage activity box: live presence from /api/live-stats plus durable game
// totals from /api/stats/public, in the shared site-box shell. Either source
// can be missing (stats/public needs persistence; live-stats needs the API up):
// rows render only for data we actually have, and the box stays out of the DOM
// entirely when both fetches fail.
import { buildSiteBox } from './site-box.js';

type LiveStats = { playing: number; online: number };
type PublicStats = { totalCompletedGames: number; last30dCompletedGames: number };

export async function buildLandingActivity(): Promise<HTMLElement | null> {
  const [live, totals] = await Promise.all([fetchLiveStats(), fetchPublicStats()]);
  if (!live && !totals) return null;

  const { box, body } = buildSiteBox({ title: 'Activity', className: 'landing-activity' });

  if (live) {
    body.append(
      statRow(formatCount(live.playing), live.playing === 1 ? 'game in play' : 'games in play'),
      statRow(formatCount(live.online), live.online === 1 ? 'player online' : 'players online'),
    );
  }
  if (totals) {
    body.append(
      statRow(formatCount(totals.last30dCompletedGames), 'games this month'),
      statRow(formatCount(totals.totalCompletedGames), 'games played'),
    );
  }

  return box;
}

function statRow(value: string, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row landing-activity-row';
  const valueEl = document.createElement('strong');
  valueEl.className = 'landing-activity-value';
  valueEl.textContent = value;
  const labelEl = document.createElement('span');
  labelEl.className = 'site-box-row-label';
  labelEl.textContent = label;
  row.append(valueEl, labelEl);
  return row;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

async function fetchLiveStats(): Promise<LiveStats | null> {
  try {
    const resp = await fetch('/api/live-stats');
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<LiveStats>;
    if (typeof data.playing !== 'number' || typeof data.online !== 'number') return null;
    return { playing: data.playing, online: data.online };
  } catch {
    return null;
  }
}

async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const resp = await fetch('/api/stats/public');
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<PublicStats>;
    if (
      typeof data.totalCompletedGames !== 'number' ||
      typeof data.last30dCompletedGames !== 'number'
    ) {
      return null;
    }
    return {
      totalCompletedGames: data.totalCompletedGames,
      last30dCompletedGames: data.last30dCompletedGames,
    };
  } catch {
    return null;
  }
}
