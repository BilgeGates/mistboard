// /stats (public) and /metrics (admin) share this module, the way coach.ts
// serves both the directory and a detail view. Public shows aggregate games,
// activity, mode + variant splits. Admin adds the player (account) count and its
// recent growth, the result split, and the live in-play/online figures. Admin
// data comes from /api/stats, which 401s for non-admins (open in local dev);
// the page is otherwise unlinked, so it is direct-URL only like /database.

import './metrics.css';
import { currentLocale } from './i18n/locale.js';
import { buildNav, buildNotice } from './site-shell.js';
import {
  buildActivityChart,
  formatStatNumber,
  type PublicSiteStats,
  type PublicStatsMode,
} from './stats-charts.js';

type LiveStats = { playing: number; online: number };

type AdminSiteStats = {
  accounts: number;
  accountsLast7d: number;
  accountsLast30d: number;
  games: number;
  publicGames: number;
  last7dGames: number;
  gamesByResult: Record<string, number>;
  gamesByVariant: Record<string, number>;
};

export async function mountMetrics(root: HTMLElement, options: { admin: boolean }): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'metrics-route');

  const shell = document.createElement('main');
  shell.className = 'site-section metrics-shell';
  root.append(buildNav(locale), shell);

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = options.admin ? 'Metrics' : 'Statistics';
  shell.append(heading);

  const body = document.createElement('div');
  body.className = 'metrics-body';
  body.setAttribute('aria-live', 'polite');
  body.textContent = 'Loading…';
  shell.append(body);

  const [publicStats, live, admin] = await Promise.all([
    fetchPublicStats(),
    fetchLiveStats(),
    options.admin ? fetchAdminStats() : Promise.resolve(null),
  ]);

  if (!publicStats && !admin) {
    body.replaceChildren(
      buildNotice('Statistics unavailable', 'Could not load statistics. Try again shortly.'),
    );
    return;
  }

  const parts: HTMLElement[] = [];
  parts.push(buildHeadlineCards(publicStats, live, admin));

  if (publicStats && publicStats.dailyCompletedGames.length > 0) {
    parts.push(
      buildChartSection(
        'Games over time',
        buildActivityChart(
          publicStats.dailyCompletedGames,
          `Cumulative games played: ${formatStatNumber(
            publicStats.dailyCompletedGames.at(-1)?.cumulativeGames ?? 0,
            locale,
          )}`,
          locale,
        ),
      ),
    );
  }

  // Variant split: the admin view has every game (all modes); the public view
  // has the completed pvp/pve breakdown from /api/stats/public.
  const variantEntries = admin
    ? sortedEntries(admin.gamesByVariant)
    : (publicStats?.variantTotals ?? []).map((v) => ({ label: v.variant, count: v.count }));
  if (variantEntries.length > 0) {
    parts.push(
      buildBreakdownSection(
        'Games by variant',
        variantEntries.map((entry) => ({ label: prettyVariant(entry.label), count: entry.count })),
      ),
    );
  }

  if (publicStats) {
    parts.push(buildBreakdownSection('Games by mode', modeEntries(publicStats.modeTotals)));
  }

  if (admin) {
    const resultEntries = sortedEntries(admin.gamesByResult).map((entry) => ({
      label: prettyResult(entry.label),
      count: entry.count,
    }));
    if (resultEntries.length > 0) {
      parts.push(buildBreakdownSection('Games by result', resultEntries));
    }
  }

  body.replaceChildren(...parts);
}

// ── headline number cards ────────────────────────────────────────────────────
function buildHeadlineCards(
  publicStats: PublicSiteStats | null,
  live: LiveStats | null,
  admin: AdminSiteStats | null,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'metrics-cards';

  if (admin) {
    grid.append(
      statCard('Players', admin.accounts, `+${formatStatNumber(admin.accountsLast30d)} this month`),
    );
  }
  if (publicStats) {
    grid.append(
      statCard(
        'Games played',
        publicStats.totalCompletedGames,
        `+${formatStatNumber(publicStats.last30dCompletedGames)} this month`,
      ),
      statCard('Public games', publicStats.publicGames),
    );
  }
  if (live) {
    grid.append(statCard('In play now', live.playing));
    if (admin) grid.append(statCard('Online now', live.online));
  }
  return grid;
}

function statCard(label: string, value: number, note?: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'metrics-card';
  const valueEl = document.createElement('strong');
  valueEl.className = 'metrics-card-value';
  valueEl.textContent = formatStatNumber(value);
  const labelEl = document.createElement('span');
  labelEl.className = 'metrics-card-label';
  labelEl.textContent = label;
  card.append(valueEl, labelEl);
  if (note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'metrics-card-note';
    noteEl.textContent = note;
    card.append(noteEl);
  }
  return card;
}

// ── sections ─────────────────────────────────────────────────────────────────
function buildChartSection(title: string, chart: SVGElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metrics-section';
  section.append(sectionHeading(title));
  const panel = document.createElement('div');
  panel.className = 'platform-activity-chart metrics-chart';
  panel.append(chart);
  section.append(panel);
  return section;
}

type BreakdownEntry = { label: string; count: number };

function buildBreakdownSection(title: string, entries: BreakdownEntry[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metrics-section';
  section.append(sectionHeading(title));

  const max = Math.max(...entries.map((entry) => entry.count), 1);
  const list = document.createElement('ul');
  list.className = 'metrics-breakdown';
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'metrics-breakdown-row';

    const label = document.createElement('span');
    label.className = 'metrics-breakdown-label';
    label.textContent = entry.label;

    const bar = document.createElement('span');
    bar.className = 'metrics-breakdown-bar';
    const fill = document.createElement('span');
    fill.className = 'metrics-breakdown-fill';
    fill.style.width = `${Math.round((entry.count / max) * 100)}%`;
    bar.append(fill);

    const value = document.createElement('strong');
    value.className = 'metrics-breakdown-value';
    value.textContent = formatStatNumber(entry.count);

    item.append(label, bar, value);
    list.append(item);
  }
  section.append(list);
  return section;
}

function sectionHeading(text: string): HTMLElement {
  const heading = document.createElement('h2');
  heading.className = 'about-subheading metrics-section-heading';
  heading.textContent = text;
  return heading;
}

// ── data ─────────────────────────────────────────────────────────────────────
function modeEntries(modeTotals: Record<PublicStatsMode, number>): BreakdownEntry[] {
  const labels: Record<PublicStatsMode, string> = {
    pvp: 'Human vs human',
    pve: 'Human vs bot',
    eve: 'Bot vs bot',
  };
  return (['pvp', 'pve', 'eve'] as const)
    .map((mode) => ({ label: labels[mode], count: modeTotals[mode] ?? 0 }))
    .filter((entry) => entry.count > 0);
}

function sortedEntries(record: Record<string, number>): BreakdownEntry[] {
  return Object.entries(record)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function prettyVariant(variant: string): string {
  return variant
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function prettyResult(result: string): string {
  const known: Record<string, string> = {
    'red-win': 'Red win',
    'red-wins': 'Red win',
    'black-win': 'Black win',
    'black-wins': 'Black win',
    'white-win': 'White win',
    'white-wins': 'White win',
    draw: 'Draw',
    // A null result (grouped under the "null" key) is a game with no recorded
    // outcome: still running, aborted, or abandoned.
    null: 'Unfinished',
    abandoned: 'Abandoned',
    aborted: 'Aborted',
  };
  return known[result] ?? prettyVariant(result);
}

async function fetchPublicStats(): Promise<PublicSiteStats | null> {
  try {
    const resp = await fetch('/api/stats/public', { credentials: 'same-origin' });
    if (!resp.ok) return null;
    return (await resp.json()) as PublicSiteStats;
  } catch {
    return null;
  }
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

async function fetchAdminStats(): Promise<AdminSiteStats | null> {
  try {
    const resp = await fetch('/api/stats', { credentials: 'same-origin' });
    if (!resp.ok) return null;
    return (await resp.json()) as AdminSiteStats;
  } catch {
    return null;
  }
}
