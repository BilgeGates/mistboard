import './styles.css';

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
const wantsAbout = path === '/about' || page === 'about';
const wantsLearn = path === '/learn' || page === 'learn';
const wantsPlay = path === '/play' || page === 'play';
const wantsWatch = path === '/watch' || page === 'watch';

if (replaySample) {
  void import('./replay.js').then(({ mountReplay }) => mountReplay(app, replaySample));
} else if (wantsEngineLab && engineLabEnabled) {
  // ?bakeoff loads the default manifest; ?bakeoff=<url> loads a specific one.
  const manifestUrl = bakeoffParam && bakeoffParam.length > 0 ? bakeoffParam : undefined;
  void import('./bakeoff.js').then(({ mountBakeoff }) => mountBakeoff(app, manifestUrl));
} else if (wantsEngineLab) {
  app.replaceChildren();
  app.classList.add('landing-page');
  const shell = document.createElement('main');
  shell.className = 'site-section';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Not found';
  shell.append(heading);
  app.append(shell);
} else if (wantsLive) {
  void import('./live.js');
} else if (gameRoomId) {
  void import('./landing.js').then(({ mountGame }) => mountGame(app, gameRoomId));
} else if (wantsWatch) {
  void import('./landing.js').then(({ mountWatch }) => mountWatch(app));
} else if (wantsLearn) {
  void import('./landing.js').then(({ mountLearn }) => mountLearn(app));
} else if (wantsPlay) {
  void import('./landing.js').then(({ mountPlay }) => mountPlay(app));
} else if (wantsAbout) {
  void import('./landing.js').then(({ mountAbout }) => mountAbout(app));
} else {
  void import('./landing.js').then(({ mountLanding }) => mountLanding(app));
}

function gameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/game\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}
