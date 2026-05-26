import type { Color } from '@mistboard/game';

export type EngineReviewPanels = {
  belief?: {
    available: boolean;
    defaultOpen?: boolean;
    seats?: Color[];
    snapshotKinds?: string[];
  };
  trace?: {
    available: boolean;
    defaultOpen?: boolean;
    seats?: Color[];
  };
};

export type AnalysisToolToggleBarHandle = {
  addToggle: (
    id: string,
    label: string,
    initialPressed: boolean,
    onToggle: (visible: boolean) => void,
  ) => void;
  el: HTMLElement;
  setPressed: (id: string, pressed: boolean) => void;
};

export function createAnalysisToolToggleBar(): AnalysisToolToggleBarHandle {
  const el = document.createElement('div');
  el.className = 'analysis-tool-togglebar';
  const buttons = new Map<string, HTMLButtonElement>();

  function setPressed(id: string, pressed: boolean): void {
    const button = buttons.get(id);
    if (!button) return;
    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('active', pressed);
  }

  return {
    addToggle(id, label, initialPressed, onToggle) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        const pressed = button.getAttribute('aria-pressed') === 'true';
        onToggle(!pressed);
      });
      buttons.set(id, button);
      el.append(button);
      setPressed(id, initialPressed);
    },
    el,
    setPressed,
  };
}

export type EnginePanelDockHandle = {
  el: HTMLElement;
};

type EnginePanelId = 'belief' | 'trace';
type EnginePanelSpec = {
  defaultOpen: boolean;
  description: string;
  id: EnginePanelId;
  label: string;
  meta: string[];
  title: string;
};

export function createEnginePanelDock(
  panels: EngineReviewPanels | undefined,
): EnginePanelDockHandle | null {
  const panelSpecs = enginePanelSpecs(panels);
  if (panelSpecs.length === 0) return null;

  const el = document.createElement('section');
  el.className = 'engine-review-panel';
  const tabs = document.createElement('div');
  tabs.className = 'engine-review-tabs';
  const body = document.createElement('div');
  body.className = 'engine-review-body';

  const activeFromUrl = panelIdFromSearch(new URLSearchParams(window.location.search).get('panel'));
  let active: EnginePanelId | null =
    panelSpecs.find((spec) => spec.id === activeFromUrl)?.id ??
    panelSpecs.find((spec) => spec.defaultOpen)?.id ??
    null;

  const buttons = new Map<EnginePanelId, HTMLButtonElement>();
  for (const spec of panelSpecs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = spec.label;
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      active = active === spec.id ? null : spec.id;
      render();
    });
    buttons.set(spec.id, button);
    tabs.append(button);
  }

  function render(): void {
    body.replaceChildren();
    for (const [id, button] of buttons) {
      const isActive = active === id;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-expanded', String(isActive));
    }
    if (!active) {
      const empty = document.createElement('p');
      empty.className = 'engine-review-empty';
      empty.textContent = 'Engine review panels are available for this game.';
      body.append(empty);
      return;
    }
    const spec = panelSpecs.find((candidate) => candidate.id === active);
    if (!spec) return;
    const title = document.createElement('h2');
    title.textContent = spec.title;
    const copy = document.createElement('p');
    copy.textContent = spec.description;
    const meta = document.createElement('div');
    meta.className = 'engine-review-meta';
    for (const item of spec.meta) {
      const chip = document.createElement('span');
      chip.textContent = item;
      meta.append(chip);
    }
    body.append(title, copy, meta);
  }

  el.append(tabs, body);
  render();
  return { el };
}

function enginePanelSpecs(panels: EngineReviewPanels | undefined): EnginePanelSpec[] {
  const specs: EnginePanelSpec[] = [];
  if (panels?.belief?.available) {
    specs.push({
      defaultOpen: panels.belief.defaultOpen === true,
      description:
        'Belief artifacts exist for this engine game. The next viewer slice will load the stored belief snapshots into the inspector.',
      id: 'belief',
      label: 'Belief',
      meta: [
        seatsLabel(panels.belief.seats),
        snapshotKindsLabel(panels.belief.snapshotKinds),
      ].filter(Boolean),
      title: 'Belief Inspector',
    });
  }
  if (panels?.trace?.available) {
    specs.push({
      defaultOpen: panels.trace.defaultOpen === true,
      description:
        'Engine trace artifacts exist for this game. The next viewer slice will load decision rows and queue reasons here.',
      id: 'trace',
      label: 'Trace',
      meta: [seatsLabel(panels.trace.seats)].filter(Boolean),
      title: 'Engine Trace',
    });
  }
  return specs;
}

function panelIdFromSearch(value: string | null): EnginePanelId | null {
  return value === 'belief' || value === 'trace' ? value : null;
}

function seatsLabel(seats: Color[] | undefined): string {
  if (!seats || seats.length === 0) return '';
  return `Seats: ${seats.map(capitalizeColor).join(', ')}`;
}

function snapshotKindsLabel(kinds: string[] | undefined): string {
  if (!kinds || kinds.length === 0) return '';
  return `Snapshots: ${kinds.join(', ')}`;
}

function capitalizeColor(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}
