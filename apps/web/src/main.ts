import './styles.css';
import { initializeThemeSettings } from './theme.js';

initializeThemeSettings();

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
  });
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const appRoot = app;

const params = new URLSearchParams(window.location.search);
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const replaySample = params.get('replay');
const bakeoffParam = params.get('bakeoff');
const wantsLive =
  import.meta.env.DEV &&
  (params.has('room') || params.has('variant') || params.has('dev'));
const page = params.get('page');
const engineLabEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_ENGINE_LAB === 'true';
const wantsEngineLab =
  bakeoffParam !== null ||
  path === '/engine-lab' ||
  path === '/arena' ||
  page === 'engine-lab' ||
  page === 'arena';
const gameRoomId = gameRoomIdFromPath(path);
const liveRoomId = liveRoomIdFromPath(path);
const wantsAbout = path === '/about' || page === 'about';
const wantsAccount = path === '/account' || page === 'account';
const wantsLearn = path === '/learn' || page === 'learn';
const wantsWatch = path === '/watch' || page === 'watch';
const profileHandle = profileHandleFromPath(path);

if (replaySample) {
  void mountOrReport(() => import('./replay.js').then(({ mountReplay }) => mountReplay(appRoot, replaySample)));
} else if (wantsEngineLab && engineLabEnabled) {
  // ?bakeoff loads the default manifest; ?bakeoff=<url> loads a specific one.
  const manifestUrl = bakeoffParam && bakeoffParam.length > 0 ? bakeoffParam : undefined;
  void mountOrReport(() => import('./bakeoff.js').then(({ mountBakeoff }) => mountBakeoff(appRoot, manifestUrl)));
} else if (wantsEngineLab) {
  appRoot.replaceChildren();
  appRoot.classList.add('landing-page');
  const shell = document.createElement('main');
  shell.className = 'site-section';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Not found';
  shell.append(heading);
  appRoot.append(shell);
} else if (liveRoomId || wantsLive) {
  void mountOrReport(() => import('./live.js').then(() => undefined));
} else if (gameRoomId) {
  void mountOrReport(() => import('./landing.js').then(({ mountGame }) => mountGame(appRoot, gameRoomId)));
} else if (profileHandle) {
  void mountOrReport(() => import('./landing.js').then(({ mountProfile }) => mountProfile(appRoot, profileHandle)));
} else if (wantsAccount) {
  void mountOrReport(() => import('./landing.js').then(({ mountAccount }) => mountAccount(appRoot)));
} else if (wantsWatch) {
  void mountOrReport(() => import('./landing.js').then(({ mountWatch }) => mountWatch(appRoot)));
} else if (wantsLearn) {
  void mountOrReport(() => import('./learn.js').then(({ mountLearn }) => mountLearn(appRoot)));
} else if (wantsAbout) {
  void mountOrReport(() => import('./landing.js').then(({ mountAbout }) => mountAbout(appRoot)));
} else {
  void mountOrReport(() => import('./landing.js').then(({ mountLanding }) => mountLanding(appRoot)));
}

async function mountOrReport(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(err);
    appRoot.replaceChildren();
    appRoot.classList.add('landing-page');
    const shell = document.createElement('main');
    shell.className = 'site-section app-error-panel';
    const heading = document.createElement('h1');
    heading.className = 'site-section-heading';
    heading.textContent = 'Page failed to load';
    const detail = document.createElement('pre');
    detail.textContent = err instanceof Error ? (err.stack ?? err.message) : String(err);
    shell.append(heading, detail);
    appRoot.append(shell);
  }
}

function gameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/game\/([^/]+)$/);
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
