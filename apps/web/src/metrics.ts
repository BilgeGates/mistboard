// /stats (public) and /metrics (admin) share this module, the way coach.ts
// serves both the directory and a detail view. Public shows aggregate games,
// activity, mode + variant splits. Admin adds the player (account) count and its
// recent growth, the result split, and the live in-play/online figures. Admin
// data comes from /api/stats, which 401s for non-admins (open in local dev);
// the page is otherwise unlinked, so it is direct-URL only like /database.

import './metrics.css';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav, buildNotice } from './site-shell.js';
import {
  type ActivitySeries,
  buildInteractiveActivityChart,
  formatStatNumber,
  type PublicSiteStats,
  type PublicStatsMode,
} from './stats-charts.js';

// The curated set of live variants shown on the public /stats surface, in
// canonical order (game-specs.ts CANONICAL_VARIANT_ORDER, open/flip/fog bands),
// minus the parked/retired ids. This is the product's "home of Chinese chess +
// variants" shelf, so retired experiments (mini/drop, dark-shogi, luzhanqi) and
// hidden chess variants stay off the public breakdown and chart filter. Admin
// /metrics still shows the full diagnostic list.
const STATS_VARIANTS: readonly string[] = [
  'xiangqi',
  'banqi',
  'jungle',
  'jungle-flip',
  'fortress-xiangqi',
  'jieqi',
  'dark-xiangqi',
  'dark-chess',
];

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
        buildInteractiveActivityChart(buildActivitySeries(publicStats, locale), locale),
      ),
    );
  }

  // Variant split, narrowed to the curated live shelf (STATS_VARIANTS) on both
  // views. Admin counts every game (all modes) from /api/stats; public has the
  // completed pvp/pve breakdown from /api/stats/public.
  const variantEntries = (
    admin
      ? sortedEntries(admin.gamesByVariant).map((e) => ({ variant: e.label, count: e.count }))
      : (publicStats?.variantTotals ?? [])
  )
    .filter((v) => STATS_VARIANTS.includes(v.variant))
    .map((v) => ({ label: v.variant, count: v.count }));
  if (variantEntries.length > 0) {
    parts.push(
      buildBreakdownSection(
        'Games by variant',
        variantEntries.map((entry) => ({
          label: variantPublicName(entry.label, locale),
          count: entry.count,
        })),
      ),
    );
  }

  if (publicStats) {
    // Bot-vs-bot (EvE) is an admin-only figure: hide it from the public page.
    parts.push(
      buildBreakdownSection('Games by mode', modeEntries(publicStats.modeTotals, admin != null)),
    );
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
function buildChartSection(title: string, chart: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metrics-section metrics-chart-section';
  section.append(sectionHeading(title));
  section.append(chart);
  return section;
}

// "All games" (the true cumulative total, matching the headline) plus one
// cumulative series per curated live variant that has games, in canonical order.
function buildActivitySeries(publicStats: PublicSiteStats, locale: Locale): ActivitySeries[] {
  const all: ActivitySeries = {
    key: '__all',
    label: 'All games',
    days: publicStats.dailyCompletedGames,
  };
  const byVariant = new Map((publicStats.variantDaily ?? []).map((v) => [v.variant, v]));
  const variantSeries: ActivitySeries[] = [];
  for (const id of STATS_VARIANTS) {
    const series = byVariant.get(id);
    if (series && series.total > 0) {
      variantSeries.push({
        key: id,
        label: variantPublicName(id, locale),
        days: series.days,
      });
    }
  }
  return [all, ...variantSeries];
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
function modeEntries(
  modeTotals: Record<PublicStatsMode, number>,
  includeBotVsBot: boolean,
): BreakdownEntry[] {
  const labels: Record<PublicStatsMode, string> = {
    pvp: 'Human vs human',
    pve: 'Human vs bot',
    eve: 'Bot vs bot',
  };
  const modes: PublicStatsMode[] = includeBotVsBot ? ['pvp', 'pve', 'eve'] : ['pvp', 'pve'];
  return modes
    .map((mode) => ({ label: labels[mode], count: modeTotals[mode] ?? 0 }))
    .filter((entry) => entry.count > 0);
}

function sortedEntries(record: Record<string, number>): BreakdownEntry[] {
  return Object.entries(record)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Public-facing variant names, keyed by the persisted games.variant id (which
// equals the game-spec id). The canonical source is the lobby's exhaustive
// switch in landing-play.ts (variantNameKeyForGameSpec); this display-only map
// mirrors it with a safe prettify fallback, so an unmapped/new id degrades
// gracefully instead of throwing.
const VARIANT_NAME_KEYS: Record<string, I18nKey> = {
  xiangqi: 'variant.xiangqi.name',
  'dark-xiangqi': 'variant.darkXiangqi.name',
  'dark-chess': 'variant.darkChess.name',
  'fortress-xiangqi': 'variant.fortressXiangqi.name',
  jieqi: 'variant.jieqi.name',
  banqi: 'variant.banqi.name',
  jungle: 'variant.jungle.name',
  'jungle-flip': 'variant.jungleFlip.name',
  'mini-xiangqi': 'variant.miniXiangqi.name',
  'dark-mini-xiangqi': 'variant.darkMiniXiangqi.name',
  'drop-mini-xiangqi': 'variant.dropMiniXiangqi.name',
};

function variantPublicName(variant: string, locale: Locale): string {
  const key = VARIANT_NAME_KEYS[variant];
  if (key) return t(key, {}, locale);
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
  if (known[result]) return known[result];
  return result
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
