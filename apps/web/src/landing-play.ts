import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
  TIME_CONTROLS,
  type TimeControlId,
} from '@mistboard/game';
import { classifyTimeControl, gameSpecAnalyticsProps, track } from './analytics.js';
import { darkXiangqiEnabled } from './feature-flags.js';
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
  initialGameSpecId?: LandingVariantGameSpecId;
  mode: 'lobby' | 'pvp' | 'pve';
  ratedDisabled?: boolean;
  title: string;
};
type LandingVariantGameSpecId = typeof DARK_CHESS_SPEC_ID | typeof DARK_XIANGQI_SPEC_ID;
type LandingStartFormat = 'standard' | 'draft960';
type LandingTimePresetId = TimeControlId;
type LandingTimePreset = {
  id: LandingTimePresetId;
  label: string;
  initialMs: number;
  incrementMs: number;
};
type LandingColorPreference = 'white' | 'red' | 'black' | 'random';
type LandingRoomSetup = {
  gameSpecId: LandingVariantGameSpecId;
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
const LANDING_VARIANT_GAME_SPECS: readonly {
  id: LandingVariantGameSpecId;
  label: string;
}[] = [
  { id: DARK_CHESS_SPEC_ID, label: gameSpecForId(DARK_CHESS_SPEC_ID).publicName },
  { id: DARK_XIANGQI_SPEC_ID, label: gameSpecForId(DARK_XIANGQI_SPEC_ID).publicName },
];

export function fallbackPlayableEngines(): PlayableEngine[] {
  return [
    {
      id: 'builtin-random-legal',
      name: 'Random Legal v1',
      familyName: 'Random Legal',
      kind: 'builtin',
    },
  ];
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

  panel.append(lobbyButton, challengeButton, engineButton);

  const anonNote = document.createElement('p');
  anonNote.className = 'landing-play-anon-note';
  anonNote.textContent = 'No account needed.';
  panel.append(anonNote);

  const stats = document.createElement('p');
  stats.className = 'landing-play-stats';
  stats.hidden = true;
  panel.append(stats);
  startLiveStatsPolling(stats);

  if (options.showLobbyRequests) {
    panel.append(buildLobbyRequestsWindow());
  }
  return panel;
}

function startLiveStatsPolling(stats: HTMLElement): void {
  const render = (data: { playing: number; online: number } | null) => {
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

const LANDING_PLAY_ICON_SVG: Record<'computer' | 'friend' | 'lobby', string> = {
  lobby: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5.5" cy="5.5" r="2"/><path d="M2.5 16.5 4 9.5h3l1.5 7z"/><rect x="2" y="16.5" width="7" height="2" rx="0.5"/><circle cx="18.5" cy="5.5" r="2"/><path d="M15.5 16.5 17 9.5h3l1.5 7z"/><rect x="15" y="16.5" width="7" height="2" rx="0.5"/><path d="M10 11.5q1-1 2 0t2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/><path d="M9.5 14q1-1 2 0t2 0 1 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/></svg>`,
  friend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9.5 14.5l-2 2a3.5 3.5 0 1 1-5-5l2-2"/><path d="M14.5 9.5l2-2a3.5 3.5 0 1 1 5 5l-2 2"/><path d="M9 15l6-6"/></svg>`,
  computer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="3.2" r="1" fill="currentColor" stroke="none"/><path d="M12 4.2v2"/><rect x="2" y="11" width="2" height="4" rx="0.5"/><rect x="20" y="11" width="2" height="4" rx="0.5"/><rect x="4.5" y="6.5" width="15" height="13" rx="2.5"/><circle cx="9.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M9.5 16h5"/></svg>`,
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
  const ratedLabel = request.rated === false ? 'Casual' : 'Rated';
  primary.textContent = `${formatTimeControl(request.timeControl)} ${request.hiddenDraft960 ? 'Draft960' : 'Standard'} · ${ratedLabel}`;
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
      gameSpecId: DARK_CHESS_SPEC_ID,
      startFormat: request.hiddenDraft960 ? 'draft960' : 'standard',
      rated: request.rated ?? true,
      timeControl: request.timeControl,
      preferredColor: 'random',
    };
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
        initialGameSpecId:
          params.get('variant') === DARK_XIANGQI_SPEC_ID && darkXiangqiEnabled()
            ? DARK_XIANGQI_SPEC_ID
            : undefined,
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
  let selectedGameSpecId: LandingVariantGameSpecId = choice.initialGameSpecId ?? DARK_CHESS_SPEC_ID;
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

  const darkXiangqiSelectable = choice.mode === 'pvp' && darkXiangqiEnabled();
  if (darkXiangqiSelectable) {
    const gameSpecSelect = document.createElement('select');
    gameSpecSelect.className = 'landing-variant-select landing-engine-select';
    gameSpecSelect.setAttribute('aria-label', 'Variant');
    for (const { id, label } of LANDING_VARIANT_GAME_SPECS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      gameSpecSelect.append(option);
    }
    syncVariantControls = () => {
      gameSpecSelect.value = selectedGameSpecId;
    };
    gameSpecSelect.addEventListener('change', () => {
      selectedGameSpecId =
        gameSpecSelect.value === DARK_XIANGQI_SPEC_ID ? DARK_XIANGQI_SPEC_ID : DARK_CHESS_SPEC_ID;
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
    draft960Selectable ? 'Draft960' : 'Draft960 (coming soon)',
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
    const enabled = preset.id === '3m2';
    const button = startOptionButton(
      enabled ? preset.label : `${preset.label} (coming soon)`,
      preset.id === selectedPreset,
    );
    if (!enabled) {
      button.disabled = true;
      button.classList.add('disabled');
      button.title = 'Coming soon';
    } else {
      button.addEventListener('click', () => {
        selectedPreset = preset.id;
        syncTimeControls();
      });
    }
    presetGroup.append(button);
    return { button, preset };
  });

  const syncTimeControls = () => {
    for (const { button, preset } of presetButtons) {
      const selected = selectedPreset === preset.id;
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
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status, selectedEngineId);
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
    const isDarkXiangqi = selectedGameSpecId === DARK_XIANGQI_SPEC_ID;
    if (isDarkXiangqi) {
      startFormat = 'standard';
      rated = false;
      if (preferredColor === 'white') preferredColor = 'red';
    } else if (preferredColor === 'red') {
      preferredColor = 'white';
    }
    if (startGroup) startGroup.hidden = isDarkXiangqi;
    if (ratingSection) ratingSection.hidden = isDarkXiangqi;
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
  (draft960Enabled && selectedGameSpecId !== DARK_XIANGQI_SPEC_ID
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
  getGameSpecId: () => LandingVariantGameSpecId = () => DARK_CHESS_SPEC_ID,
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
    const firstValue: LandingColorPreference =
      gameSpecId === DARK_XIANGQI_SPEC_ID ? 'red' : 'white';
    const current = get();
    updateColorOptionButton(
      firstButton,
      firstValue,
      firstValue === 'red' ? 'Red' : 'White',
      gameSpecId,
    );
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
    set(getGameSpecId() === DARK_XIANGQI_SPEC_ID ? 'red' : 'white');
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
  gameSpecId: LandingVariantGameSpecId,
): void {
  const glyph = button.querySelector<HTMLSpanElement>('.landing-color-glyph');
  const text = button.querySelector<HTMLSpanElement>('.landing-color-label');
  if (glyph) {
    glyph.className = `landing-color-glyph ${value}`;
    glyph.classList.toggle('xiangqi', gameSpecId === DARK_XIANGQI_SPEC_ID);
    glyph.replaceChildren(...colorGlyphNodes(value, gameSpecId));
  }
  if (text) text.textContent = label;
}

function colorGlyphNodes(
  value: LandingColorPreference,
  gameSpecId: LandingVariantGameSpecId = DARK_CHESS_SPEC_ID,
): Node[] {
  if (value === 'random') {
    const first = document.createElement('span');
    first.className = gameSpecId === DARK_XIANGQI_SPEC_ID ? 'red' : 'white';
    first.textContent = gameSpecId === DARK_XIANGQI_SPEC_ID ? '帥' : '♚';
    const second = document.createElement('span');
    second.className = 'black';
    second.textContent = gameSpecId === DARK_XIANGQI_SPEC_ID ? '將' : '♚';
    return [first, second];
  }
  if (gameSpecId === DARK_XIANGQI_SPEC_ID) {
    return [document.createTextNode(value === 'black' ? '將' : '帥')];
  }
  return [document.createTextNode('♚')];
}

function setupSectionLabel(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'landing-setup-label';
  label.textContent = text;
  return label;
}

function selectedRoomSetup(
  gameSpecId: LandingVariantGameSpecId,
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
        window.location.href = data.url;
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
  if (setup.gameSpecId === DARK_XIANGQI_SPEC_ID) {
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
    variant: DARK_CHESS_SPEC_ID,
    hiddenDraft960: setup.startFormat === 'draft960',
    timeControl: setup.timeControl,
    rated: setup.rated,
    preferredColor: setup.preferredColor,
    ...(mode === 'pve' && engineId ? { engineId } : {}),
  };
}

function roomCreationGameSpecId(
  setup: LandingRoomSetup,
): typeof DARK_CHESS_SPEC_ID | typeof DARK_DRAFT960_SPEC_ID | typeof DARK_XIANGQI_SPEC_ID {
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
    ...gameSpecAnalyticsProps({
      variant: DARK_CHESS_SPEC_ID,
      hiddenDraft960: setup.startFormat === 'draft960',
    }),
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
