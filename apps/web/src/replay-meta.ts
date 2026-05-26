import { formatClock } from './web-utils.js';

export type GameMeta = {
  whiteName: string | null;
  blackName: string | null;
  gameUrl?: string | null;
  modeLabel?: string;
  result: string;
  timeControl?: Record<string, unknown> | null;
  termination: string;
  plyCount: number;
};

export type GameMetaPanelHandle = {
  details: HTMLDivElement;
  el: HTMLElement;
  mode: 'full' | 'compact';
  hideGameIdPill: boolean;
};

export type GameHeaderHandle = {
  el: HTMLElement;
  title: HTMLHeadingElement;
  result: HTMLDivElement;
  meta: HTMLDivElement;
  whiteCell: HTMLDivElement;
  blackCell: HTMLDivElement;
  /** Slot for action buttons (Flip, future toggles) on the center column. */
  actions: HTMLDivElement;
};

export function createGameHeaderStrip(): GameHeaderHandle {
  const el = document.createElement('header');
  el.className = 'replay-game-header';
  el.setAttribute('aria-label', 'Game summary');

  const whiteCell = document.createElement('div');
  whiteCell.className = 'replay-game-header-cell replay-game-header-cell-white';

  const center = document.createElement('div');
  center.className = 'replay-game-header-center';
  const title = document.createElement('h1');
  title.className = 'replay-game-header-title';
  const result = document.createElement('div');
  result.className = 'replay-game-header-result';
  const meta = document.createElement('div');
  meta.className = 'replay-game-header-meta';
  const actions = document.createElement('div');
  actions.className = 'replay-game-header-actions';
  center.append(title, result, meta, actions);

  const blackCell = document.createElement('div');
  blackCell.className = 'replay-game-header-cell replay-game-header-cell-black';

  el.append(whiteCell, center, blackCell);
  return { el, title, result, meta, whiteCell, blackCell, actions };
}

export function playerViewLabel(name: string | null | undefined, side: 'white' | 'black'): string {
  const fallback = side === 'white' ? "White's view" : "Black's view";
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  // Use the name verbatim so casing the user chose is preserved. Possessive
  // form is acceptable for plain names and engine version strings.
  const apostrophe = trimmed.endsWith('s') || trimmed.endsWith('S') ? "'" : "'s";
  return `${trimmed}${apostrophe} view`;
}

export function createShareButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'replay-game-header-action replay-game-header-share';
  btn.innerHTML = `${ICON_SHARE}<span class="replay-game-header-action-label">Share</span>`;
  btn.title = 'Copy link to this position';
  const labelEl = btn.querySelector<HTMLSpanElement>('.replay-game-header-action-label')!;
  let resetTimer: number | null = null;
  btn.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      labelEl.textContent = 'Copied';
      btn.classList.add('replay-game-header-share-copied');
    } catch {
      // Older browsers / clipboard-blocked contexts: fall back to a transient prompt.
      try {
        window.prompt('Copy this link:', url);
      } catch {
        return;
      }
    }
    if (resetTimer !== null) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      labelEl.textContent = 'Share';
      btn.classList.remove('replay-game-header-share-copied');
      resetTimer = null;
    }, 1600);
  });
  return btn;
}

export function renderGameHeader(
  handle: GameHeaderHandle | null,
  meta: GameMeta | undefined,
): void {
  if (!handle) return;
  if (!meta) {
    handle.title.textContent = '';
    handle.result.replaceChildren();
    handle.meta.replaceChildren();
    return;
  }
  handle.title.textContent = meta.modeLabel ?? 'Game';

  const resultSide = winningSideFromResult(meta.result);
  const resultText = resultLabel(meta.result);
  const terminationText = terminationDetailLabel(meta.termination);
  handle.result.replaceChildren();
  const chip = document.createElement('span');
  chip.className = `replay-game-header-result-chip replay-game-header-result-${resultSide}`;
  chip.textContent = resultText;
  handle.result.append(chip);
  if (terminationText) {
    const detail = document.createElement('span');
    detail.className = 'replay-game-header-result-detail';
    detail.textContent = terminationText;
    handle.result.append(detail);
  }

  const timeControl = timeControlLabelFromMeta(meta.timeControl);
  const bits: string[] = [
    ...(timeControl ? [timeControl] : []),
    `${meta.plyCount} ${meta.plyCount === 1 ? 'ply' : 'plies'}`,
  ];
  handle.meta.replaceChildren();
  bits.forEach((bit, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'replay-game-header-sep';
      sep.textContent = '·';
      handle.meta.append(sep);
    }
    const span = document.createElement('span');
    span.textContent = bit;
    handle.meta.append(span);
  });
  if (meta.gameUrl) {
    const sep = document.createElement('span');
    sep.className = 'replay-game-header-sep';
    sep.textContent = '·';
    const link = document.createElement('a');
    link.className = 'replay-game-header-link';
    link.href = meta.gameUrl;
    link.textContent = 'View game';
    handle.meta.append(sep, link);
  }
}

export function createGameMetaPanel(
  mode: 'full' | 'compact' = 'full',
  opts: { hideGameIdPill?: boolean } = {},
): GameMetaPanelHandle {
  const el = document.createElement('aside');
  el.className = `replay-game-meta-card replay-game-meta-card-${mode} side-panel meta-panel`;
  el.setAttribute('aria-label', 'Game metadata');
  const section = document.createElement('section');
  section.className = 'panel-section';
  const title = document.createElement('h2');
  title.textContent = mode === 'compact' ? 'Featured game' : 'Game';
  const details = document.createElement('div');
  details.className = 'game-info replay-game-meta-details';
  if (mode === 'compact') {
    section.append(details);
  } else {
    section.append(title, details);
  }
  el.append(section);
  return { details, el, mode, hideGameIdPill: opts.hideGameIdPill === true };
}

export function renderGameMetaPanel(
  panel: GameMetaPanelHandle | null,
  meta: GameMeta | undefined,
  activeSample: string,
): void {
  if (!panel) return;
  if (!meta) {
    panel.el.hidden = true;
    panel.details.replaceChildren();
    return;
  }

  panel.el.hidden = false;
  const timeControl = timeControlLabelFromMeta(meta.timeControl);
  const items: Array<{ label: string; value: string }> =
    panel.mode === 'compact'
      ? []
      : [
          { label: 'Mode', value: meta.modeLabel ?? 'Replay' },
          { label: 'Result', value: resultLabel(meta.result) },
          { label: 'End', value: terminationLabel(meta.termination) },
          ...(timeControl ? [{ label: 'Time', value: timeControl }] : []),
          { label: 'Plies', value: String(meta.plyCount) },
          { label: 'Game', value: activeSample },
        ];

  panel.details.replaceChildren();
  for (const item of items) {
    panel.details.append(infoItem(item.label, item.value));
  }
  if (panel.mode === 'compact') {
    if (!panel.hideGameIdPill) {
      const gameId = document.createElement(meta.gameUrl ? 'a' : 'span');
      gameId.className = 'replay-game-id';
      gameId.textContent = activeSample;
      if (gameId instanceof HTMLAnchorElement && meta.gameUrl) gameId.href = meta.gameUrl;
      panel.details.append(gameId);
    }
  } else if (meta.gameUrl) {
    const link = document.createElement('a');
    link.className = 'replay-game-link';
    link.href = meta.gameUrl;
    link.textContent = 'View game';
    panel.details.append(link);
  }
}

export function timeControlLabelFromMeta(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) return null;
  if (typeof raw.label === 'string' && raw.label.trim()) return raw.label.trim();
  if (raw.kind === 'none') return 'Untimed';

  const initialSeconds = numericValue(raw.initial_seconds);
  const incrementSeconds = numericValue(raw.increment_seconds);
  if (initialSeconds !== null) {
    const base = formatClock(initialSeconds * 1000);
    return incrementSeconds && incrementSeconds > 0
      ? `${base}+${Math.round(incrementSeconds)}`
      : base;
  }

  const initialMs = numericValue(raw.initialMs) ?? numericValue(raw.initial_ms);
  const incrementMs = numericValue(raw.incrementMs) ?? numericValue(raw.increment_ms);
  if (initialMs !== null) {
    const base = formatClock(initialMs);
    const increment = incrementMs ? Math.round(incrementMs / 1000) : 0;
    return increment > 0 ? `${base}+${increment}` : base;
  }

  const perMoveMs = numericValue(raw.milliseconds) ?? numericValue(raw.per_move_ms);
  if (raw.kind === 'per-move' && perMoveMs !== null) return `${formatClock(perMoveMs)} / move`;

  return typeof raw.kind === 'string' ? raw.kind : null;
}

export function thinkingBudgetMsFromMeta(
  raw: Record<string, unknown> | null | undefined,
): number | null {
  if (!raw) return null;
  const explicit =
    numericValue(raw.budgetMs) ??
    numericValue(raw.budget_ms) ??
    numericValue(raw.perMoveMs) ??
    numericValue(raw.per_move_ms) ??
    numericValue(raw.milliseconds);
  if (explicit !== null && explicit > 0) return explicit;

  const seconds =
    numericValue(raw.budgetSeconds) ??
    numericValue(raw.budget_seconds) ??
    numericValue(raw.per_move_seconds);
  if (seconds !== null && seconds > 0) return seconds * 1000;

  return null;
}

function winningSideFromResult(result: string): 'white' | 'black' | 'draw' {
  if (result === 'white-wins' || result === '1-0') return 'white';
  if (result === 'black-wins' || result === '0-1') return 'black';
  return 'draw';
}

function terminationDetailLabel(termination: string): string | null {
  const label = terminationLabel(termination).toLowerCase();
  if (!label || label === 'unknown') return null;
  return `by ${label}`;
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function terminationLabel(termination: string): string {
  return termination.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function infoItem(labelText: string, valueText: string): HTMLDivElement {
  const item = document.createElement('div');
  const label = document.createElement('span');
  label.textContent = labelText;
  const value = document.createElement('strong');
  value.textContent = valueText;
  item.append(label, value);
  return item;
}

const ICON_SHARE =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5.5 9 10 4.5M5.5 7l4.5 4.5M11.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
