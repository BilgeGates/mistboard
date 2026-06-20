export type DxqPostgameShellOptions = {
  actions: HTMLElement;
  ariaLabel: string;
  boardsPanel: HTMLElement;
  detailsPanel: HTMLElement;
  pageClassName?: string;
  summary: string;
  timelinePanel: HTMLElement;
  title: string;
};

export type DxqReplayControls = {
  el: HTMLDivElement;
  first: HTMLButtonElement;
  flip: HTMLButtonElement;
  last: HTMLButtonElement;
  next: HTMLButtonElement;
  previous: HTMLButtonElement;
  status: HTMLSpanElement;
};

export function createDxqPostgameShell(options: DxqPostgameShellOptions): HTMLElement {
  const page = document.createElement('main');
  page.className = ['dxq-postgame', 'postgame-review-shell', options.pageClassName]
    .filter(Boolean)
    .join(' ');

  const header = document.createElement('header');
  header.className = 'dxq-postgame__header';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'dxq-postgame__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'dxq-postgame__title';
  title.textContent = options.title;
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = options.summary;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, options.actions);

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', options.ariaLabel);

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(options.detailsPanel, options.timelinePanel);

  layout.append(options.boardsPanel, side);
  page.append(header, layout);
  return page;
}

export function createDxqReplayControls(): DxqReplayControls {
  const el = document.createElement('div');
  el.className = 'dxq-postgame__replay-controls';
  const first = replayControlButton('|<', 'First ply');
  const previous = replayControlButton('<', 'Previous ply');
  const status = document.createElement('span');
  status.className = 'dxq-postgame__replay-status';
  status.setAttribute('aria-live', 'polite');
  const next = replayControlButton('>', 'Next ply');
  const last = replayControlButton('>|', 'Final ply');
  const flip = replayControlButton('Flip', 'Flip all boards');
  flip.title = 'Flip all boards (f)';
  el.append(first, previous, status, next, last, flip);
  return { el, first, previous, status, next, last, flip };
}

function replayControlButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dxq-postgame__replay-button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  return button;
}
