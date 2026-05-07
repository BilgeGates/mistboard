import './styles.css';

const phKey = import.meta.env.VITE_POSTHOG_KEY;
const phHost = import.meta.env.VITE_POSTHOG_HOST;
if (phKey && phHost && import.meta.env.PROD) {
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(phKey, {
      api_host: phHost,
      autocapture: true,
      capture_pageview: true,
      persistence: 'localStorage',
      disable_session_recording: true,
      respect_dnt: true,
    });
  });
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const params = new URLSearchParams(window.location.search);
const replaySample = params.get('replay');
const bakeoffParam = params.get('bakeoff');
const wantsLive =
  import.meta.env.DEV &&
  (params.has('room') || params.has('variant') || params.has('dev'));
const page = params.get('page');

if (replaySample) {
  void import('./replay.js').then(({ mountReplay }) => mountReplay(app, replaySample));
} else if (bakeoffParam !== null) {
  // ?bakeoff loads the default manifest; ?bakeoff=<url> loads a specific one.
  const manifestUrl = bakeoffParam.length > 0 ? bakeoffParam : undefined;
  void import('./bakeoff.js').then(({ mountBakeoff }) => mountBakeoff(app, manifestUrl));
} else if (wantsLive) {
  void import('./live.js');
} else if (page === 'about') {
  void import('./landing.js').then(({ mountAbout }) => mountAbout(app));
} else {
  void import('./landing.js').then(({ mountLanding }) => mountLanding(app));
}
