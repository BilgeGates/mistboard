import './app-base.css';
import './board-fog.css';
import './styles.css';
import { initializeAccountNav } from './account-nav.js';
import { setPostHogInstance } from './analytics.js';
import type { ArticleLang } from './article-i18n.js';
import { darkMiniXiangqiEnabled, darkXiangqiEnabled } from './feature-flags.js';
import { setRatedModeEnabled } from './rated-flag.js';
import { mountRestartBanner, setRestartBanner } from './restart-banner.js';
import { initializeThemeSettings } from './theme.js';

initializeThemeSettings();
initializeAccountNav();
mountRestartBanner();
void fetch('/api/server-status')
  .then((r) => (r.ok ? r.json() : null))
  .then((data: { restartAt: number | null; ratedEnabled?: boolean } | null) => {
    if (data && typeof data.restartAt === 'number') setRestartBanner(data.restartAt);
    if (data) setRatedModeEnabled(data.ratedEnabled === true);
  })
  .catch(() => {
    /* banner stays hidden; WS broadcast still covers in-game users */
  });

const phKey = import.meta.env.VITE_POSTHOG_KEY;
const phHost = import.meta.env.VITE_POSTHOG_HOST;
if (phKey && phHost && import.meta.env.PROD) {
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(phKey, {
      api_host: phHost,
      autocapture: false,
      capture_pageview: false,
      persistence: 'localStorage',
      disable_session_recording: true,
      respect_dnt: true,
    });
    posthog.capture('$pageview', { path: window.location.pathname });
    setPostHogInstance(posthog);
  });
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const appRoot = app;

const params = new URLSearchParams(window.location.search);
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const replaySample = params.get('replay');
const playDeepLink = params.get('play');
const wantsLive =
  import.meta.env.DEV &&
  !playDeepLink &&
  (params.has('room') || params.has('variant') || params.has('dev'));
const page = params.get('page');
const gameRoomId = gameRoomIdFromPath(path);
const darkXiangqiGameRoomId = darkXiangqiGameRoomIdFromPath(path);
const darkMiniXiangqiGameRoomId = darkMiniXiangqiGameRoomIdFromPath(path);
const liveRoomId = liveRoomIdFromPath(path);
const wantsAbout = path === '/about' || page === 'about';
const wantsSource = path === '/source' || page === 'source';
const wantsContact = path === '/contact' || page === 'contact';
const wantsFaq = path === '/faq' || page === 'faq';
const wantsTerms = path === '/terms' || page === 'terms';
const wantsPrivacy = path === '/privacy' || page === 'privacy';
const wantsAccount = path === '/account' || page === 'account';
const wantsAccountSettings = path === '/account/settings' || page === 'account-settings';
const wantsLearn = path === '/learn' || page === 'learn';
const wantsRulesIndex =
  path === '/rules' || path === '/zh-hans/rules' || path === '/zh-hant/rules' || page === 'rules';
const articleSlug = articleSlugFromPath(path);
const articleLang = articleLangFromPath(path);
const wantsArticlesIndex =
  path === '/articles' ||
  path === '/zh-hans/articles' ||
  path === '/zh-hant/articles' ||
  page === 'articles';
const wantsLegacyPlay = path === '/play' || page === 'play';
const wantsWatch = path === '/watch' || page === 'watch';
const wantsLeaderboard = path === '/leaderboard' || page === 'leaderboard';
// Unlisted admin game browser. No nav entry; the page itself is admin-gated by
// the /api/admin/games/query endpoint (open in local dev). Direct-URL only.
const wantsDatabase = path === '/database';
// Unlisted admin engine tracker. No nav entry; admin-gated by /api/admin/engines
// (open in local dev). Direct-URL only.
const wantsEngines = path === '/engines';
// Unlisted admin per-engine profile (/engine/:id). Same admin gate as /engines.
const engineProfileId = path.startsWith('/engine/')
  ? decodeURIComponent(path.slice('/engine/'.length))
  : null;
const profileHandle = profileHandleFromPath(path);
// Hidden spike: FoW Xiangqi Phase A. No nav entry, no landing link, and no
// dev default; enabling it is an explicit build-time flag.
const wantsXiangqiSpike = darkXiangqiEnabled() && path === '/xiangqi-spike';
// Hidden DEV-only spike for the candidate 7x7 Dark Mini Xiangqi ruleset.
const wantsMiniXiangqiSpike = import.meta.env.DEV && path === '/mini-xiangqi-spike';
// Hidden reviewer demo: no nav entry, direct-link only, build-time flagged.
const wantsXiangqiDemo = darkXiangqiEnabled() && path === '/xiangqi-demo';
// Hidden DEV-only spike: pixel-art piece + fog style probes. No nav entry.
const wantsPixelLab = import.meta.env.DEV && path === '/pixel-lab';
// Hidden DEV-only identity lab for candidate variant marks. No nav entry.
const wantsVariantMarksLab = import.meta.env.DEV && path === '/variant-marks';

if (replaySample) {
  setTitle('Replay');
  // Honor &ply=N as a start cursor (mirrors the /game/:id review route). Lets a
  // deep-link drop straight onto a position of interest in a long replay.
  const replayPlyRaw = params.get('ply');
  const replayPly = replayPlyRaw ? Number.parseInt(replayPlyRaw, 10) : NaN;
  const replayOpts = Number.isFinite(replayPly) ? { initialPly: replayPly } : undefined;
  void mountOrReport(() =>
    import('./replay.js').then(({ mountReplay }) =>
      mountReplay(appRoot, replaySample, replayOpts).then(() => undefined),
    ),
  );
} else if (liveRoomId || wantsLive) {
  setTitle('Live');
  void mountOrReport(() =>
    import('./live.js').then(({ bootstrapLiveRoom }) => bootstrapLiveRoom()),
  );
} else if (darkXiangqiGameRoomId && darkXiangqiEnabled()) {
  setTitle('Dark Xiangqi');
  void mountOrReport(() =>
    import('./dark-xiangqi-postgame.js').then(({ mountDarkXiangqiPostgame }) =>
      mountDarkXiangqiPostgame(appRoot, darkXiangqiGameRoomId),
    ),
  );
} else if (darkMiniXiangqiGameRoomId && darkMiniXiangqiEnabled()) {
  setTitle('Dark Mini Xiangqi');
  void mountOrReport(() =>
    import('./dark-mini-xiangqi-postgame.js').then(({ mountDarkMiniXiangqiPostgame }) =>
      mountDarkMiniXiangqiPostgame(appRoot, darkMiniXiangqiGameRoomId),
    ),
  );
} else if (gameRoomId) {
  setTitle('Game');
  void mountOrReport(() =>
    import('./landing.js').then(({ mountGame }) => mountGame(appRoot, gameRoomId)),
  );
} else if (wantsLeaderboard) {
  setTitle('Leaderboard');
  void mountOrReport(() =>
    import('./profile.js').then(({ mountLeaderboard }) => mountLeaderboard(appRoot)),
  );
} else if (wantsDatabase) {
  setTitle('Game database');
  void mountOrReport(() =>
    import('./database.js').then(({ mountDatabase }) => mountDatabase(appRoot)),
  );
} else if (wantsEngines) {
  setTitle('Engines');
  void mountOrReport(() =>
    import('./engines.js').then(({ mountEngines }) => mountEngines(appRoot)),
  );
} else if (engineProfileId) {
  setTitle('Engine');
  void mountOrReport(() =>
    import('./engine-profile.js').then(({ mountEngineProfile }) =>
      mountEngineProfile(appRoot, engineProfileId),
    ),
  );
} else if (profileHandle) {
  setTitle(`@${profileHandle}`);
  void mountOrReport(() =>
    import('./profile.js').then(({ mountProfile }) => mountProfile(appRoot, profileHandle)),
  );
} else if (wantsAccountSettings) {
  setTitle('Settings');
  void mountOrReport(() =>
    import('./account.js').then(({ mountAccountSettings }) => mountAccountSettings(appRoot)),
  );
} else if (wantsAccount) {
  setTitle('Account');
  void mountOrReport(() =>
    import('./account.js').then(({ mountAccount }) => mountAccount(appRoot)),
  );
} else if (wantsWatch) {
  setTitle('Watch');
  void mountOrReport(() =>
    import('./watch-route.js').then(({ mountWatch }) => mountWatch(appRoot)),
  );
} else if (wantsXiangqiSpike) {
  setTitle('Xiangqi spike');
  void mountOrReport(() =>
    import('./xiangqi-spike.js').then(({ mountXiangqiSpike }) => mountXiangqiSpike(appRoot)),
  );
} else if (wantsMiniXiangqiSpike) {
  setTitle('Mini Xiangqi spike');
  void mountOrReport(() =>
    import('./mini-xiangqi-spike.js').then(({ mountMiniXiangqiSpike }) =>
      mountMiniXiangqiSpike(appRoot),
    ),
  );
} else if (wantsXiangqiDemo) {
  setTitle('Dark Xiangqi demo');
  void mountOrReport(() =>
    import('./xiangqi-demo.js').then(({ mountXiangqiDemo }) => mountXiangqiDemo(appRoot)),
  );
} else if (wantsPixelLab) {
  setTitle('Pixel lab');
  void mountOrReport(() =>
    import('./pixel-lab.js').then(({ mountPixelLab }) => mountPixelLab(appRoot)),
  );
} else if (wantsVariantMarksLab) {
  setTitle('Variant marks');
  void mountOrReport(() =>
    import('./variant-marks-lab.js').then(({ mountVariantMarksLab }) =>
      mountVariantMarksLab(appRoot),
    ),
  );
} else if (wantsLegacyPlay) {
  window.history.replaceState(null, '', '/');
  void mountOrReport(() =>
    import('./landing.js').then(({ mountLanding }) => mountLanding(appRoot)),
  );
} else if (articleSlug) {
  setTitle('Articles');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountArticle }) =>
      mountArticle(appRoot, articleSlug, articleLang),
    ),
  );
} else if (wantsArticlesIndex) {
  setTitle(articleLang ? '文章' : 'Articles');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountArticlesIndex }) =>
      mountArticlesIndex(appRoot, articleLang),
    ),
  );
} else if (wantsRulesIndex) {
  setTitle(articleLang ? '规则' : 'Rules');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountRulesIndex }) =>
      mountRulesIndex(appRoot, articleLang),
    ),
  );
} else if (wantsLearn) {
  setTitle('Learn');
  void mountOrReport(() => import('./learn.js').then(({ mountLearn }) => mountLearn(appRoot)));
} else if (wantsAbout) {
  setTitle('About');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountAbout }) => mountAbout(appRoot)),
  );
} else if (wantsSource) {
  setTitle('Source');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountSource }) => mountSource(appRoot)),
  );
} else if (wantsContact) {
  setTitle('Contact');
  void mountOrReport(() =>
    import('./landing.js').then(({ mountContact }) => mountContact(appRoot)),
  );
} else if (wantsFaq) {
  setTitle('FAQ');
  void mountOrReport(() => import('./pages-static.js').then(({ mountFaq }) => mountFaq(appRoot)));
} else if (wantsTerms) {
  setTitle('Terms');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountTerms }) => mountTerms(appRoot)),
  );
} else if (wantsPrivacy) {
  setTitle('Privacy');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountPrivacy }) => mountPrivacy(appRoot)),
  );
} else if (path === '/') {
  void mountOrReport(() =>
    import('./landing.js').then(({ mountLanding }) => mountLanding(appRoot)),
  );
} else {
  setTitle('Not found');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountNotFound }) => mountNotFound(appRoot)),
  );
}

function setTitle(page: string): void {
  document.title = `${page} · Mistboard`;
}

// Code-split routes fetch their chunk lazily, so a transient failure — most
// often the brief server-restart window during a deploy — rejects the dynamic
// import with a browser-specific "module load" error. Retry once with a full
// reload (which re-fetches index.html and the current chunk hashes) before
// surfacing the error screen. The sessionStorage flag caps it at one retry per
// tab session so a genuinely-missing asset can't loop; it clears on any
// successful mount so a later deploy gets its own retry budget.
const CHUNK_RELOAD_FLAG = 'mistboard.chunkReloadAttempted';

function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Failed to fetch dynamically imported module') || // Chromium
    message.includes('error loading dynamically imported module') || // Firefox
    message.includes('Importing a module script failed') // Safari
  );
}

function chunkReloadAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) !== null;
  } catch {
    // Storage unavailable (private mode, etc.): treat as already tried so we
    // fall through to the error screen instead of risking a reload loop.
    return true;
  }
}

function setChunkReloadAttempted(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    else sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // No-op when storage is unavailable.
  }
}

async function mountOrReport(run: () => Promise<void>): Promise<void> {
  try {
    await run();
    setChunkReloadAttempted(false);
  } catch (err) {
    console.error(err);
    if (isChunkLoadError(err) && !chunkReloadAlreadyAttempted()) {
      setChunkReloadAttempted(true);
      location.reload();
      return;
    }
    appRoot.replaceChildren();
    appRoot.classList.add('landing-page');
    const shell = document.createElement('main');
    shell.className = 'site-section app-error-panel';
    const heading = document.createElement('h1');
    heading.className = 'site-section-heading';
    heading.textContent = 'Page failed to load';
    const detail = document.createElement('pre');
    detail.textContent = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'landing-cta-primary';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => {
      setChunkReloadAttempted(false);
      location.reload();
    });
    shell.append(heading, detail, reload);
    appRoot.append(shell);
  }
}

function gameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/game\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function darkXiangqiGameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/dark-xiangqi\/game\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function darkMiniXiangqiGameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/dark-mini-xiangqi\/game\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function liveRoomIdFromPath(value: string): string | null {
  if (value === '/room') return 'dev-room';
  const match = value.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function profileHandleFromPath(value: string): string | null {
  const match = value.match(/^\/@\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

// Article + rules-doc routes accept an optional language prefix:
// /zh-han[st]/{articles,rules}/<slug>. Rules docs and articles share the same
// renderer; only the URL base differs. The slug parser strips the lang prefix
// and matches either base (but NOT the bare /rules or /articles index, which
// have no slug segment); the lang parser reports the prefix.
function articleSlugFromPath(value: string): string | null {
  const match = value.replace(/^\/zh-han[st]/, '').match(/^\/(?:articles|rules)\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function articleLangFromPath(value: string): ArticleLang | null {
  if (value === '/zh-hans/rules' || value.startsWith('/zh-hans/rules/')) return 'zh-Hans';
  if (value === '/zh-hant/rules' || value.startsWith('/zh-hant/rules/')) return 'zh-Hant';
  if (value === '/zh-hans/articles' || value.startsWith('/zh-hans/articles/')) return 'zh-Hans';
  if (value === '/zh-hant/articles' || value.startsWith('/zh-hant/articles/')) return 'zh-Hant';
  return null;
}
