// Homepage activity box: live presence from /api/live-stats plus durable game
// totals from /api/stats/public. The frame renders synchronously with skeleton
// rows so the left rail reserves the box's footprint from first paint (same
// pattern as the forum preview); the rows hydrate in place when the data lands.
// Either source can be missing (stats/public needs persistence; live-stats
// needs the API up): rows render only for data we actually have, and the box
// removes itself only in the rare case both fetches fail.
import { buildSiteBox } from './site-box.js';

type LiveStats = { playing: number; online: number };
type PublicStats = { totalCompletedGames: number; last30dCompletedGames: number };

export function buildLandingActivity(options: { hydrate?: boolean } = {}): HTMLElement {
  const { box, body } = buildSiteBox({ title: 'Activity', className: 'landing-activity' });
  // Four placeholder rows = the usual shape (2 live + 2 totals). Same markup as
  // the real rows so the reserved height matches to the pixel.
  body.append(statRow('–', ''), statRow('–', ''), statRow('–', ''), statRow('–', ''));
  if (options.hydrate !== false) void hydrateLandingActivity(box, body);
  return box;
}

async function hydrateLandingActivity(box: HTMLElement, body: HTMLElement): Promise<void> {
  const [live, totals] = await Promise.all([fetchLiveStats(), fetchPublicStats()]);
  if (!live && !totals) {
    box.remove();
    return;
  }

  const rows: HTMLElement[] = [];
  if (live) {
    rows.push(
      statRow(formatCount(live.playing), live.playing === 1 ? 'game in play' : 'games in play'),
      statRow(formatCount(live.online), live.online === 1 ? 'player online' : 'players online'),
    );
  }
  if (totals) {
    rows.push(
      statRow(formatCount(totals.last30dCompletedGames), 'games this month'),
      statRow(formatCount(totals.totalCompletedGames), 'games played'),
    );
  }
  body.replaceChildren(...rows);
}

function statRow(value: string, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row landing-activity-row';
  const valueEl = document.createElement('strong');
  valueEl.className = 'landing-activity-value';
  valueEl.textContent = value;
  const labelEl = document.createElement('span');
  labelEl.className = 'site-box-row-label';
  // Keep empty skeleton labels from collapsing the row's line box.
  labelEl.textContent = label || ' ';
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
