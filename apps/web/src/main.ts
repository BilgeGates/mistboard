import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const params = new URLSearchParams(window.location.search);
const replaySample = params.get('replay');
const wantsLive =
  import.meta.env.DEV &&
  (params.has('room') || params.has('variant') || params.has('dev'));
const page = params.get('page');

if (replaySample) {
  void import('./replay.js').then(({ mountReplay }) => mountReplay(app, replaySample));
} else if (wantsLive) {
  void import('./live.js');
} else if (page === 'about') {
  void import('./landing.js').then(({ mountAbout }) => mountAbout(app));
} else {
  void import('./landing.js').then(({ mountLanding }) => mountLanding(app));
}
