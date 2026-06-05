import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
  TIME_CONTROLS,
  type TimeControlId,
} from '@mistboard/game';
import {
  classifyTimeControl,
  gameSpecAnalyticsProps,
  gameSpecAnalyticsPropsForId,
  track,
} from './analytics.js';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
import { isRatedModeEnabled } from './rated-flag.js';
import { isVariantEnabled } from './variants.js';
import { ENGINE_OFFER_AFTER_MS, shouldOfferEngine } from './web-utils.js';

export type PlayableEngine = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

type LandingPlayChoice = {
  engineId?: string;
  engines?: PlayableEngine[];
  initialGameSpecId?: LandingGameSpecId;
  mode: 'lobby' | 'pvp' | 'pve';
  ratedDisabled?: boolean;
  title: string;
};
type LandingGameSpecId =
  | typeof DARK_CHESS_SPEC_ID
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID;
type LandingStartFormat = 'standard' | 'draft960';
type LandingTimePresetId = TimeControlId;
type LandingTimePreset = {
  id: LandingTimePresetId;
  label: string;
  initialMs: number;
  incrementMs: number;
};
type LandingColorPreference = 'white' | 'red' | 'black' | 'random';
type LandingGameSpecCapabilities = {
  blackGlyph: string;
  firstColor: Extract<LandingColorPreference, 'red' | 'white'>;
  firstGlyph: string;
  firstLabel: 'Red' | 'White';
  glyphClass?: string;
  supportsRated: boolean;
  supportsStartFormat: boolean;
  supportsTimeControl: boolean;
};
type LandingRoomSetup = {
  gameSpecId: LandingGameSpecId;
  startFormat: LandingStartFormat;
  rated: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  preferredColor: LandingColorPreference;
};
type LobbyTicketResponse = {
  pollAfterMs?: number;
  status?: 'waiting' | 'matched';
  ticketId?: string;
  url?: string;
};
type OpenLobbyRequest = {
  gameSpecId?: string;
  hiddenDraft960: boolean;
  rated?: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  waitingMs: number;
};
type RoomCreationFailure = {
  error?: string;
};

const ENGINE_SEAT_RETRY_MS = 3_000;
const LANDING_TIME_PRESETS: LandingTimePreset[] = TIME_CONTROLS.map((tc) => ({
  id: tc.id,
  label: tc.label,
  initialMs: tc.initialMs,
  incrementMs: tc.incrementMs,
}));

// Which time-control presets the picker offers, per variant. Dark chess is scoped
// to bullet + blitz (mirrors the server allowlist in routes/lib.ts): 5+5 is hidden
// because dark chess is low-calc and decisive, and fewer TCs merge players into
// fewer pools. Xiangqi variants keep 3+2 only (their prior single option — no
// engine-readiness change there). Used for PvE AND PvP/lobby alike.
function allowedTimePresetIds(gameSpecId: LandingGameSpecId): ReadonlySet<LandingTimePresetId> {
  return gameSpecId === DARK_CHESS_SPEC_ID
    ? new Set<LandingTimePresetId>(['1m1', '3m2'])
    : new Set<LandingTimePresetId>(['3m2']);
}
// Dark chess is always offered; the xiangqi-family specs appear only when their
// own client flag is on, so each stays hidden until its launch gate clears.
function enabledLandingVariantGameSpecs(): { gameSpecId: LandingGameSpecId; label: string }[] {
  const specs: { gameSpecId: LandingGameSpecId; label: string }[] = [
    { gameSpecId: DARK_CHESS_SPEC_ID, label: gameSpecForId(DARK_CHESS_SPEC_ID).publicName },
  ];
  // Full Dark Xiangqi (9x10) has no live room/lobby integration yet — creating
  // one 501s — so it is NOT offered in the play menu even when its appearance/
  // spike flag is on. Re-add when the runtime lands (as Dark Mini Xiangqi did).
  if (darkMiniXiangqiEnabled()) {
    specs.push({
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      label: gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID).publicName,
    });
  }
  return specs;
}

function parseLandingGameSpecId(value: string): LandingGameSpecId {
  if (value === DARK_XIANGQI_SPEC_ID) return DARK_XIANGQI_SPEC_ID;
  if (value === DARK_MINI_XIANGQI_SPEC_ID) return DARK_MINI_XIANGQI_SPEC_ID;
  return DARK_CHESS_SPEC_ID;
}

function deepLinkInitialVariant(variant: string | null): LandingGameSpecId | undefined {
  // Dark Xiangqi (9x10) is intentionally omitted — it has no playable runtime,
  // so it must not be reachable from the play menu or a deep link.
  if (variant === DARK_MINI_XIANGQI_SPEC_ID && darkMiniXiangqiEnabled()) {
    return DARK_MINI_XIANGQI_SPEC_ID;
  }
  return undefined;
}
const LANDING_GAME_SPEC_CAPABILITIES: Record<LandingGameSpecId, LandingGameSpecCapabilities> = {
  [DARK_CHESS_SPEC_ID]: {
    blackGlyph: '♚',
    firstColor: 'white',
    firstGlyph: '♚',
    firstLabel: 'White',
    supportsRated: true,
    supportsStartFormat: true,
    supportsTimeControl: true,
  },
  [DARK_XIANGQI_SPEC_ID]: {
    blackGlyph: '將',
    firstColor: 'red',
    firstGlyph: '帥',
    firstLabel: 'Red',
    glyphClass: 'xiangqi',
    supportsRated: false,
    supportsStartFormat: false,
    supportsTimeControl: true,
  },
  [DARK_MINI_XIANGQI_SPEC_ID]: {
    blackGlyph: '將',
    firstColor: 'red',
    firstGlyph: '帥',
    firstLabel: 'Red',
    glyphClass: 'xiangqi',
    supportsRated: false,
    supportsStartFormat: false,
    supportsTimeControl: true,
  },
};

// UI-only placeholder shown in the engine picker before /api/engines/playable
// resolves (or if every retry fails). It is NOT a real, submittable engine: the
// id is a sentinel the server rejects with 400 invalid_engine, so it can never
// produce a game. We label it "Misty" (the brand) instead of the old built-in
// "Random Legal v1" so a slow or failed load never shows a wrong opponent name.
// landing.ts retries the fetch and refetches on refocus to shrink this window to
// near-zero; the real roster ("Misty 1.0") swaps in the moment the API lands.
export const PENDING_ENGINE_ID = 'pending-engine';
export function fallbackPlayableEngines(): PlayableEngine[] {
  return [{ id: PENDING_ENGINE_ID, name: 'Misty', familyName: 'Misty', kind: 'builtin' }];
}

// How the play panel hands off to a freshly created/matched room. Defaults to a
// full document navigation; mountLanding swaps in an in-place SPA transition so
// the starting click's user activation carries into the room (lets the engine's
// opening move sound without a fresh in-room gesture — see live-sound.ts).
type RoomNavigator = (url: string) => void;
const fullReloadNavigator: RoomNavigator = (url) => {
  window.location.href = url;
};
let roomNavigator: RoomNavigator = fullReloadNavigator;
export function setRoomNavigator(nav: RoomNavigator | null): void {
  roomNavigator = nav ?? fullReloadNavigator;
}

// The currently open setup dialog's close handler, if any. An in-place room
// transition must dismiss the dialog (it lives on document.body, outside #app,
// so the DOM swap would otherwise strand it and its document-level keydown
// listener).
let activeDialogClose: (() => void) | null = null;
export function closeActiveLandingDialog(): void {
  activeDialogClose?.();
}

export function buildLandingPlayPanel(
  engines: PlayableEngine[],
  options: { showLobbyRequests?: boolean } = {},
): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-play-panel';
  panel.setAttribute('aria-label', 'Start playing');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;
  const lobbyButton = landingPlayAction('Find opponent', 'lobby');
  const challengeButton = landingPlayAction('Challenge a friend', 'friend');
  const engineButton = landingPlayAction('Play the engine', 'computer');

  lobbyButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      mode: 'lobby',
      title: 'Find opponent',
      ratedDisabled: !isRatedModeEnabled(),
    });
  });
  challengeButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'pvp',
      title: 'Challenge a friend',
      ratedDisabled: true,
    });
  });
  engineButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      engines: availableEngines,
      mode: 'pve',
      title: 'Play the engine',
    });
  });

  // Engine-led order: "Play the engine" leads because it's the always-available,
  // differentiated action with no human-liquidity dependency. Challenge-by-link
  // is next; "Find opponent" (lobby matchmaking, with an engine-fallback offer on
  // timeout) is last. Order is static — only the primary (green) emphasis swaps
  // with live presence (below), so the row never reshuffles as stats poll.
  panel.append(engineButton, challengeButton, lobbyButton);

  // Cold-start default: assume an empty lobby until live-stats says otherwise,
  // so the always-available engine carries the primary (green) CTA on first
  // paint. The poll below hands the green to "Find opponent" once players appear.
  engineButton.classList.add('landing-play-action-primary');

  const anonNote = document.createElement('p');
  anonNote.className = 'landing-play-anon-note';
  anonNote.textContent = 'No account needed.';
  panel.append(anonNote);

  const stats = document.createElement('p');
  stats.className = 'landing-play-stats';
  stats.hidden = true;
  panel.append(stats);
  startLiveStatsPolling(stats, { lobby: lobbyButton, engine: engineButton });

  if (options.showLobbyRequests) {
    panel.append(buildLobbyRequestsWindow());
  }
  return panel;
}

function startLiveStatsPolling(
  stats: HTMLElement,
  cta?: { lobby: HTMLButtonElement; engine: HTMLButtonElement },
): void {
  const render = (data: { playing: number; online: number } | null) => {
    // Steer the primary (green) CTA by liquidity: with nobody around,
    // "Find opponent" only leads to an empty queue, so the always-available
    // engine keeps the emphasis; the moment real players appear the human
    // game reclaims it. Emphasis swap only — button order never shifts.
    const hasPresence = data !== null && (data.playing > 0 || data.online > 0);
    if (cta) {
      cta.engine.classList.toggle('landing-play-action-primary', !hasPresence);
      cta.lobby.classList.toggle('landing-play-action-primary', hasPresence);
    }
    if (!data || (data.playing === 0 && data.online === 0)) {
      stats.hidden = true;
      stats.textContent = '';
      return;
    }
    const parts: string[] = [];
    if (data.playing > 0) parts.push(`${data.playing} playing now`);
    if (data.online > 0) parts.push(`${data.online} online`);
    stats.textContent = parts.join(' · ');
    stats.hidden = false;
  };

  const refresh = async () => {
    try {
      const resp = await fetch('/api/live-stats');
      if (!resp.ok) return;
      const data = (await resp.json()) as { playing: number; online: number };
      render(data);
    } catch (err) {
      console.warn(err);
    }
  };

  void refresh();
  const timer = window.setInterval(() => {
    if (!document.body.contains(stats)) {
      window.clearInterval(timer);
      return;
    }
    void refresh();
  }, 5_000);
}

// Lucide icons (ISC), inlined and unified to a single spec: 24-grid, 2px round
// stroke, outline-only. Consistency is what makes the row read as a designed set
// rather than three ad-hoc glyphs. swords = matchmaking/versus, link =
// link-based challenge, bot = engine.
const LANDING_PLAY_ICON_SVG: Record<'computer' | 'friend' | 'lobby', string> = {
  lobby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>`,
  friend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  computer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
};

function landingPlayAction(
  label: string,
  icon: 'computer' | 'friend' | 'lobby',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-play-action landing-play-action-${icon}`;
  const iconEl = document.createElement('span');
  iconEl.className = 'landing-play-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML = LANDING_PLAY_ICON_SVG[icon];
  const labelEl = document.createElement('span');
  labelEl.className = 'landing-play-action-label';
  labelEl.textContent = label;
  button.append(iconEl, labelEl);
  return button;
}

export function buildLobbyRequestsWindow(): HTMLElement {
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

  const requestSpecId = parseLandingGameSpecId(request.gameSpecId ?? DARK_CHESS_SPEC_ID);
  const primary = document.createElement('span');
  const ratedLabel = request.rated === false ? 'Casual' : 'Rated';
  // Chess shows its start format; other variants show the game name (a DMX open
  // request isn't "Standard/Draft960").
  const formatLabel =
    requestSpecId === DARK_CHESS_SPEC_ID
      ? request.hiddenDraft960
        ? 'Dark Draft960'
        : 'Standard'
      : gameSpecForId(requestSpecId).publicName;
  // Time control + game on the bold line; the casual/rated tag drops to the
  // meta line with the wait age so a long variant name (Dark Mini Xiangqi)
  // doesn't orphan "· Casual" onto its own wrapped line.
  primary.textContent = `${formatTimeControl(request.timeControl)} ${formatLabel}`;
  const secondary = document.createElement('small');
  secondary.textContent = `${ratedLabel} · ${formatWaitAge(request.waitingMs)} waiting`;
  details.append(primary, secondary);

  const join = document.createElement('button');
  join.type = 'button';
  join.textContent = 'Join';
  join.addEventListener('click', () => {
    join.disabled = true;
    join.textContent = 'Joining';
    const status = document.createElement('span');
    const setup: LandingRoomSetup = {
      gameSpecId: requestSpecId,
      startFormat: request.hiddenDraft960 ? 'draft960' : 'standard',
      rated: request.rated ?? true,
      timeControl: request.timeControl,
      preferredColor: 'random',
    };
    // Joining an open request matches instantly, so no engine offer is involved
    // (unchanged from chess) — the offer only arms while waiting.
    joinLobbyFromPlay(join, setup, status);
  });

  row.append(details, join);
  return row;
}

async function fetchOpenLobbyRequests(): Promise<OpenLobbyRequest[]> {
  const response = await fetch('/api/lobby');
  if (!response.ok) throw new Error(`lobby requests failed: ${response.status}`);
  const data = (await response.json()) as { requests?: OpenLobbyRequest[] };
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

// Deep link: `/?play=lobby` (also `friend` / `computer`) auto-opens the
// matching play-setup modal on landing load, so article CTAs can drop a
// visitor straight into "Find opponent". Consumed params are cleared from the
// URL so a refresh doesn't reopen the modal or trigger the dev live shortcut.
export function maybeOpenPlayDeepLink(engines: PlayableEngine[]): void {
  const params = new URLSearchParams(window.location.search);
  const play = params.get('play');
  if (!play) return;

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;

  switch (play) {
    case 'lobby':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        mode: 'lobby',
        title: 'Find opponent',
        ratedDisabled: !isRatedModeEnabled(),
      });
      break;
    case 'friend':
      openLandingSetupDialog({
        initialGameSpecId: deepLinkInitialVariant(
          params.get('gameSpecId') ?? params.get('variant'),
        ),
        mode: 'pvp',
        title: 'Challenge a friend',
        ratedDisabled: true,
      });
      break;
    case 'computer':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        engines: availableEngines,
        mode: 'pve',
        title: 'Play the engine',
      });
      break;
    default:
      return;
  }

  params.delete('play');
  params.delete('gameSpecId');
  params.delete('variant');
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

function openLandingSetupDialog(choice: LandingPlayChoice): void {
  const existing = document.querySelector('.landing-setup-overlay');
  existing?.remove();

  let startFormat: LandingStartFormat = 'standard';
  let rated = !(choice.mode === 'pve' || choice.ratedDisabled);
  let selectedGameSpecId: LandingGameSpecId = choice.initialGameSpecId ?? DARK_CHESS_SPEC_ID;
  let selectedPreset: LandingTimePresetId = '3m2';
  let selectedEngineId = choice.engineId;
  let preferredColor: LandingColorPreference = loadStoredColorPreference();
  let syncGameSpecificSections = () => {};
  let syncVariantControls = () => {};
  let syncColorPreferenceControls = () => {};

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

  // The picker appears only when a second playable variant exists beyond chess.
  // Dark Mini Xiangqi is currently the only one (full Dark Xiangqi has no
  // runtime), so PvP and the lobby offer the same list.
  const variantSelectable =
    (choice.mode === 'pvp' || choice.mode === 'lobby') && darkMiniXiangqiEnabled();
  if (variantSelectable) {
    const variantOptions = enabledLandingVariantGameSpecs();
    const gameSpecSelect = document.createElement('select');
    gameSpecSelect.className = 'landing-variant-select landing-engine-select';
    gameSpecSelect.setAttribute('aria-label', 'Variant');
    for (const { gameSpecId, label } of variantOptions) {
      const option = document.createElement('option');
      option.value = gameSpecId;
      option.textContent = label;
      gameSpecSelect.append(option);
    }
    syncVariantControls = () => {
      gameSpecSelect.value = selectedGameSpecId;
    };
    gameSpecSelect.addEventListener('change', () => {
      selectedGameSpecId = parseLandingGameSpecId(gameSpecSelect.value);
      syncGameSpecificSections();
    });
    variantSection.append(gameSpecSelect);
  } else {
    const variantControl = document.createElement('div');
    variantControl.className = 'landing-variant-control';
    variantControl.textContent = gameSpecForId(DARK_CHESS_SPEC_ID).publicName;
    variantSection.append(variantControl);
  }

  const engineSection =
    choice.mode === 'pve'
      ? buildEngineSetupSection(
          choice.engines ?? fallbackPlayableEngines(),
          selectedEngineId,
          (engineId) => {
            selectedEngineId = engineId;
          },
        )
      : null;

  const draft960Enabled = isVariantEnabled('fog_draft960');
  const draft960Selectable = draft960Enabled && choice.mode !== 'lobby';
  let startGroup: HTMLDivElement | null = null;
  const standardButton = startOptionButton('Standard', true);
  const draftButton = startOptionButton(
    draft960Selectable ? 'Dark Draft960' : 'Dark Draft960 (coming soon)',
    false,
  );
  if (draft960Enabled) {
    startGroup = document.createElement('div');
    startGroup.className = 'landing-start-options';
    startGroup.setAttribute('role', 'radiogroup');
    startGroup.setAttribute('aria-label', 'Fog start format');
    if (!draft960Selectable) {
      draftButton.disabled = true;
      draftButton.classList.add('disabled');
      draftButton.title = 'Coming soon';
    }
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
    if (draft960Selectable) {
      draftButton.addEventListener('click', () => {
        startFormat = 'draft960';
        syncOptions();
      });
    }
    startGroup.append(standardButton, draftButton);
    variantSection.append(startGroup);
  }

  const timeSection = document.createElement('div');
  timeSection.className = 'landing-setup-section';
  timeSection.append(setupSectionLabel('Time control'));

  const presetGroup = document.createElement('div');
  presetGroup.className = 'landing-time-presets';
  presetGroup.setAttribute('role', 'radiogroup');
  presetGroup.setAttribute('aria-label', 'Time control');

  const presetButtons = LANDING_TIME_PRESETS.map((preset) => {
    const button = startOptionButton(preset.label, preset.id === selectedPreset);
    button.addEventListener('click', () => {
      if (button.hidden) return;
      selectedPreset = preset.id;
      syncTimeControls();
    });
    presetGroup.append(button);
    return { button, preset };
  });

  // Show only the presets allowed for the current variant (so 5+5 is hidden for
  // dark chess, here AND in PvP/lobby). Re-runs on variant switch via
  // syncGameSpecificSections; if the current pick is no longer offered, fall back
  // to 3+2 (always available).
  const syncTimeControls = () => {
    const allowed = allowedTimePresetIds(selectedGameSpecId);
    if (!allowed.has(selectedPreset)) selectedPreset = '3m2';
    for (const { button, preset } of presetButtons) {
      const show = allowed.has(preset.id);
      button.hidden = !show;
      const selected = show && selectedPreset === preset.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };
  syncTimeControls();
  timeSection.append(presetGroup);

  const actions = document.createElement('div');
  actions.className = 'landing-setup-actions';

  const status = document.createElement('p');
  status.className = 'landing-setup-status';
  status.setAttribute('aria-live', 'polite');

  let cancelLobbyWait: (() => void) | null = null;
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'landing-setup-start';
  startButton.textContent =
    choice.mode === 'lobby'
      ? 'Find opponent'
      : choice.mode === 'pvp'
        ? 'Create room'
        : 'Start game';
  startButton.addEventListener('click', () => {
    const setup = selectedRoomSetup(
      selectedGameSpecId,
      startFormat,
      rated,
      selectedPreset,
      preferredColor,
    );
    if (choice.mode === 'lobby') {
      cancelLobbyWait?.();
      // The empty-lobby "play the engine" offer is chess-only (no engine plays
      // the xiangqi family yet), so DMX seekers wait without it.
      const lobbyEngineId = setup.gameSpecId === DARK_CHESS_SPEC_ID ? selectedEngineId : undefined;
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status, lobbyEngineId);
      return;
    }
    void createRoomFromPlay(startButton, choice.mode, selectedEngineId, setup, status);
  });

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'landing-setup-back';
  backButton.textContent = 'Cancel';

  const close = () => {
    cancelLobbyWait?.();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (activeDialogClose === close) activeDialogClose = null;
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

  const ratingSection =
    choice.mode === 'pvp' || choice.mode === 'lobby'
      ? buildRatedToggleSection(
          () => rated,
          (v) => {
            rated = v;
          },
          choice.ratedDisabled,
        )
      : null;

  // Color picker shows for PvE and Challenge-a-friend. Hidden for casual/rated
  // lobby matchmaking — color is server-assigned there so the pool stays unified.
  const colorSection =
    choice.mode === 'pve' || choice.mode === 'pvp'
      ? buildColorPreferenceSection(
          () => preferredColor,
          (value) => {
            preferredColor = value;
            storeColorPreference(value);
          },
          () => selectedGameSpecId,
          (sync) => {
            syncColorPreferenceControls = sync;
          },
        )
      : null;

  syncGameSpecificSections = () => {
    const capabilities = landingGameSpecCapabilities(selectedGameSpecId);
    if (!capabilities.supportsStartFormat) {
      startFormat = 'standard';
    }
    if (!capabilities.supportsRated) {
      rated = false;
    }
    if (capabilities.firstColor === 'red' && preferredColor === 'white') preferredColor = 'red';
    if (capabilities.firstColor === 'white' && preferredColor === 'red') preferredColor = 'white';
    if (startGroup) startGroup.hidden = !capabilities.supportsStartFormat;
    if (ratingSection) ratingSection.hidden = !capabilities.supportsRated;
    timeSection.hidden = !capabilities.supportsTimeControl;
    syncTimeControls(); // re-scope the preset picker to the selected variant
    syncVariantControls();
    syncColorPreferenceControls();
  };
  syncGameSpecificSections();

  actions.append(startButton, backButton);
  dialog.append(header, variantSection);
  if (engineSection) dialog.append(engineSection);
  dialog.append(timeSection);
  if (colorSection) dialog.append(colorSection);
  if (ratingSection) dialog.append(ratingSection);
  dialog.append(status, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  activeDialogClose = close;
  (draft960Enabled && selectedGameSpecId === DARK_CHESS_SPEC_ID
    ? standardButton
    : startButton
  ).focus();
}

function buildEngineSetupSection(
  engines: PlayableEngine[],
  selectedEngineId: string | undefined,
  onSelect: (engineId: string) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Engine'));

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();

  // Streamlined release: a single player-facing engine (Misty). Show it as a
  // static, versioned label rather than a one-option dropdown. The <select>
  // only appears when multiple engines are available (local dev via
  // MISTBOARD_EXTRA_PLAYABLE_ENGINES).
  if (availableEngines.length <= 1) {
    const only = availableEngines[0];
    if (only) onSelect(only.id);
    // Reuse the single-variant static style for visual parity with the Variant row.
    const label = document.createElement('div');
    label.className = 'landing-variant-control';
    label.textContent = only?.name ?? 'Misty';
    section.append(label);
    return section;
  }

  const select = document.createElement('select');
  select.className = 'landing-engine-select';
  select.setAttribute('aria-label', 'Engine');

  for (const engine of availableEngines) {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    select.append(option);
  }

  const fallbackEngineId = availableEngines[0]?.id;
  select.value =
    selectedEngineId && availableEngines.some((engine) => engine.id === selectedEngineId)
      ? selectedEngineId
      : (fallbackEngineId ?? '');
  if (select.value) onSelect(select.value);
  select.addEventListener('change', () => onSelect(select.value));

  section.append(select);
  return section;
}

function buildRatedToggleSection(
  get: () => boolean,
  set: (v: boolean) => void,
  ratedDisabled = false,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Game type'));

  const group = document.createElement('div');
  group.className = 'landing-start-options';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Game type');

  const ratedButton = startOptionButton(ratedDisabled ? 'Rated (coming soon)' : 'Rated', true);
  const casualButton = startOptionButton('Casual', false);

  if (ratedDisabled) {
    ratedButton.disabled = true;
    ratedButton.classList.add('disabled');
  }

  const sync = () => {
    const isRated = get();
    ratedButton.classList.toggle('selected', isRated && !ratedDisabled);
    ratedButton.setAttribute('aria-checked', isRated && !ratedDisabled ? 'true' : 'false');
    casualButton.classList.toggle('selected', !isRated || ratedDisabled);
    casualButton.setAttribute('aria-checked', !isRated || ratedDisabled ? 'true' : 'false');
  };
  if (!ratedDisabled) {
    ratedButton.addEventListener('click', () => {
      set(true);
      sync();
    });
  }
  casualButton.addEventListener('click', () => {
    set(false);
    sync();
  });
  sync();
  group.append(ratedButton, casualButton);

  const helper = document.createElement('p');
  helper.className = 'landing-rated-helper';
  helper.append(
    ratedDisabled
      ? 'Rated beta is not launched yet. Casual games are open anytime. '
      : 'Rated games require an account and count toward the dark chess ladder. During beta, ratings may be recalibrated. ',
  );
  const link = document.createElement('a');
  link.href = '/faq';
  link.textContent = 'How rated works';
  helper.append(link);

  section.append(group, helper);
  return section;
}

const COLOR_PREFERENCE_STORAGE_KEY = 'mistboard:setup:preferredColor';

function loadStoredColorPreference(): LandingColorPreference {
  try {
    const raw = window.localStorage.getItem(COLOR_PREFERENCE_STORAGE_KEY);
    if (raw === 'white' || raw === 'red' || raw === 'black' || raw === 'random') return raw;
  } catch {
    // ignore — storage may be disabled (private mode, quota); fall through to default
  }
  return 'random';
}

function storeColorPreference(value: LandingColorPreference): void {
  try {
    window.localStorage.setItem(COLOR_PREFERENCE_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

function buildColorPreferenceSection(
  get: () => LandingColorPreference,
  set: (value: LandingColorPreference) => void,
  getGameSpecId: () => LandingGameSpecId = () => DARK_CHESS_SPEC_ID,
  onSync?: (sync: () => void) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Color'));

  const group = document.createElement('div');
  group.className = 'landing-start-options three';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Color');

  const initial = get();
  const firstButton = colorOptionButton('white', 'White', initial === 'white');
  const randomButton = colorOptionButton('random', 'Random', initial === 'random');
  const blackButton = colorOptionButton('black', 'Black', initial === 'black');

  const sync = () => {
    const gameSpecId = getGameSpecId();
    const capabilities = landingGameSpecCapabilities(gameSpecId);
    const firstValue: LandingColorPreference = capabilities.firstColor;
    const current = get();
    updateColorOptionButton(firstButton, firstValue, capabilities.firstLabel, gameSpecId);
    updateColorOptionButton(randomButton, 'random', 'Random', gameSpecId);
    updateColorOptionButton(blackButton, 'black', 'Black', gameSpecId);
    for (const [button, value] of [
      [firstButton, firstValue],
      [randomButton, 'random'],
      [blackButton, 'black'],
    ] as const) {
      const selected = current === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };

  firstButton.addEventListener('click', () => {
    set(landingGameSpecCapabilities(getGameSpecId()).firstColor);
    sync();
  });
  randomButton.addEventListener('click', () => {
    set('random');
    sync();
  });
  blackButton.addEventListener('click', () => {
    set('black');
    sync();
  });

  onSync?.(sync);
  group.append(firstButton, randomButton, blackButton);
  section.append(group);
  return section;
}

function colorOptionButton(
  value: LandingColorPreference,
  label: string,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option landing-color-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');

  const glyph = document.createElement('span');
  glyph.className = `landing-color-glyph ${value}`;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(...colorGlyphNodes(value));

  const text = document.createElement('span');
  text.className = 'landing-color-label';
  text.textContent = label;

  button.append(glyph, text);
  return button;
}

function updateColorOptionButton(
  button: HTMLButtonElement,
  value: LandingColorPreference,
  label: string,
  gameSpecId: LandingGameSpecId,
): void {
  const glyph = button.querySelector<HTMLSpanElement>('.landing-color-glyph');
  const text = button.querySelector<HTMLSpanElement>('.landing-color-label');
  if (glyph) {
    glyph.className = `landing-color-glyph ${value}`;
    const capabilities = landingGameSpecCapabilities(gameSpecId);
    if (capabilities.glyphClass) glyph.classList.add(capabilities.glyphClass);
    glyph.replaceChildren(...colorGlyphNodes(value, gameSpecId));
  }
  if (text) text.textContent = label;
}

function colorGlyphNodes(
  value: LandingColorPreference,
  gameSpecId: LandingGameSpecId = DARK_CHESS_SPEC_ID,
): Node[] {
  const capabilities = landingGameSpecCapabilities(gameSpecId);
  if (value === 'random') {
    const first = document.createElement('span');
    first.className = capabilities.firstColor;
    first.textContent = capabilities.firstGlyph;
    const second = document.createElement('span');
    second.className = 'black';
    second.textContent = capabilities.blackGlyph;
    return [first, second];
  }
  return [
    document.createTextNode(value === 'black' ? capabilities.blackGlyph : capabilities.firstGlyph),
  ];
}

function landingGameSpecCapabilities(gameSpecId: LandingGameSpecId): LandingGameSpecCapabilities {
  return LANDING_GAME_SPEC_CAPABILITIES[gameSpecId];
}

function setupSectionLabel(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'landing-setup-label';
  label.textContent = text;
  return label;
}

function selectedRoomSetup(
  gameSpecId: LandingGameSpecId,
  startFormat: LandingStartFormat,
  rated: boolean,
  presetId: LandingTimePresetId,
  preferredColor: LandingColorPreference,
): LandingRoomSetup {
  const preset =
    LANDING_TIME_PRESETS.find((candidate) => candidate.id === presetId) ?? LANDING_TIME_PRESETS[1];
  return {
    gameSpecId,
    startFormat,
    rated,
    timeControl: {
      initialMs: preset.initialMs,
      incrementMs: preset.incrementMs,
    },
    preferredColor,
  };
}

function startOptionButton(label: string, selected: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');
  // Split a trailing parenthetical ("3 + 2 (coming soon)") into a muted hint badge so
  // the live label stays prominent and the not-yet-available note de-emphasizes.
  const hintMatch = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (hintMatch) {
    const main = document.createElement('span');
    main.className = 'landing-start-option-text';
    main.textContent = hintMatch[1];
    const hint = document.createElement('span');
    hint.className = 'landing-start-option-hint';
    hint.textContent = hintMatch[2];
    button.append(main, hint);
  } else {
    button.textContent = label;
  }
  return button;
}

async function createRoomFromPlay(
  button: HTMLButtonElement,
  mode: 'pvp' | 'pve',
  engineId?: string,
  setup: LandingRoomSetup = {
    gameSpecId: DARK_CHESS_SPEC_ID,
    startFormat: 'standard',
    rated: true,
    timeControl: { initialMs: 30_000, incrementMs: 2_000 },
    preferredColor: 'random',
  },
  status?: HTMLElement,
): Promise<void> {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  const originalText = label?.textContent ?? button.textContent ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setButtonLabel(button, 'Creating');
  if (status) {
    status.hidden = false;
    status.textContent = mode === 'pve' ? 'Checking engine seats.' : '';
  }
  try {
    while (true) {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(roomCreationRequestBody(mode, setup, engineId)),
      });
      if (status && !status.isConnected) return;
      if (response.ok) {
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error('room creation did not return a URL');
        if (status && !status.isConnected) return;
        roomNavigator(data.url);
        return;
      }
      const failure = await readRoomCreationFailure(response);
      if (mode === 'pve' && failure.error === 'engine_busy' && status?.isConnected) {
        status.textContent = 'All engine seats are active. Waiting for the next seat.';
        setButtonLabel(button, 'Waiting for seat');
        await sleep(ENGINE_SEAT_RETRY_MS);
        if (status.isConnected) continue;
        return;
      }
      throw roomCreationError(response.status, failure);
    }
  } catch (err) {
    console.warn(err);
    if (status?.isConnected) {
      status.textContent = roomCreationStatusText(err, mode);
    }
    setButtonLabel(button, 'Try again');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  }
}

function roomCreationRequestBody(
  mode: 'pvp' | 'pve',
  setup: LandingRoomSetup,
  engineId?: string,
): Record<string, unknown> {
  const gameSpecId = roomCreationGameSpecId(setup);
  if (setup.gameSpecId === DARK_XIANGQI_SPEC_ID || setup.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID) {
    return {
      mode: 'pvp',
      gameSpecId,
      timeControl: setup.timeControl,
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
    };
  }
  return {
    mode,
    gameSpecId,
    hiddenDraft960: setup.startFormat === 'draft960',
    timeControl: setup.timeControl,
    rated: setup.rated,
    preferredColor: setup.preferredColor,
    ...(mode === 'pve' && engineId ? { engineId } : {}),
  };
}

function roomCreationGameSpecId(
  setup: LandingRoomSetup,
):
  | typeof DARK_CHESS_SPEC_ID
  | typeof DARK_DRAFT960_SPEC_ID
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID {
  if (setup.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID) return DARK_MINI_XIANGQI_SPEC_ID;
  if (setup.gameSpecId === DARK_XIANGQI_SPEC_ID) return DARK_XIANGQI_SPEC_ID;
  return setup.startFormat === 'draft960' ? DARK_DRAFT960_SPEC_ID : DARK_CHESS_SPEC_ID;
}

async function readRoomCreationFailure(response: Response): Promise<RoomCreationFailure> {
  try {
    return (await response.json()) as RoomCreationFailure;
  } catch {
    return {};
  }
}

function roomCreationError(status: number, failure: RoomCreationFailure): Error {
  const err = new Error(`room creation failed: ${status}`);
  err.name = failure.error ?? 'room_creation_failed';
  return err;
}

function roomCreationStatusText(err: unknown, mode: 'pvp' | 'pve'): string {
  if (mode === 'pve' && err instanceof Error && err.name === 'engine_unavailable') {
    return 'The engine service is unavailable. Try again soon.';
  }
  if (mode === 'pve') return 'Could not start an engine game. Try again.';
  return 'Could not create the room. Try again.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function joinLobbyFromPlay(
  button: HTMLButtonElement,
  setup: LandingRoomSetup,
  status: HTMLElement,
  engineId?: string,
): () => void {
  const controller = new AbortController();
  const originalText = button.textContent ?? '';
  const queueJoinedAt = Date.now();
  const bucketProps = {
    variant: setup.startFormat,
    // Chess keeps the legacy resolver (so draft960 stays tagged dark-draft960);
    // other variants resolve straight from their spec id.
    ...(setup.gameSpecId === DARK_CHESS_SPEC_ID
      ? gameSpecAnalyticsProps({
          variant: DARK_CHESS_SPEC_ID,
          hiddenDraft960: setup.startFormat === 'draft960',
        })
      : gameSpecAnalyticsPropsForId(setup.gameSpecId)),
    initialMs: setup.timeControl.initialMs,
    incrementMs: setup.timeControl.incrementMs,
    time_class: classifyTimeControl(setup.timeControl.initialMs, setup.timeControl.incrementMs),
    rated: setup.rated,
  };
  let active = true;
  let ticketId: string | null = null;
  let pollTimer: number | null = null;
  let offerTimer: number | null = null;
  let offerEl: HTMLElement | null = null;

  const clearOfferTimer = () => {
    if (offerTimer !== null) {
      window.clearTimeout(offerTimer);
      offerTimer = null;
    }
  };

  const removeOffer = () => {
    offerEl?.remove();
    offerEl = null;
    status.hidden = false;
  };

  const cancel = () => {
    active = false;
    controller.abort();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    clearOfferTimer();
    if (ticketId) {
      void fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { method: 'DELETE' }).catch(
        () => {},
      );
    }
  };

  const acceptEngineOffer = (playButton: HTMLButtonElement) => {
    if (!engineId) return;
    track('lobby_engine_offer_accepted', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    cancel();
    void createRoomFromPlay(playButton, 'pve', engineId, setup, status);
  };

  const dismissEngineOffer = () => {
    track('lobby_engine_offer_dismissed', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    removeOffer();
    scheduleEngineOffer();
  };

  const showEngineOffer = () => {
    if (!engineId || offerEl !== null || !status.isConnected) return;
    status.hidden = true;
    track('lobby_engine_offer_shown', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });

    const block = document.createElement('div');
    block.className = 'landing-engine-offer';

    const prompt = document.createElement('p');
    prompt.className = 'landing-engine-offer-prompt';
    prompt.textContent = 'No opponents right now. Play the engine instead?';

    const actions = document.createElement('div');
    actions.className = 'landing-engine-offer-actions';

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'landing-setup-start';
    play.textContent = 'Play the engine';
    play.addEventListener('click', () => acceptEngineOffer(play));

    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'landing-setup-back';
    keep.textContent = 'Keep waiting';
    keep.addEventListener('click', dismissEngineOffer);

    actions.append(play, keep);
    block.append(prompt, actions);
    status.insertAdjacentElement('afterend', block);
    offerEl = block;
  };

  const scheduleEngineOffer = () => {
    if (!engineId) return;
    clearOfferTimer();
    offerTimer = window.setTimeout(() => {
      offerTimer = null;
      if (
        shouldOfferEngine({
          elapsedMs: Date.now() - queueJoinedAt,
          thresholdMs: ENGINE_OFFER_AFTER_MS,
          stillWaiting: active && offerEl === null,
          hasEngine: Boolean(engineId),
        })
      ) {
        showEngineOffer();
      }
    }, ENGINE_OFFER_AFTER_MS);
  };

  const redirectIfMatched = (ticket: LobbyTicketResponse): boolean => {
    if (ticket.status !== 'matched' || !ticket.url) return false;
    track('lobby_match_found', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    window.location.href = ticket.url;
    return true;
  };

  const handleLobbyError = (err: unknown) => {
    if (!active) return;
    console.warn(err);
    clearOfferTimer();
    removeOffer();
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
    const response = await fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`lobby poll failed: ${response.status}`);
    const ticket = (await response.json()) as LobbyTicketResponse;
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
        gameSpecId: setup.gameSpecId,
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
        rated: setup.rated,
      }),
    });
    if (!response.ok) throw new Error(`lobby join failed: ${response.status}`);
    const ticket = (await response.json()) as LobbyTicketResponse;
    track('lobby_queue_joined', bucketProps);
    if (!active || redirectIfMatched(ticket)) return;
    if (!ticket.ticketId) throw new Error('lobby did not return a ticket');
    ticketId = ticket.ticketId;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
    scheduleEngineOffer();
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
