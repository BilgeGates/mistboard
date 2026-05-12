import { replayGameEvents, type Board, type GameEvent, type PlayerView, type Square } from '@mistboard/game';
import type * as cg from 'chessground/types';
import type { BeliefRow, TraceRow } from './belief-panel.js';
import { createReadOnlyBoard, hiddenSquareClasses, setBoardPosition } from './board-ui.js';
import { mountReplay, type AnnotationConfig, type EngineReviewPanels, type GameMeta } from './replay.js';

type FeaturedGame = {
  roomId: string;
  variant: string;
  mode?: 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
  result: string;
  termination: string;
  plyCount: number;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  endedAt?: string;
  jobId?: string | null;
  gameIndex?: number | null;
  whiteEngineId?: string | null;
  blackEngineId?: string | null;
  timeControl?: Record<string, unknown> | null;
  participants?: GameParticipant[];
  playerColor?: 'white' | 'black';
};

type GameParticipant = {
  color: 'white' | 'black';
  displayName: string;
  subjectType: 'guest' | 'user' | 'engine-version' | 'manual' | 'imported';
  subjectId: string | null;
  visibility: 'private' | 'link' | 'unlisted' | 'public';
};

type PlayableEngine = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'test' | 'admin';
};

type GameReviewPayload = {
  game: FeaturedGame;
  events: GameEvent[];
  capabilities: {
    canViewEngineArtifacts: boolean;
    canAnnotate: boolean;
    canManageEngineArtifacts: boolean;
  };
  panels: {
    belief: {
      available: boolean;
      defaultOpen: boolean;
      seats: Array<'white' | 'black'>;
      snapshotKinds: string[];
    };
    trace: {
      available: boolean;
      defaultOpen: boolean;
      seats: Array<'white' | 'black'>;
    };
    annotations: {
      available: boolean;
      writable: boolean;
    };
  };
};

type GameArtifactPayload = {
  id: number;
  gameId: string;
  ply: number | null;
  engineColor: 'white' | 'black' | null;
  artifactType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};
type GameArtifactType = 'belief-snapshot' | 'trace-row' | 'engine-move-choice';

type UserProfile = {
  isViewer?: boolean;
  user: {
    handle: string;
    displayName: string;
    profileVisibility: 'private' | 'unlisted' | 'public';
  };
  games: FeaturedGame[];
};

type LandingGameSource = 'recent' | 'eve' | 'featured' | 'sample';
type LandingPlayChoice = {
  engineId?: string;
  engines?: PlayableEngine[];
  mode: 'lobby' | 'pvp' | 'pve';
  title: string;
};
type LandingStartFormat = 'standard' | 'draft960';
type LandingTimePresetId = '1m1' | '3m2' | '5m3' | 'custom';
type LandingTimePreset = {
  id: LandingTimePresetId;
  label: string;
  initialMs: number;
  incrementMs: number;
};
type LandingRoomSetup = {
  startFormat: LandingStartFormat;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
};
type LobbyTicketResponse = {
  pollAfterMs?: number;
  status?: 'waiting' | 'matched';
  ticketId?: string;
  url?: string;
};
type OpenLobbyRequest = {
  hiddenDraft960: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  waitingMs: number;
};

const GITHUB_URL = 'https://github.com/brianhliou/mistboard';
const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';
const LANDING_TIME_PRESETS: LandingTimePreset[] = [
  { id: '1m1', label: '1 + 1', initialMs: 60_000, incrementMs: 1_000 },
  { id: '3m2', label: '3 + 2', initialMs: 3 * 60_000, incrementMs: 2_000 },
  { id: '5m3', label: '5 + 3', initialMs: 5 * 60_000, incrementMs: 3_000 },
  { id: 'custom', label: 'Custom', initialMs: 3 * 60_000, incrementMs: 2_000 },
];

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading games'), buildFooter());

  const [{ games }, engines] = await Promise.all([
    fetchLandingGames(),
    fetchPlayableEngines().catch((err) => {
      console.warn(err);
      return fallbackPlayableEngines();
    }),
  ]);
  const stage = buildLandingStage(engines);
  root.replaceChildren(buildNav(), stage.el, buildFooter());
  void populateLandingLeaderboard(stage.leaderboardRoot);
  if (games.length === 0) {
    stage.replayRoot.textContent = 'No games available yet.';
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const sampleIds = games.map((g) => g.roomId);
  const currentSample =
    requested && sampleIds.includes(requested) ? requested : pickSample(sampleIds);

  await mountReplay(stage.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: true,
    blackOrientation: 'white',
    loopSamples: sampleIds,
    loaderForId: landingEventLoader,
    metadataMode: 'compact',
    metadataByRoomId,
  });
}

export async function mountWatch(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');
  root.append(buildNav(), buildLoadingState('Loading replays'), buildFooter());

  const { games, source } = await fetchLandingGames();
  const watch = buildWatchSection();
  root.replaceChildren(buildNav(), watch.el, buildFooter());

  if (games.length === 0) {
    watch.replayRoot.textContent = 'No games available yet.';
    renderRecentGames(watch.listRoot, games, source);
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('game');
  const sampleIds = games.map((g) => g.roomId);
  const currentSample =
    requested && sampleIds.includes(requested) ? requested : sampleIds[0]!;

  await mountReplay(watch.replayRoot, currentSample, {
    autoplay: false,
    showControls: true,
    revealOnFinish: true,
    loopSamples: sampleIds,
    loaderForId: apiEventLoader,
    metadataByRoomId,
  });
  renderRecentGames(watch.listRoot, games, source, currentSample, '/game/');
}

export async function mountGame(root: HTMLElement, roomId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'game-route');

  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'game-replay';
  shell.append(replayRoot);
  root.append(buildNav(), shell, buildFooter());

  const loaded = await loadGameForReview(roomId);
  if (!loaded) {
    replayRoot.append(buildNotice('Game not found', 'This game is not available as a public replay.'));
    return;
  }

  const { game, events } = loaded;
  document.title = buildGamePageTitle(game);
  await mountReplay(replayRoot, game.roomId, {
    autoplay: false,
    initialPly: initialGamePly(),
    onPlyChange: syncGamePlyUrl,
    showControls: true,
    controlsMode: 'panel',
    revealOnFinish: true,
    loaderForId: events ? async () => events : apiEventLoader,
    metadataByRoomId: {
      [game.roomId]: gameMetaForGame(game),
    },
    enginePanels: loaded.review
      ? enginePanelsForReview(
          loaded.review,
          loaded.beliefRows.length > 0,
          loaded.beliefRows.length > 0 && loaded.traceRows.length > 0,
        )
      : undefined,
    belief: loaded.beliefRows.length > 0
      ? {
          rowsForSampleId: () => loaded.beliefRows,
          traceRowsForSampleId: () => loaded.traceRows,
        }
      : undefined,
    annotation: annotationConfigForGame(game, loaded.beliefRows),
  });
}

export async function mountAccount(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');
  root.append(buildNav(), buildLoadingState('Loading account'), buildFooter());

  const shell = document.createElement('main');
  shell.className = 'account-shell';
  root.replaceChildren(buildNav(), shell, buildFooter());

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  renderAccountShell(shell, current);
}

export async function mountAccountSettings(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');

  const shell = document.createElement('main');
  shell.className = 'account-shell account-settings-shell';
  root.replaceChildren(buildNav(), shell, buildFooter());

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  renderAccountSettingsShell(shell, current);
}

export async function mountProfile(root: HTMLElement, handle: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route');
  root.append(buildNav(), buildLoadingState('Loading profile'), buildFooter());

  const shell = document.createElement('main');
  shell.className = 'profile-shell';
  root.replaceChildren(buildNav(), shell, buildFooter());

  const profile = await fetchUserProfile(handle).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!profile) {
    shell.append(buildNotice('Profile not found', 'This profile is private or does not exist.'));
    return;
  }

  shell.append(buildProfileHeader(profile), buildProfileGames(profile.games));
}

export async function mountLeaderboard(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading leaderboard'), buildFooter());

  const shell = document.createElement('main');
  shell.className = 'site-section leaderboard-shell';
  root.replaceChildren(buildNav(), shell, buildFooter());

  type LeaderboardEntry = { rank: number; handle: string; displayName: string; eloRating: number };
  const data = await fetch('/api/leaderboard?limit=100')
    .then((r) => (r.ok ? (r.json() as Promise<{ leaderboard: LeaderboardEntry[] }>) : Promise.reject(r.status)))
    .catch((err) => {
      console.warn(err);
      return null;
    });

  if (!data) {
    shell.append(buildNotice('Leaderboard unavailable', 'Could not load ratings. Try again later.'));
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Leaderboard';

  if (data.leaderboard.length === 0) {
    shell.append(heading, buildNotice('No rated games yet', 'Play a PvP game to appear here.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'leaderboard-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['#', 'Player', 'Rating']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const entry of data.leaderboard) {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.className = 'leaderboard-rank';
    rankTd.textContent = String(entry.rank);

    const nameTd = document.createElement('td');
    nameTd.className = 'leaderboard-player';
    const link = document.createElement('a');
    link.href = `/@/${encodeURIComponent(entry.handle)}`;
    link.textContent = entry.displayName;
    nameTd.append(link);

    const ratingTd = document.createElement('td');
    ratingTd.className = 'leaderboard-rating';
    ratingTd.textContent = String(entry.eloRating);

    tr.append(rankTd, nameTd, ratingTd);
    tbody.append(tr);
  }
  table.append(tbody);
  shell.append(heading, table);
}

async function loadGameForReview(roomId: string): Promise<{
  beliefRows: BeliefRow[];
  events?: GameEvent[];
  game: FeaturedGame;
  review?: GameReviewPayload;
  traceRows: TraceRow[];
} | null> {
  const review = await fetchGameReview(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (review) {
    const [beliefArtifacts, traceArtifacts] = await Promise.all([
      review.panels.belief.available
        ? fetchGameArtifacts(roomId, 'belief-snapshot').catch((err) => {
            console.warn(err);
            return [];
          })
        : Promise.resolve([]),
      review.panels.trace.available
        ? fetchTraceArtifacts(roomId).catch((err) => {
            console.warn(err);
            return [];
          })
        : Promise.resolve([]),
    ]);
    const beliefRows = beliefArtifacts.map((artifact) => beliefRowFromArtifact(review.game, artifact));
    const traceRows = traceArtifacts.map((artifact) => traceRowFromArtifact(review.game, artifact));
    return {
      beliefRows,
      game: review.game,
      events: review.events,
      review,
      traceRows,
    };
  }

  const game = await fetchGameSummary(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (game) return { game, beliefRows: [], traceRows: [] };

  const events = await apiEventLoader(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!events || events.length === 0) return null;

  const fallback = gameSummaryFromEvents(roomId, events);
  return fallback ? { game: fallback, events, beliefRows: [], traceRows: [] } : null;
}

async function fetchGameReview(roomId: string): Promise<GameReviewPayload | null> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/review`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load review for ${roomId}: ${resp.status}`);
  return await resp.json() as GameReviewPayload;
}

function enginePanelsForReview(review: GameReviewPayload, hasBeliefRows: boolean, hasTraceRows = false): EngineReviewPanels {
  return {
    belief: hasBeliefRows ? undefined : review.panels.belief,
    trace: hasTraceRows ? undefined : review.panels.trace,
  };
}

function annotationConfigForGame(game: FeaturedGame, beliefRows: BeliefRow[]): AnnotationConfig {
  const tier1Side = beliefRows[0]?.tier1_side ?? null;
  return {
    manifestUrl: `game:${game.roomId}`,
    gameIndexForSampleId: () => game.gameIndex ?? 0,
    tier1ColorForSampleId: () => tier1Side,
  };
}
async function fetchGameArtifacts(
  roomId: string,
  type: GameArtifactType,
): Promise<GameArtifactPayload[]> {
  const url = new URL(`/api/games/${encodeURIComponent(roomId)}/artifacts`, window.location.origin);
  url.searchParams.set('type', type);
  const resp = await fetch(url.pathname + url.search);
  if (resp.status === 404 || resp.status === 403) return [];
  if (!resp.ok) throw new Error(`failed to load ${type} artifacts for ${roomId}: ${resp.status}`);
  const data = await resp.json() as { artifacts: GameArtifactPayload[] };
  return data.artifacts;
}

async function fetchTraceArtifacts(roomId: string): Promise<GameArtifactPayload[]> {
  const groups = await Promise.all([
    fetchGameArtifacts(roomId, 'trace-row'),
    fetchGameArtifacts(roomId, 'engine-move-choice'),
  ]);
  return groups
    .flat()
    .sort((left, right) => (
      (left.ply ?? Number.MAX_SAFE_INTEGER) - (right.ply ?? Number.MAX_SAFE_INTEGER)
      || left.id - right.id
    ));
}

function beliefRowFromArtifact(game: FeaturedGame, artifact: GameArtifactPayload): BeliefRow {
  const payload = artifact.payload;
  const side = colorValue(payload.tier1_side) ?? artifact.engineColor ?? 'white';
  const snapshotKind = snapshotKindValue(payload.snapshot_kind);
  return {
    ...(payload as Partial<BeliefRow>),
    game_index: numberValue(payload.game_index) ?? game.gameIndex ?? 0,
    tier1_seat: stringValue(payload.tier1_seat) ?? artifact.engineColor ?? side,
    tier1_side: side,
    ply: numberValue(payload.ply) ?? artifact.ply ?? 0,
    snapshot_kind: snapshotKind ?? undefined,
    decision_path: stringValue(payload.decision_path) ?? artifact.artifactType,
    particle_count: numberValue(payload.particle_count) ?? 0,
    particle_count_unique: numberValue(payload.particle_count_unique) ?? numberValue(payload.particle_count) ?? 0,
    opp_remaining_counts: recordValue(payload.opp_remaining_counts) as BeliefRow['opp_remaining_counts'],
    last_constraint_pruned: numberValue(payload.last_constraint_pruned) ?? 0,
    marginal_field: recordValue(payload.marginal_field) as BeliefRow['marginal_field'],
    top_k_clusters: Array.isArray(payload.top_k_clusters) ? payload.top_k_clusters as BeliefRow['top_k_clusters'] : [],
  };
}

function traceRowFromArtifact(game: FeaturedGame, artifact: GameArtifactPayload): TraceRow {
  const payload = artifact.payload;
  const side = colorValue(payload.tier1_side) ?? artifact.engineColor ?? 'white';
  return {
    ...(payload as Partial<TraceRow>),
    game_index: numberValue(payload.game_index) ?? game.gameIndex ?? 0,
    tier1_seat: stringValue(payload.tier1_seat) ?? artifact.engineColor ?? side,
    tier1_side: side,
    ply: numberValue(payload.ply) ?? artifact.ply ?? 0,
    decision_path: stringValue(payload.decision_path) ?? artifact.artifactType,
    move_chosen_uci: moveUciFromPayload(payload),
  };
}

function colorValue(value: unknown): 'white' | 'black' | null {
  return value === 'white' || value === 'black' ? value : null;
}

function snapshotKindValue(value: unknown): BeliefRow['snapshot_kind'] | null {
  return value === 'decision' || value === 'after-own-move' || value === 'after-opp-move' ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recordValue(value: unknown): Record<string, never> | Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function moveUciFromPayload(payload: Record<string, unknown>): string {
  const explicit = stringValue(payload.move_chosen_uci);
  if (explicit) return explicit;
  const selectedMove = recordValue(payload.selected_move);
  const from = stringValue(selectedMove.from);
  const to = stringValue(selectedMove.to);
  if (!from || !to) return '';
  return `${from}${to}${stringValue(selectedMove.promotion) ?? ''}`;
}

async function fetchLandingGames(): Promise<{ games: FeaturedGame[]; source: LandingGameSource }> {
  const recentGames = await fetchRecentGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (recentGames.length > 0) return { games: recentGames, source: 'recent' };
  const eveGames = await fetchRecentEveGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (eveGames.length > 0) return { games: eveGames, source: 'eve' };
  const featuredGames = await fetchFeaturedGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (featuredGames.length > 0) return { games: featuredGames, source: 'featured' };
  return { games: staticSampleGames(), source: 'sample' };
}

async function fetchGameSummary(roomId: string): Promise<FeaturedGame | null> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load game summary for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { game: FeaturedGame };
  return data.game;
}

async function fetchFeaturedGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/featured-games');
  if (!resp.ok) throw new Error(`failed to load featured games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchRecentGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/games/recent');
  if (!resp.ok) throw new Error(`failed to load recent games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchRecentEveGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/eve-games/recent');
  if (!resp.ok) throw new Error(`failed to load recent EvE games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchPlayableEngines(): Promise<PlayableEngine[]> {
  const resp = await fetch('/api/engines/playable');
  if (!resp.ok) throw new Error(`failed to load playable engines: ${resp.status}`);
  const data = (await resp.json()) as { engines: PlayableEngine[] };
  return data.engines.length > 0 ? data.engines : fallbackPlayableEngines();
}

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) throw new Error(`failed to load account: ${resp.status}`);
  const data = (await resp.json()) as { user: AuthUser | null };
  return data.user;
}

async function fetchUserProfile(handle: string): Promise<UserProfile | null> {
  const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/profile`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load profile: ${resp.status}`);
  const data = (await resp.json()) as { profile: UserProfile };
  return data.profile;
}

function fallbackPlayableEngines(): PlayableEngine[] {
  return [{
    id: 'builtin-random-legal',
    name: 'Random Legal v1',
    familyName: 'Random Legal',
    kind: 'builtin',
  }];
}

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

function gameSummaryFromEvents(roomId: string, events: GameEvent[]): FeaturedGame | null {
  const projection = replayGameEvents(events);
  const status = projection.state.status;
  if (status.type !== 'finished') return null;

  return {
    roomId,
    variant: projection.variant,
    mode: modeFromSeats(projection.seats.white, projection.seats.black),
    result: status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw',
    termination: status.reason,
    plyCount: events.filter((event) => event.type === 'move-played').length,
    whiteName: null,
    blackName: null,
    corpusId: null,
    participants: [
      participantFromSeat('white', projection.seats.white, null),
      participantFromSeat('black', projection.seats.black, null),
    ],
  };
}

function modeFromSeats(whiteClient: string | undefined, blackClient: string | undefined): FeaturedGame['mode'] {
  const whiteEngine = isEngineClient(whiteClient);
  const blackEngine = isEngineClient(blackClient);
  if (whiteEngine && blackEngine) return 'eve';
  if (whiteEngine || blackEngine) return 'pve';
  return 'pvp';
}

function isEngineClient(clientId: string | undefined): boolean {
  return !!clientId && (
    clientId === 'random-engine'
    || clientId === 'engine:white'
    || clientId === 'engine:black'
    || clientId.startsWith('engine:')
    || clientId.startsWith('builtin-')
    || clientId.startsWith('python-')
  );
}

function participantFromSeat(
  color: 'white' | 'black',
  clientId: string | undefined,
  fallbackName: string | null,
): GameParticipant {
  if (isEngineClient(clientId)) {
    const subjectId = canonicalEngineId(clientId!);
    return {
      color,
      displayName: fallbackName ?? subjectId,
      subjectType: 'engine-version',
      subjectId,
      visibility: 'public',
    };
  }
  return {
    color,
    displayName: fallbackName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'public',
  };
}

function canonicalEngineId(clientId: string): string {
  if (clientId === 'random-engine') return 'builtin-random-legal';
  return clientId;
}

async function landingEventLoader(roomId: string): Promise<GameEvent[]> {
  const apiEvents = await apiEventLoader(roomId).catch(() => null);
  if (apiEvents) return apiEvents;
  return fetchStaticSample(roomId);
}

async function fetchStaticSample(sampleId: string): Promise<GameEvent[]> {
  const safeId = sampleId.replace(/[^a-zA-Z0-9_-]/g, '');
  const resp = await fetch(`/replay-samples/${safeId}.jsonl`);
  if (!resp.ok) throw new Error(`failed to load replay sample ${safeId}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

function staticSampleGames(): FeaturedGame[] {
  return Array.from({ length: 7 }, (_, index) => ({
    roomId: `sample-${index + 1}`,
    variant: 'fog-of-war',
    mode: 'manual',
    result: index % 3 === 0 ? 'white-wins' : index % 3 === 1 ? 'black-wins' : 'draw',
    termination: index % 3 === 2 ? 'draw' : 'king-captured',
    plyCount: 24 + index * 3,
    whiteName: 'White',
    blackName: 'Black',
    corpusId: 'replay-samples',
    participants: [
      {
        color: 'white',
        displayName: 'White',
        subjectType: 'manual',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Black',
        subjectType: 'manual',
        subjectId: null,
        visibility: 'public',
      },
    ],
  }));
}

function gameMetaForGame(game: FeaturedGame): GameMeta {
  return {
    whiteName: displayParticipantName(game, 'white'),
    blackName: displayParticipantName(game, 'black'),
    gameUrl: reviewUrlForGame(game),
    modeLabel: sourceLabel(game.mode),
    result: game.result,
    timeControl: game.timeControl,
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

function reviewUrlForGame(game: FeaturedGame): string | null {
  if (game.corpusId === 'replay-samples') return null;
  return `/game/${encodeURIComponent(game.roomId)}`;
}

function renderAccountShell(shell: HTMLElement, user: AuthUser | null): void {
  shell.replaceChildren(user ? buildSignedInAccount(user, shell) : buildLoginForm(shell));
}

function buildSignedInAccount(user: AuthUser, shell: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Signed in';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = user.displayName;

  const meta = document.createElement('p');
  meta.className = 'account-copy';
  meta.textContent = `@${user.handle}`;

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const profile = document.createElement('a');
  profile.className = 'landing-setup-start';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = 'View profile';

  const settings = document.createElement('a');
  settings.className = 'landing-setup-back';
  settings.href = '/account/settings';
  settings.textContent = 'Settings';

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'landing-setup-back';
  logout.textContent = 'Log out';
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    await fetch('/api/auth/logout', { method: 'POST' });
    const next = await fetchCurrentUser().catch(() => null);
    renderAccountShell(shell, next);
  });

  actions.append(profile, settings, logout);
  panel.append(eyebrow, title, meta, actions);
  return panel;
}

function renderAccountSettingsShell(shell: HTMLElement, user: AuthUser | null): void {
  shell.replaceChildren(user ? buildAccountSettings(user, shell) : buildLoginForm(shell, renderAccountSettingsShell));
}

function buildAccountSettings(user: AuthUser, shell: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel account-settings-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Settings';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Public profile';

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent = 'Email signs you in. Your handle and display name are public.';

  const form = document.createElement('form');
  form.className = 'account-settings-form';

  const displayName = labeledInput('Display name', 'displayName', user.displayName, 'Brian Hliou');
  displayName.input.maxLength = 40;
  displayName.input.required = true;
  displayName.help.textContent = 'Shown on your public profile and game history.';

  const handle = labeledInput('Handle', 'handle', user.handle, 'brianhliou');
  handle.input.maxLength = 24;
  handle.input.pattern = '[a-zA-Z0-9][a-zA-Z0-9_-]{1,22}[a-zA-Z0-9]';
  handle.input.required = true;
  handle.help.textContent = handleHelpText(user);

  const email = labeledInput('Email', 'email', user.email, '');
  email.input.disabled = true;
  email.help.textContent = 'Private login address. Not shown on your public profile.';

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'landing-setup-start';
  save.textContent = 'Save';

  const account = document.createElement('a');
  account.className = 'landing-setup-back';
  account.href = '/account';
  account.textContent = 'Account';

  const profile = document.createElement('a');
  profile.className = 'landing-setup-back';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = 'View profile';

  actions.append(save, profile, account);
  form.append(displayName.wrap, handle.wrap, email.wrap, actions, status);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const resp = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.input.value,
          handle: handle.input.value,
        }),
      });
      const data = await resp.json() as { user?: AuthUser; error?: string; availableAt?: string };
      if (!resp.ok || !data.user) {
        throw new Error(accountSettingsErrorMessage(data.error, data.availableAt));
      }
      displayName.input.value = data.user.displayName;
      handle.input.value = data.user.handle;
      handle.help.textContent = handleHelpText(data.user);
      email.input.value = data.user.email;
      profile.href = `/@/${encodeURIComponent(data.user.handle)}`;
      status.textContent = 'Profile saved.';
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not save profile.';
    } finally {
      save.disabled = false;
    }
  });

  panel.append(eyebrow, title, copy, form);
  return panel;
}

function labeledInput(
  labelText: string,
  name: string,
  value: string,
  placeholder: string,
): { help: HTMLSpanElement; input: HTMLInputElement; wrap: HTMLLabelElement } {
  const wrap = document.createElement('label');
  wrap.className = 'account-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.name = name;
  input.value = value;
  input.placeholder = placeholder;
  const help = document.createElement('span');
  help.className = 'account-field-help';
  wrap.append(label, input, help);
  return { help, input, wrap };
}

function accountSettingsErrorMessage(error: string | undefined, availableAt: string | undefined): string {
  if (error === 'invalid_handle') return 'Use 3-24 letters, numbers, underscores, or dashes.';
  if (error === 'invalid_display_name') return 'Display name must be 1-40 characters.';
  if (error === 'handle_taken') return 'That handle is not available.';
  if (error === 'handle_change_cooldown') {
    const date = availableAt ? new Date(availableAt) : null;
    return date && Number.isFinite(date.getTime())
      ? `Handle can be changed again on ${date.toLocaleDateString()}.`
      : 'Handle cannot be changed again yet.';
  }
  if (error === 'not_signed_in') return 'Sign in before editing your profile.';
  return 'Could not save profile.';
}

function handleHelpText(user: AuthUser): string {
  if (!user.handleChangedAt) {
    return 'Used in your profile URL. Your first handle change is available now.';
  }
  const nextChangeAt = new Date(new Date(user.handleChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(nextChangeAt.getTime())) {
    return 'Used in your profile URL. Later handle changes are limited.';
  }
  return `Used in your profile URL. Next handle change: ${nextChangeAt.toLocaleDateString()}.`;
}

function buildLoginForm(
  shell: HTMLElement,
  onAuth: (shell: HTMLElement, user: AuthUser) => void = renderAccountShell,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Account';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Sign in';

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent = 'One email code. No password.';

  const form = document.createElement('form');
  form.className = 'account-form';

  const email = document.createElement('input');
  email.type = 'email';
  email.name = 'email';
  email.autocomplete = 'email';
  email.placeholder = 'Email address';
  email.required = true;

  const code = document.createElement('input');
  code.type = 'text';
  code.name = 'code';
  code.inputMode = 'numeric';
  code.autocomplete = 'one-time-code';
  code.placeholder = 'Login code';
  code.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'landing-setup-start';
  submit.textContent = 'Send code';

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  let loginId: string | null = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      if (!loginId) {
        const resp = await fetch('/api/auth/email/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.value }),
        });
        const data = await resp.json() as { loginId?: string; devCode?: string; error?: string };
        if (!resp.ok || !data.loginId) throw new Error(data.error ?? `start failed: ${resp.status}`);
        loginId = data.loginId;
        code.hidden = false;
        code.required = true;
        if (data.devCode) code.value = data.devCode;
        submit.textContent = 'Confirm';
        status.textContent = data.devCode ? 'Development code filled in.' : 'Check your email for the login code.';
        code.focus();
      } else {
        const resp = await fetch('/api/auth/email/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ loginId, code: code.value }),
        });
        const data = await resp.json() as { user?: AuthUser; error?: string };
        if (!resp.ok || !data.user) throw new Error(data.error ?? `confirm failed: ${resp.status}`);
        onAuth(shell, data.user);
      }
    } catch (err) {
      status.textContent = err instanceof Error ? authErrorMessage(err.message) : 'Sign in failed.';
    } finally {
      submit.disabled = false;
    }
  });

  form.append(email, code, submit, status);
  panel.append(eyebrow, title, copy, form);
  return panel;
}

function authErrorMessage(value: string): string {
  if (value === 'email_delivery_not_configured') return 'Email login is not configured in this runtime.';
  if (value === 'email_delivery_failed') return 'Email delivery failed. Try again in a moment.';
  if (value === 'persistence_disabled') return 'Accounts require the persistent server.';
  if (value === 'invalid_login_code') return 'The login code was invalid or expired.';
  if (value === 'invalid_email') return 'Enter a valid email address.';
  return 'Sign in failed.';
}

function buildProfileHeader(profile: UserProfile): HTMLElement {
  const header = document.createElement('section');
  header.className = 'profile-header';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = profile.isViewer ? 'Your profile' : 'Player profile';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = profile.user.displayName;

  const meta = document.createElement('p');
  meta.className = 'account-copy';
  meta.textContent = `@${profile.user.handle} · ${profile.games.length} ${profile.games.length === 1 ? 'game' : 'games'}`;

  header.append(eyebrow, title, meta);
  return header;
}

function buildProfileGames(games: FeaturedGame[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

  const heading = document.createElement('h2');
  heading.textContent = 'Games';
  section.append(heading);

  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No account games yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-game-list';
  for (const game of games) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/game/${encodeURIComponent(game.roomId)}`;
    link.className = 'profile-game-row';

    const main = document.createElement('span');
    main.className = 'profile-game-main';

    const outcome = document.createElement('strong');
    outcome.textContent = profileResultLabel(game);

    const opponent = document.createElement('span');
    opponent.textContent = `vs ${profileOpponentName(game)}`;
    main.append(outcome, opponent);

    const meta = document.createElement('span');
    meta.className = 'profile-game-meta';
    meta.textContent = `${profileSideLabel(game)} · ${sourceLabel(game.mode)} · ${game.plyCount} plies · ${formatGameDate(game.endedAt)}`;

    link.append(main, meta);
    item.append(link);
    list.append(item);
  }
  section.append(list);
  return section;
}

function profileOpponentName(game: FeaturedGame): string {
  const color = game.playerColor ?? 'white';
  return displayParticipantName(game, color === 'white' ? 'black' : 'white');
}

function profileSideLabel(game: FeaturedGame): string {
  if (game.playerColor === 'black') return 'Black';
  return 'White';
}

function profileResultLabel(game: FeaturedGame): string {
  if (game.result === 'draw') return 'Draw';
  if (game.playerColor === 'black') return game.result === 'black-wins' ? 'Win' : 'Loss';
  return game.result === 'white-wins' ? 'Win' : 'Loss';
}

function formatGameDate(value: string | undefined): string {
  if (!value) return 'Finished game';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Finished game';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function displayParticipantName(game: FeaturedGame, color: 'white' | 'black'): string {
  const participant = participantForColor(game, color);
  if (participant) return displayParticipant(participant.displayName, color === 'white' ? 'White' : 'Black', participant.subjectId);
  const fallback = color === 'white' ? 'White' : 'Black';
  const legacyName = color === 'white'
    ? game.whiteEngineId ?? game.whiteName
    : game.blackEngineId ?? game.blackName;
  return displayParticipant(legacyName, fallback);
}

function participantForColor(game: FeaturedGame, color: 'white' | 'black'): GameParticipant | null {
  return game.participants?.find((participant) => participant.color === color) ?? null;
}

function displayParticipant(name: string | null | undefined, fallback: string, subjectId?: string | null): string {
  const detailed = engineDisplayName(subjectId ?? name);
  if (detailed) return detailed;
  if (!name) return fallback;
  return name;
}

function sourceLabel(mode: FeaturedGame['mode']): string {
  if (mode === 'eve') return 'Engine vs engine';
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'pvp') return 'Human vs human';
  if (mode === 'imported') return 'Imported game';
  if (mode === 'manual') return 'Manual game';
  return 'Fog of War game';
}

function initialGamePly(): number {
  const value = new URLSearchParams(window.location.search).get('ply');
  if (!value) return 0;
  const ply = Number.parseInt(value, 10);
  return Number.isFinite(ply) ? ply : 0;
}

function syncGamePlyUrl(ply: number): void {
  const url = new URL(window.location.href);
  if (ply <= 0) {
    url.searchParams.delete('ply');
  } else {
    url.searchParams.set('ply', String(ply));
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function mountAbout(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'about-route');
  root.append(buildNav(), buildAbout(), buildFooter());
}

export function mountSource(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'source-route');
  root.append(buildNav(), buildSource(), buildFooter());
}

export function mountLearn(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  const learn = buildLearn();
  root.append(buildNav(), learn.el, buildFooter());
  mountLearnBoard(learn.boardEl);
}

function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';
  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'MISTBOARD';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const watchLink = navLink('Watch', '/watch');
  const leaderboardLink = navLink('Ratings', '/leaderboard');
  links.append(watchLink, leaderboardLink);

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';
  const accountLink = navLink('Account', '/account');

  if (SHOW_ENGINE_LAB_LINKS) {
    const labLink = navLink('Lab', '/lab');
    utilities.append(labLink);
  }
  utilities.append(accountLink);
  nav.append(brand, links, utilities);
  return nav;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = 'site-nav-link';
  const path = currentPath();
  if (path === href || (href === '/account' && path.startsWith('/account/'))) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function buildLoadingState(label: string): HTMLElement {
  const section = document.createElement('main');
  section.className = 'site-loading';
  section.setAttribute('aria-live', 'polite');

  const mark = document.createElement('div');
  mark.className = 'site-loading-mark';
  mark.setAttribute('aria-hidden', 'true');

  const text = document.createElement('p');
  text.textContent = label;

  section.append(mark, text);
  return section;
}

function buildLandingStage(engines: PlayableEngine[]): { el: HTMLElement; replayRoot: HTMLElement; leaderboardRoot: HTMLElement } {
  const stage = document.createElement('main');
  stage.className = 'landing-stage';

  const playPanel = buildLandingPlayPanel(engines, { showLobbyRequests: true });

  const section = document.createElement('section');
  section.className = 'landing-demo';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  const leaderboardRoot = buildLandingLeaderboardPanel();
  section.append(playPanel, replayRoot, leaderboardRoot);

  stage.append(section);
  return { el: stage, replayRoot, leaderboardRoot };
}

function buildLandingLeaderboardPanel(): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-leaderboard-panel';
  panel.setAttribute('aria-label', 'Top rated players');

  const header = document.createElement('div');
  header.className = 'landing-leaderboard-header';
  const title = document.createElement('strong');
  title.textContent = 'Top rated';
  const more = document.createElement('a');
  more.href = '/leaderboard';
  more.textContent = 'See all';
  more.className = 'landing-leaderboard-more';
  header.append(title, more);

  const list = document.createElement('ol');
  list.className = 'landing-leaderboard-list';
  list.setAttribute('data-state', 'loading');

  const placeholder = document.createElement('li');
  placeholder.className = 'landing-leaderboard-empty';
  placeholder.textContent = 'Loading…';
  list.append(placeholder);

  panel.append(header, list);
  return panel;
}

async function populateLandingLeaderboard(panel: HTMLElement): Promise<void> {
  const list = panel.querySelector<HTMLOListElement>('.landing-leaderboard-list');
  if (!list) return;

  type LeaderboardEntry = { rank: number; handle: string; displayName: string; eloRating: number };
  const data = await fetch('/api/leaderboard?limit=10')
    .then((r) => (r.ok ? (r.json() as Promise<{ leaderboard: LeaderboardEntry[] }>) : Promise.reject(r.status)))
    .catch((err) => {
      console.warn(err);
      return null;
    });

  list.replaceChildren();

  if (!data || data.leaderboard.length === 0) {
    list.setAttribute('data-state', 'empty');
    const empty = document.createElement('li');
    empty.className = 'landing-leaderboard-empty';
    empty.textContent = data ? 'No rated games yet.' : 'Unavailable.';
    list.append(empty);
    return;
  }

  list.setAttribute('data-state', 'ready');
  for (const entry of data.leaderboard) {
    const row = document.createElement('li');
    row.className = 'landing-leaderboard-row';

    const rank = document.createElement('span');
    rank.className = 'landing-leaderboard-rank';
    rank.textContent = String(entry.rank);

    const name = document.createElement('a');
    name.className = 'landing-leaderboard-name';
    name.href = `/@/${encodeURIComponent(entry.handle)}`;
    name.textContent = entry.displayName;

    const rating = document.createElement('span');
    rating.className = 'landing-leaderboard-rating';
    rating.textContent = String(entry.eloRating);

    row.append(rank, name, rating);
    list.append(row);
  }
}

function buildLandingPlayPanel(engines: PlayableEngine[], options: { showLobbyRequests?: boolean } = {}): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-play-panel';
  panel.setAttribute('aria-label', 'Start playing');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;
  const lobbyButton = landingPlayAction('Find opponent', 'lobby');
  const challengeButton = landingPlayAction('Challenge a friend', 'friend');
  const engineButton = landingPlayAction('Play against computer', 'computer');

  lobbyButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'lobby',
      title: 'Find opponent',
    });
  });
  challengeButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'pvp',
      title: 'Challenge a friend',
    });
  });
  engineButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      engines: availableEngines,
      mode: 'pve',
      title: 'Play against computer',
    });
  });

  panel.append(lobbyButton, challengeButton, engineButton);
  if (options.showLobbyRequests) {
    panel.append(buildLobbyRequestsWindow());
  }
  return panel;
}

function landingPlayAction(label: string, icon: 'computer' | 'friend' | 'lobby'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-play-action landing-play-action-${icon}`;
  const iconEl = document.createElement('span');
  iconEl.className = 'landing-play-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  const labelEl = document.createElement('span');
  labelEl.className = 'landing-play-action-label';
  labelEl.textContent = label;
  button.append(iconEl, labelEl);
  return button;
}

function buildLobbyRequestsWindow(): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'landing-lobby-requests';
  shell.setAttribute('aria-label', 'Open pairing requests');

  const header = document.createElement('div');
  header.className = 'landing-lobby-requests-header';
  const title = document.createElement('strong');
  title.textContent = 'Open requests';
  const count = document.createElement('span');
  count.textContent = 'Checking';
  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'landing-lobby-requests-list';

  shell.append(header, list);

  const render = (requests: OpenLobbyRequest[]) => {
    count.textContent = requests.length === 1 ? '1 waiting' : `${requests.length} waiting`;
    list.replaceChildren();
    if (requests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'No open requests right now.';
      list.append(empty);
      return;
    }
    for (const request of requests) {
      list.append(lobbyRequestRow(request));
    }
  };

  const refresh = async () => {
    try {
      const requests = await fetchOpenLobbyRequests();
      render(requests);
    } catch (err) {
      console.warn(err);
      count.textContent = 'Unavailable';
      list.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'Open requests could not load.';
      list.append(empty);
    }
  };

  void refresh();
  const refreshTimer = window.setInterval(() => {
    if (!document.body.contains(shell)) {
      window.clearInterval(refreshTimer);
      return;
    }
    void refresh();
  }, 3_000);

  return shell;
}

function lobbyRequestRow(request: OpenLobbyRequest): HTMLElement {
  const row = document.createElement('div');
  row.className = 'landing-lobby-request-row';

  const details = document.createElement('div');
  details.className = 'landing-lobby-request-details';

  const primary = document.createElement('span');
  primary.textContent = `${formatTimeControl(request.timeControl)} ${request.hiddenDraft960 ? 'Draft960' : 'Standard'}`;
  const secondary = document.createElement('small');
  secondary.textContent = `${formatWaitAge(request.waitingMs)} waiting`;
  details.append(primary, secondary);

  const join = document.createElement('button');
  join.type = 'button';
  join.textContent = 'Join';
  join.addEventListener('click', () => {
    join.disabled = true;
    join.textContent = 'Joining';
    const status = document.createElement('span');
    const setup: LandingRoomSetup = {
      startFormat: request.hiddenDraft960 ? 'draft960' : 'standard',
      timeControl: request.timeControl,
    };
    joinLobbyFromPlay(join, setup, status);
  });

  row.append(details, join);
  return row;
}

async function fetchOpenLobbyRequests(): Promise<OpenLobbyRequest[]> {
  const response = await fetch('/api/lobby');
  if (!response.ok) throw new Error(`lobby requests failed: ${response.status}`);
  const data = await response.json() as { requests?: OpenLobbyRequest[] };
  return Array.isArray(data.requests) ? data.requests : [];
}

function formatTimeControl(timeControl: OpenLobbyRequest['timeControl']): string {
  const minutes = timeControl.initialMs / 60_000;
  const increment = timeControl.incrementMs / 1000;
  const minuteLabel = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${minuteLabel} + ${increment}`;
}

function formatWaitAge(waitingMs: number): string {
  const seconds = Math.max(0, Math.floor(waitingMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function openLandingSetupDialog(choice: LandingPlayChoice): void {
  const existing = document.querySelector('.landing-setup-overlay');
  existing?.remove();

  let startFormat: LandingStartFormat = 'standard';
  let selectedPreset: LandingTimePresetId = '3m2';
  let selectedEngineId = choice.engineId;
  const defaultPreset = LANDING_TIME_PRESETS.find((preset) => preset.id === selectedPreset)!;

  const overlay = document.createElement('div');
  overlay.className = 'landing-setup-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'landing-setup-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'landing-setup-title');

  const heading = document.createElement('strong');
  heading.className = 'landing-setup-title';
  heading.id = 'landing-setup-title';
  heading.textContent = choice.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'landing-setup-close';
  closeButton.setAttribute('aria-label', 'Close setup');
  closeButton.textContent = 'x';

  const header = document.createElement('div');
  header.className = 'landing-setup-header';
  header.append(heading, closeButton);

  const variantSection = document.createElement('div');
  variantSection.className = 'landing-setup-section';
  variantSection.append(setupSectionLabel('Variant'));

  const variantControl = document.createElement('div');
  variantControl.className = 'landing-variant-control';
  variantControl.textContent = 'Fog of War';
  variantSection.append(variantControl);

  const engineSection = choice.mode === 'pve' ? buildEngineSetupSection(choice.engines ?? fallbackPlayableEngines(), selectedEngineId, (engineId) => {
    selectedEngineId = engineId;
  }) : null;

  const startSection = document.createElement('div');
  startSection.className = 'landing-setup-section';
  startSection.append(setupSectionLabel('Fog start'));

  const startGroup = document.createElement('div');
  startGroup.className = 'landing-start-options';
  startGroup.setAttribute('role', 'radiogroup');
  startGroup.setAttribute('aria-label', 'Fog start format');

  const standardButton = startOptionButton('Standard', true);
  const draftButton = startOptionButton('Draft960', false);
  const syncOptions = () => {
    standardButton.classList.toggle('selected', startFormat === 'standard');
    standardButton.setAttribute('aria-checked', startFormat === 'standard' ? 'true' : 'false');
    draftButton.classList.toggle('selected', startFormat === 'draft960');
    draftButton.setAttribute('aria-checked', startFormat === 'draft960' ? 'true' : 'false');
  };
  standardButton.addEventListener('click', () => {
    startFormat = 'standard';
    syncOptions();
  });
  draftButton.addEventListener('click', () => {
    startFormat = 'draft960';
    syncOptions();
  });
  startGroup.append(standardButton, draftButton);
  startSection.append(startGroup);

  const timeSection = document.createElement('div');
  timeSection.className = 'landing-setup-section';
  timeSection.append(setupSectionLabel('Time control'));

  const presetGroup = document.createElement('div');
  presetGroup.className = 'landing-time-presets';
  presetGroup.setAttribute('role', 'radiogroup');
  presetGroup.setAttribute('aria-label', 'Time control');

  const customFields = document.createElement('div');
  customFields.className = 'landing-custom-time';

  const minutesInput = customTimeInput('Minutes', defaultPreset.initialMs / 60_000);
  const incrementInput = customTimeInput('Increment', defaultPreset.incrementMs / 1000);
  customFields.append(minutesInput.label, minutesInput.input, incrementInput.label, incrementInput.input);

  const presetButtons = LANDING_TIME_PRESETS.map((preset) => {
    const button = startOptionButton(preset.label, preset.id === selectedPreset);
    button.addEventListener('click', () => {
      selectedPreset = preset.id;
      if (preset.id !== 'custom') {
        minutesInput.input.value = String(preset.initialMs / 60_000);
        incrementInput.input.value = String(preset.incrementMs / 1000);
      }
      syncTimeControls();
    });
    presetGroup.append(button);
    return { button, preset };
  });

  const syncTimeControls = () => {
    for (const { button, preset } of presetButtons) {
      const selected = selectedPreset === preset.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
    customFields.hidden = selectedPreset !== 'custom';
  };
  minutesInput.input.addEventListener('input', () => {
    selectedPreset = 'custom';
    syncTimeControls();
  });
  incrementInput.input.addEventListener('input', () => {
    selectedPreset = 'custom';
    syncTimeControls();
  });
  syncTimeControls();
  timeSection.append(presetGroup, customFields);

  const actions = document.createElement('div');
  actions.className = 'landing-setup-actions';

  const status = document.createElement('p');
  status.className = 'landing-setup-status';
  status.setAttribute('aria-live', 'polite');

  let cancelLobbyWait: (() => void) | null = null;
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'landing-setup-start';
  startButton.textContent = choice.mode === 'lobby' ? 'Find opponent' : choice.mode === 'pvp' ? 'Create room' : 'Start game';
  startButton.addEventListener('click', () => {
    const setup = selectedRoomSetup(startFormat, selectedPreset, minutesInput.input, incrementInput.input);
    if (choice.mode === 'lobby') {
      cancelLobbyWait?.();
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status);
      return;
    }
    void createRoomFromPlay(startButton, choice.mode, selectedEngineId, setup);
  });

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'landing-setup-back';
  backButton.textContent = 'Cancel';

  const close = () => {
    cancelLobbyWait?.();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  backButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  actions.append(startButton, backButton);
  dialog.append(header, variantSection);
  if (engineSection) dialog.append(engineSection);
  dialog.append(startSection, timeSection, status, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  standardButton.focus();
}

function buildEngineSetupSection(
  engines: PlayableEngine[],
  selectedEngineId: string | undefined,
  onSelect: (engineId: string) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Engine'));

  const select = document.createElement('select');
  select.className = 'landing-engine-select';
  select.setAttribute('aria-label', 'Engine');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  for (const engine of availableEngines) {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    select.append(option);
  }

  const fallbackEngineId = availableEngines[0]?.id;
  select.value = selectedEngineId && availableEngines.some((engine) => engine.id === selectedEngineId)
    ? selectedEngineId
    : fallbackEngineId ?? '';
  if (select.value) onSelect(select.value);
  select.addEventListener('change', () => onSelect(select.value));

  section.append(select);
  return section;
}

function setupSectionLabel(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'landing-setup-label';
  label.textContent = text;
  return label;
}

function customTimeInput(labelText: string, value: number): { label: HTMLLabelElement; input: HTMLInputElement } {
  const id = `landing-time-${labelText.toLowerCase()}`;
  const label = document.createElement('label');
  label.className = 'landing-custom-time-label';
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement('input');
  input.id = id;
  input.type = 'number';
  input.min = labelText === 'Minutes' ? '0.17' : '0';
  input.max = labelText === 'Minutes' ? '180' : '60';
  input.step = labelText === 'Minutes' ? '0.5' : '1';
  input.value = String(value);

  return { label, input };
}

function selectedRoomSetup(
  startFormat: LandingStartFormat,
  presetId: LandingTimePresetId,
  minutesInput: HTMLInputElement,
  incrementInput: HTMLInputElement,
): LandingRoomSetup {
  const preset = LANDING_TIME_PRESETS.find((candidate) => candidate.id === presetId);
  if (preset && preset.id !== 'custom') {
    return {
      startFormat,
      timeControl: {
        initialMs: preset.initialMs,
        incrementMs: preset.incrementMs,
      },
    };
  }

  const minutes = boundedNumber(minutesInput.valueAsNumber, 10 / 60, 180);
  const incrementSeconds = boundedNumber(incrementInput.valueAsNumber, 0, 60);
  return {
    startFormat,
    timeControl: {
      initialMs: Math.round(minutes * 60_000),
      incrementMs: Math.round(incrementSeconds * 1000),
    },
  };
}

function boundedNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function startOptionButton(label: string, selected: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');
  button.textContent = label;
  return button;
}

function buildWatchSection(): { el: HTMLElement; replayRoot: HTMLElement; listRoot: HTMLElement } {
  const section = document.createElement('main');
  section.className = 'watch-shell';

  const listRoot = document.createElement('aside');
  listRoot.className = 'landing-games watch-games';

  const replayRoot = document.createElement('div');
  replayRoot.className = 'watch-replay';

  section.append(listRoot, replayRoot);
  return { el: section, replayRoot, listRoot };
}

function buildNotice(titleText: string, bodyText: string): HTMLElement {
  const notice = document.createElement('section');
  notice.className = 'site-section game-notice';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  notice.append(heading, body);
  return notice;
}

function renderRecentGames(
  root: HTMLElement,
  games: FeaturedGame[],
  source: LandingGameSource,
  activeRoomId?: string,
  hrefPrefix = '/?demo=',
  headingText?: string,
  clickable = true,
  limit = 10,
): void {
  root.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'landing-games-heading';
  heading.textContent = headingText ?? (
    source === 'recent' ? 'Recent games' : source === 'eve' ? 'Recent EvE' : source === 'sample' ? 'Replay samples' : 'Featured games'
  );
  root.append(heading);

  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No games yet.';
    root.append(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'landing-games-list';

  for (const game of games.slice(0, limit)) {
    const item = document.createElement('li');
    const row = clickable ? document.createElement('a') : document.createElement('div');
    row.className = 'landing-game-row';
    if (clickable) {
      (row as HTMLAnchorElement).href = `${hrefPrefix}${encodeURIComponent(game.roomId)}`;
    }
    if (game.roomId === activeRoomId) row.classList.add('active');

    const matchup = document.createElement('span');
    matchup.className = 'landing-game-matchup';
    matchup.textContent = `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;

    const meta = document.createElement('span');
    meta.className = 'landing-game-meta';
    const result = document.createElement('span');
    result.className = 'landing-game-result';
    result.textContent = resultLabel(game.result);
    const detail = document.createElement('span');
    detail.textContent = `${sourceLabel(game.mode)} · ${game.plyCount} plies · ${terminationLabel(game.termination)}`;
    meta.append(result, detail);

    row.append(matchup, meta);
    item.append(row);
    list.append(item);
  }

  root.append(list);
}

function engineDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const known: Record<string, string> = {
    'builtin-capture-seeker': 'Capture Seeker v1',
    'builtin-random-legal': 'Random Legal v1',
    'python-random-legal': 'Random Legal Python v1',
    'python-tier1-v0.7.0': 'Tier-1 v0.7.0',
    'python-tier1-v0.7.22': 'Tier-1 v0.7.22',
    'python-tier1-v0.8.9': 'Tier-1 v0.8.9',
  };
  return known[name] ?? null;
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function buildGamePageTitle(game: FeaturedGame): string {
  const white = game.whiteName ?? 'White';
  const black = game.blackName ?? 'Black';
  const result =
    game.result === 'white-wins' ? `${white} beats ${black}` :
    game.result === 'black-wins' ? `${black} beats ${white}` : `${white} vs ${black} · Draw`;
  return `${result} · Fog of War | Mistboard`;
}

function terminationLabel(termination: string): string {
  return termination.replace(/-/g, ' ');
}

function buildAbout(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section about-section';
  section.id = 'about';

  const heading = document.createElement('h2');
  heading.className = 'site-section-heading';
  heading.textContent = 'About Fog of War';

  const p1 = document.createElement('p');
  p1.textContent =
    'Fog of War is hidden-information chess. Each player sees only their own pieces and the squares those pieces could legally move to. The game ends when a king is captured.';

  const p2 = document.createElement('p');
  p2.textContent =
    'Mistboard enforces hidden information at the server. Your opponent’s pieces and moves never reach your browser until your pieces can see them. Most fog implementations send the full board and rely on the UI to hide it — anyone inspecting network traffic can recover hidden information. Mistboard doesn’t.';

  const p3 = document.createElement('p');
  p3.textContent =
    'This project focuses on Fog of War play, replay, reveal, and engines that reason about uncertainty. Open source under GPL-3.0-or-later.';

  section.append(heading, p1, p2, p3);
  return section;
}

function buildSource(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section source-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Source And Licenses';

  const intro = document.createElement('p');
  intro.textContent =
    'Mistboard is an independent open-source Fog of War chess project. The source code is published under GPL-3.0-or-later. The hosted service is not affiliated with lichess, chess.com, or any other chess platform.';

  const source = sourceBlock('Project source', [
    linkLine('GitHub repository', GITHUB_URL),
    textLine('License: GPL-3.0-or-later'),
    textLine('No warranty is provided. See the repository license for the full terms.'),
  ]);

  const thirdParty = sourceBlock('Third-party components', [
    textLine('chessground: board interaction and piece rendering, GPL-3.0-or-later.'),
    textLine('chessops: chess rules primitives, GPL-3.0-or-later.'),
    textLine('Stockfish: optional engine/runtime dependency for research and engine-worker flows, GPL family.'),
  ]);

  const identity = sourceBlock('Project identity', [
    textLine('The Mistboard name, logo, mistboard.com domain, hosted service identity, and official events are controlled project assets.'),
    textLine('Forks are allowed under the GPL, but should use a distinct name and avoid implying they are the official Mistboard service.'),
    textLine('Forks and derivatives should present their own public brand, domain, and hosted service identity.'),
  ]);

  section.append(heading, intro, source, thirdParty, identity);
  return section;
}

function sourceBlock(titleText: string, lines: HTMLElement[]): HTMLElement {
  const block = document.createElement('section');
  block.className = 'source-block';
  const title = document.createElement('h2');
  title.textContent = titleText;
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.append(line);
    list.append(item);
  }
  block.append(title, list);
  return block;
}

function textLine(value: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = value;
  return span;
}

function linkLine(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  link.textContent = label;
  return link;
}

async function createRoomFromPlay(
  button: HTMLButtonElement,
  mode: 'pvp' | 'pve',
  engineId?: string,
  setup: LandingRoomSetup = {
    startFormat: 'standard',
    timeControl: { initialMs: 30_000, incrementMs: 2_000 },
  },
): Promise<void> {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  const originalText = label?.textContent ?? button.textContent ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setButtonLabel(button, 'Creating');
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        variant: 'fog-of-war',
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
        ...(mode === 'pve' && engineId ? { engineId } : {}),
      }),
    });
    if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
    const data = await response.json() as { url?: string };
    if (!data.url) throw new Error('room creation did not return a URL');
    window.location.href = data.url;
  } catch (err) {
    console.warn(err);
    setButtonLabel(button, 'Try again');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  }
}

function joinLobbyFromPlay(
  button: HTMLButtonElement,
  setup: LandingRoomSetup,
  status: HTMLElement,
): () => void {
  const controller = new AbortController();
  const originalText = button.textContent ?? '';
  let active = true;
  let ticketId: string | null = null;
  let pollTimer: number | null = null;

  const cancel = () => {
    active = false;
    controller.abort();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    if (ticketId) {
      void fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const redirectIfMatched = (ticket: LobbyTicketResponse): boolean => {
    if (ticket.status !== 'matched' || !ticket.url) return false;
    window.location.href = ticket.url;
    return true;
  };

  const handleLobbyError = (err: unknown) => {
    if (!active) return;
    console.warn(err);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    setButtonLabel(button, 'Try again');
    status.textContent = 'Could not join the lobby. Try again.';
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  };

  const poll = async () => {
    if (!active || !ticketId) return;
    const response = await fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`lobby poll failed: ${response.status}`);
    const ticket = await response.json() as LobbyTicketResponse;
    if (!active || redirectIfMatched(ticket)) return;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
  };

  const start = async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setButtonLabel(button, 'Waiting');
    status.textContent = 'Waiting for a matching opponent. Keep this tab open.';
    const response = await fetch('/api/lobby', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
      }),
    });
    if (!response.ok) throw new Error(`lobby join failed: ${response.status}`);
    const ticket = await response.json() as LobbyTicketResponse;
    if (!active || redirectIfMatched(ticket)) return;
    if (!ticket.ticketId) throw new Error('lobby did not return a ticket');
    ticketId = ticket.ticketId;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
  };

  void start().catch(handleLobbyError);
  return cancel;
}

function setButtonLabel(button: HTMLButtonElement, text: string): void {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  if (label) {
    label.textContent = text;
  } else {
    button.textContent = text;
  }
}

function buildLearn(): { el: HTMLElement; boardEl: HTMLElement } {
  const section = document.createElement('main');
  section.className = 'learn-shell';

  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Tutorial Fog of War board');
  boardPanel.append(boardEl);

  const panel = document.createElement('section');
  panel.className = 'learn-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = 'Lesson 1 of 4';

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = 'See With Your Pieces';

  const intro = document.createElement('p');
  intro.className = 'learn-copy';
  intro.textContent =
    'In Fog of War, your board is built from your pieces and the squares they can legally move to. Everything else stays hidden.';

  const steps = document.createElement('ol');
  steps.className = 'learn-steps';
  for (const text of [
    'Select a piece to inspect its vision.',
    'Use vision to scout before your king is exposed.',
    'Replay later reveals what both sides could actually see.',
  ]) {
    const item = document.createElement('li');
    item.textContent = text;
    steps.append(item);
  }

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'landing-cta-primary';
  next.disabled = true;
  next.textContent = 'Interactive lessons coming soon';

  const watch = document.createElement('a');
  watch.href = '/watch';
  watch.className = 'landing-cta-secondary';
  watch.textContent = 'Watch games';

  actions.append(next, watch);
  panel.append(progress, heading, intro, steps, actions);
  section.append(boardPanel, panel);
  return { el: section, boardEl };
}

function mountLearnBoard(boardEl: HTMLElement): void {
  const board: Board = {
    a1: { color: 'white', role: 'rook' },
    d1: { color: 'white', role: 'queen' },
    e1: { color: 'white', role: 'king' },
    e4: { color: 'white', role: 'knight' },
  };
  const visibleSquares: Square[] = [
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
    'c3', 'd2', 'f2', 'g3', 'c5', 'd6', 'e4', 'f6', 'g5',
  ];
  const squareClasses = hiddenSquareClasses({
    variant: 'fog-of-war',
    status: { type: 'playing', turn: 'white' },
    visibleSquares,
  } satisfies Pick<PlayerView, 'variant' | 'status' | 'visibleSquares'>);
  for (const square of ['c5', 'd6', 'f6', 'g5'] as const) {
    squareClasses.set(square as cg.Key, `${squareClasses.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  const api = createReadOnlyBoard(boardEl, 'white');
  setBoardPosition(api, board, squareClasses);
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = '© 2026 Mistboard';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'GPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const about = document.createElement('a');
  about.href = '/about';
  about.textContent = 'About';

  const sep2 = document.createElement('span');
  sep2.className = 'site-footer-sep';
  sep2.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  const source = document.createElement('a');
  source.href = '/source';
  source.textContent = 'Source';

  const sep3 = document.createElement('span');
  sep3.className = 'site-footer-sep';
  sep3.textContent = '·';

  right.append(license, sep, about, sep2, source, sep3, gh);
  footer.append(left, right);
  return footer;
}

function pickSample(pool: string[], exclude?: string): string {
  const candidates = exclude ? pool.filter((id) => id !== exclude) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
}
