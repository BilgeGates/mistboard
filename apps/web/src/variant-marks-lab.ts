import { buildNav } from './site-shell.js';
import { renderVariantMiniBoard, VARIANT_MINIS } from './variant-mini-boards.js';

const MINI_SIZES = [160, 128, 112, 96, 80] as const;

export function mountVariantMarksLab(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'variant-marks-route');
  installVariantMarksLabStyles();

  const main = document.createElement('main');
  main.className = 'site-section variant-marks-lab';
  main.append(buildIntro(), buildMiniBoardGrid(), buildMiniBoardScaleStrip());

  root.append(buildNav(), main);
}

function buildMiniBoardGrid(): HTMLElement {
  const grid = document.createElement('section');
  grid.className = 'variant-minis-grid';
  grid.setAttribute('aria-label', 'Variant mini-board previews');

  for (const def of VARIANT_MINIS) {
    const card = document.createElement('article');
    card.className = 'variant-mini-card';
    card.style.setProperty('--variant-mark-accent', def.accent);

    const lead = document.createElement('div');
    lead.className = 'variant-mini-lead';
    lead.innerHTML = renderVariantMiniBoard(def.id, {
      size: 132,
      label: `${def.label} mini-board`,
    });

    const text = document.createElement('div');
    text.className = 'variant-mark-text';

    const title = document.createElement('h3');
    title.textContent = def.label;

    const accent = document.createElement('span');
    accent.className = 'variant-mini-accent-chip';
    accent.textContent = def.shortLabel;

    const titleRow = document.createElement('div');
    titleRow.className = 'variant-mini-title-row';
    titleRow.append(title, accent);

    const description = document.createElement('p');
    description.textContent = def.blurb;

    text.append(titleRow, description);
    card.append(lead, text);
    grid.append(card);
  }

  return grid;
}

function buildMiniBoardScaleStrip(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'variant-mini-scale';
  section.setAttribute('aria-label', 'Mini-board size ramp');
  // One column per size, each as wide as that board, so a header of px labels
  // lines up exactly over the boards beneath it.
  section.style.gridTemplateColumns = `132px ${MINI_SIZES.map((s) => `${s}px`).join(' ')}`;

  const head = document.createElement('div');
  head.className = 'variant-mini-scale-head';
  const lead = document.createElement('span');
  lead.className = 'variant-mini-scale-lead';
  lead.textContent = 'Size (px)';
  head.append(lead);
  for (const size of MINI_SIZES) {
    const label = document.createElement('span');
    label.className = 'variant-mini-scale-size';
    label.textContent = String(size);
    head.append(label);
  }
  section.append(head);

  for (const def of VARIANT_MINIS) {
    const row = document.createElement('div');
    row.className = 'variant-mini-scale-row';

    const name = document.createElement('span');
    name.className = 'variant-mini-scale-name';
    name.textContent = def.label;
    row.append(name);

    for (const size of MINI_SIZES) {
      const cell = document.createElement('span');
      cell.className = 'variant-mini-scale-cell';
      cell.innerHTML = renderVariantMiniBoard(def.id, {
        size,
        label: `${def.label} at ${size}px`,
      });
      row.append(cell);
    }

    section.append(row);
  }

  return section;
}

function buildIntro(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'variant-marks-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'variant-marks-eyebrow';
  eyebrow.textContent = 'Variant reference sheet';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Every variant, one visual system';

  const copy = document.createElement('p');
  copy.className = 'site-section-copy';
  copy.textContent =
    'The canonical sheet for every Mistboard variant marker: each one a cropped fragment of its real board (chess pieces, xiangqi generals, face-down tiles, fog) rather than an abstract glyph, so the whole family reads as the games it represents. Use it to check they hold together at the sizes they ship at; around 96px is the floor before the detail gets muddy.';

  header.append(eyebrow, title, copy);
  return header;
}

function installVariantMarksLabStyles(): void {
  if (document.querySelector('#variant-marks-lab-styles')) return;
  const style = document.createElement('style');
  style.id = 'variant-marks-lab-styles';
  style.textContent = `
    .variant-marks-lab {
      display: grid;
      gap: 28px;
      max-width: 1120px;
    }

    .variant-marks-header {
      max-width: 760px;
      display: grid;
      gap: 10px;
    }

    .variant-marks-eyebrow {
      margin: 0;
      color: var(--site-muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .variant-minis-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .variant-mini-card {
      display: grid;
      grid-template-columns: 132px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      padding: 16px;
      border: 1px solid var(--site-border);
      border-radius: 8px;
      background: var(--site-panel);
      color: var(--site-text);
      box-shadow: 0 12px 28px rgba(29, 37, 34, 0.08);
    }

    .variant-mini-lead {
      display: grid;
      place-items: center;
      width: 132px;
      height: 132px;
    }

    .variant-mini-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .variant-mini-title-row h3 {
      margin: 0;
      color: var(--site-text);
      font-size: 16px;
      line-height: 1.2;
    }

    .variant-mini-accent-chip {
      display: inline-grid;
      place-items: center;
      min-width: 26px;
      height: 18px;
      padding: 0 6px;
      border-radius: 5px;
      background: var(--variant-mark-accent);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .variant-mini-scale {
      display: grid;
      /* grid-template-columns set inline: 132px name + one column per size */
      gap: 12px 16px;
      align-items: center;
      padding: 16px;
      border: 1px solid var(--site-border);
      border-radius: 8px;
      background: var(--site-panel);
    }

    .variant-mini-scale-head,
    .variant-mini-scale-row {
      display: contents;
    }

    .variant-mini-scale-lead {
      color: var(--site-muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .variant-mini-scale-size {
      justify-self: center;
      color: var(--site-muted);
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .variant-mini-scale-name {
      color: var(--site-muted);
      font-size: 13px;
      font-weight: 700;
    }

    .variant-mini-scale-cell {
      justify-self: center;
      display: grid;
      place-items: center;
    }

    .variant-mark-text {
      min-width: 0;
      display: grid;
      gap: 9px;
    }

    .variant-mark-text p {
      margin: 0;
      color: var(--site-muted);
      font-size: 13px;
      line-height: 1.45;
    }
  `;
  document.head.append(style);
}
