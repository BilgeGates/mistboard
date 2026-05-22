// Curated FoW video page. Data inlined here while the corpus is small.
// Promote to a separate data module when entry count justifies it.

export type CuratedVideo = {
  id: string;            // YouTube video ID
  title: string;
  channel: string;
  publishedAt: string;   // ISO-ish "YYYY-MM-DD"
  summary: string;
  tags: string[];
};

export const curatedVideos: CuratedVideo[] = [
  {
    id: 'B_ficfZqoyg',
    title: "GM Hikaru's First Ever Game vs GothamChess in Fog of War",
    channel: 'GothamChess',
    publishedAt: '2020-09-27',
    summary:
      'The viral moment Fog of War reached the mainstream chess audience. Hikaru and Levy figure out the variant on stream.',
    tags: ['intro', 'creators', 'historical'],
  },
  {
    id: '1P35o2pAGws',
    title: 'Hikaru vs Gotham: FOG OF WAR Chess Variant',
    channel: 'GothamChess',
    publishedAt: '2020-09-25',
    summary:
      'The companion piece. Together with the rematch, these two videos drove millions of views and a generation of FoW players.',
    tags: ['intro', 'creators', 'historical'],
  },
  {
    id: 'Uc7Kf_-hsgw',
    title: 'FOG OF WAR: GothamChess v. Eric Rosen',
    channel: 'GothamChess',
    publishedAt: '2020-10-01',
    summary:
      'A different stylistic pairing. Rosen brings a quieter, more positional read of the fog.',
    tags: ['creators', 'pedagogical'],
  },
  {
    id: 'f3i9Spz40BU',
    title: 'Goodnight Chess (Fog of War) ft. Anish Giri',
    channel: 'Anish Giri',
    publishedAt: '2020-10-15',
    summary:
      'GM Anish Giri exploring the variant. Worth watching for how a top-50 player adapts pattern recognition under fog.',
    tags: ['creators', 'gm-level'],
  },
  {
    id: 'E76Gx12Ou1o',
    title: 'Fog of War Chess… While Blindfolded?!',
    channel: 'GothamChess',
    publishedAt: '2020-10-25',
    summary:
      'Novelty variant-on-variant: FoW played without a board on the player side. More a marker of the format’s reach than a serious game.',
    tags: ['novelty', 'creators'],
  },
  {
    id: 'iWEdLLnAfy4',
    title: "Chess.com Fog of War Championship 2025! Can You Win It Even If You Can't See It?",
    channel: 'Chess.com',
    publishedAt: '2025-12-12',
    summary:
      'Coverage of the 2025 chess.com Fog of War Championship. 3+2, $2,500 prize pool, the biggest organized FoW event to date.',
    tags: ['tournament', 'historical'],
  },
];

function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&modestbranding=1&rel=0`;
}

export function findVideo(id: string): CuratedVideo | undefined {
  return curatedVideos.find((v) => v.id === id);
}

// Module-local handle to the app root + popstate installation flag so
// browser back/forward swaps between grid and player without a full reload.
let routerRoot: HTMLElement | null = null;
let popstateInstalled = false;

export function attachVideoRouter(root: HTMLElement): void {
  installRouter(root);
}

function installRouter(root: HTMLElement): void {
  routerRoot = root;
  if (popstateInstalled) return;
  popstateInstalled = true;
  window.addEventListener('popstate', () => {
    if (!routerRoot) return;
    renderForCurrentPath(routerRoot);
  });
}

function renderForCurrentPath(root: HTMLElement): void {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/video') {
    renderIndex(root);
    return;
  }
  const match = path.match(/^\/video\/([^/]+)$/);
  if (match) {
    renderPlayer(root, decodeURIComponent(match[1]!));
    return;
  }
  // Path is outside our routes; let the browser sort it out (full nav case).
}

function renderIndex(root: HTMLElement): void {
  installRouter(root);
  const content = root.querySelector('.video-route-content');
  const page = buildVideoIndex();
  if (content) content.replaceWith(page);
  else root.append(page);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderPlayer(root: HTMLElement, id: string): void {
  installRouter(root);
  const content = root.querySelector('.video-route-content');
  const page = buildVideoPlayer(id);
  if (content) content.replaceWith(page);
  else root.append(page);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function videoCard(video: CuratedVideo): HTMLElement {
  const item = document.createElement('li');
  item.className = 'video-index-item';

  const card = document.createElement('a');
  card.className = 'video-index-card';
  card.href = `/video/${video.id}`;
  card.setAttribute(
    'aria-label',
    `${video.title}. ${video.channel}, ${video.publishedAt}`,
  );
  // Intercept plain left-clicks so we route SPA-style (no full reload).
  // Modifier-clicks (cmd/ctrl/shift) and middle-clicks fall through to the
  // default link behaviour so users can still open in a new tab.
  card.addEventListener('click', (e) => {
    if (!isPlainLeftClick(e)) return;
    if (!routerRoot) return;
    e.preventDefault();
    const url = `/video/${video.id}`;
    if (window.location.pathname.replace(/\/+$/, '') !== url) {
      history.pushState({ kind: 'video-player', id: video.id }, '', url);
    }
    renderPlayer(routerRoot, video.id);
  });

  const thumb = document.createElement('div');
  thumb.className = 'video-index-card-thumb';

  const img = document.createElement('img');
  img.src = thumbUrl(video.id);
  img.alt = '';
  img.loading = 'lazy';
  img.width = 480;
  img.height = 360;
  thumb.append(img);

  const title = document.createElement('h2');
  title.className = 'video-index-card-title';
  title.textContent = video.title;
  thumb.append(title);

  const summary = document.createElement('p');
  summary.className = 'video-index-card-summary';
  summary.textContent = video.summary;

  card.append(thumb, summary);
  item.append(card);
  return item;
}

export function buildVideoIndex(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'site-section video-index video-route-content';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Video';

  const intro = document.createElement('p');
  intro.className = 'video-index-intro';
  intro.textContent =
    'Hand-picked dark chess (Fog of War) games and explainers from around the web. Growing. Submit a video by opening an issue.';

  const list = document.createElement('ul');
  list.className = 'video-index-list';
  for (const video of curatedVideos) {
    list.append(videoCard(video));
  }

  main.append(heading, intro, list);
  return main;
}

export function buildVideoPlayer(id: string): HTMLElement {
  const video = findVideo(id);
  const main = document.createElement('main');
  main.className = 'site-section video-player video-route-content';

  const back = document.createElement('a');
  back.className = 'video-player-back';
  back.href = '/video';
  back.textContent = '← All videos';
  back.addEventListener('click', (e) => {
    if (!isPlainLeftClick(e)) return;
    if (!routerRoot) return;
    e.preventDefault();
    if (window.location.pathname.replace(/\/+$/, '') !== '/video') {
      history.pushState({ kind: 'video-index' }, '', '/video');
    }
    renderIndex(routerRoot);
  });

  if (!video) {
    const heading = document.createElement('h1');
    heading.className = 'site-section-heading';
    heading.textContent = 'Video not found';
    const note = document.createElement('p');
    note.className = 'video-player-summary';
    note.textContent = `No curated video with id "${id}". It may have been removed from the list.`;
    main.append(back, heading, note);
    return main;
  }

  const frame = document.createElement('div');
  frame.className = 'video-player-frame';
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl(video.id);
  iframe.title = video.title;
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('frameborder', '0');
  frame.append(iframe);

  const title = document.createElement('h1');
  title.className = 'video-player-title';
  title.textContent = video.title;

  const meta = document.createElement('p');
  meta.className = 'video-player-meta';
  meta.textContent = `${video.channel} · ${video.publishedAt}`;

  const summary = document.createElement('p');
  summary.className = 'video-player-summary';
  summary.textContent = video.summary;

  const tags = document.createElement('ul');
  tags.className = 'video-player-tags';
  for (const tag of video.tags) {
    const li = document.createElement('li');
    li.textContent = tag;
    tags.append(li);
  }

  const youtubeLink = document.createElement('a');
  youtubeLink.className = 'video-player-external';
  youtubeLink.href = `https://www.youtube.com/watch?v=${video.id}`;
  youtubeLink.target = '_blank';
  youtubeLink.rel = 'noopener noreferrer';
  youtubeLink.textContent = 'Watch on YouTube →';

  main.append(back, frame, title, meta, summary, tags, youtubeLink);
  return main;
}
