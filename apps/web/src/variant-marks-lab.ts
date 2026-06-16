import { buildNav } from './site-shell.js';
import { renderVariantMark, VARIANT_MARKS, type VariantMarkDef } from './variant-marks.js';
import { renderVariantMiniBoard, VARIANT_MINIS } from './variant-mini-boards.js';

const PREVIEW_SIZES = [96, 48, 24, 16] as const;
const MINI_SIZES = [96, 64, 48, 32, 24, 16] as const;

export function mountVariantMarksLab(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'variant-marks-route');
  installVariantMarksLabStyles();

  const main = document.createElement('main');
  main.className = 'site-section variant-marks-lab';
  main.append(
    buildIntro(),
    buildMiniBoardIntro(),
    buildMiniBoardGrid(),
    buildMiniBoardScaleStrip(),
    buildMarkGrid(),
    buildScaleStrip(),
  );

  root.append(buildNav(), main);
}

function buildMiniBoardIntro(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'variant-marks-header variant-minis-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'variant-marks-eyebrow';
  eyebrow.textContent = 'Mini-board candidates';

  const title = document.createElement('h2');
  title.className = 'site-section-heading';
  title.textContent = 'Each variant as a cropped board';

  const copy = document.createElement('p');
  copy.className = 'site-section-copy';
  copy.textContent =
    'Instead of an abstract glyph, a 4x4 crop of the real board: chess pieces, xiangqi generals, face-down tiles, fog. Reads as the actual game, but watch where it collapses below ~32px.';

  header.append(eyebrow, title, copy);
  return header;
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
    lead.innerHTML = renderVariantMiniBoard(def.id, { size: 132, label: `${def.label} mini-board` });

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
  eyebrow.textContent = 'Variant mark candidates';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Dark games, one visual system';

  const copy = document.createElement('p');
  copy.className = 'site-section-copy';
  copy.textContent =
    'First-pass SVG marks for Dark chess, Dark Draft960, and Dark Xiangqi. Each keeps the same square badge, line weight, and hidden-information mask so the family reads together at small UI sizes.';

  header.append(eyebrow, title, copy);
  return header;
}

function buildMarkGrid(): HTMLElement {
  const grid = document.createElement('section');
  grid.className = 'variant-marks-grid';
  grid.setAttribute('aria-label', 'Variant mark previews');

  for (const mark of VARIANT_MARKS) {
    grid.append(buildMarkCard(mark));
  }

  return grid;
}

function buildMarkCard(mark: VariantMarkDef): HTMLElement {
  const card = document.createElement('article');
  card.className = 'variant-mark-card';
  card.style.setProperty('--variant-mark-accent', mark.accent);

  const lead = document.createElement('div');
  lead.className = 'variant-mark-lead';
  lead.innerHTML = renderVariantMark(mark.id, {
    className: 'variant-mark-preview variant-mark-preview-large',
    label: `${mark.label} mark`,
    size: 96,
  });

  const text = document.createElement('div');
  text.className = 'variant-mark-text';

  const title = document.createElement('h2');
  title.textContent = mark.label;

  const description = document.createElement('p');
  description.textContent = mark.description;

  const sizes = document.createElement('div');
  sizes.className = 'variant-mark-sizes';
  for (const size of PREVIEW_SIZES) {
    const sample = document.createElement('span');
    sample.className = 'variant-mark-size-sample';
    sample.style.setProperty('--sample-size', `${size}px`);
    sample.innerHTML = renderVariantMark(mark.id, {
      className: 'variant-mark-preview',
      label: `${mark.label} mark at ${size}px`,
      size,
    });
    sizes.append(sample);
  }

  text.append(title, description, sizes);
  card.append(lead, text);
  return card;
}

function buildScaleStrip(): HTMLElement {
  const strip = document.createElement('section');
  strip.className = 'variant-mark-scale-strip';
  strip.setAttribute('aria-label', 'Small-size comparison');

  for (const theme of [
    { label: 'Mono', className: 'mono' },
    { label: 'Accent', className: 'accent' },
    { label: 'Dark UI', className: 'dark' },
  ]) {
    const group = document.createElement('div');
    group.className = `variant-mark-scale-group ${theme.className}`;

    const label = document.createElement('h2');
    label.textContent = theme.label;
    group.append(label);

    for (const mark of VARIANT_MARKS) {
      const row = document.createElement('div');
      row.className = 'variant-mark-scale-row';
      row.style.setProperty('--variant-mark-accent', mark.accent);
      row.innerHTML = [
        renderVariantMark(mark.id, {
          className: 'variant-mark-preview',
          label: `${mark.label} mark, 24px`,
          size: 24,
        }),
        renderVariantMark(mark.id, {
          className: 'variant-mark-preview',
          label: `${mark.label} mark, 16px`,
          size: 16,
        }),
      ].join('');

      const text = document.createElement('span');
      text.textContent = mark.shortLabel;
      row.append(text);
      group.append(row);
    }

    strip.append(group);
  }

  return strip;
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

    .variant-minis-header {
      margin-top: 8px;
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
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--site-border);
      border-radius: 8px;
      background: var(--site-panel);
    }

    .variant-mini-scale-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .variant-mini-scale-name {
      flex: 0 0 132px;
      color: var(--site-muted);
      font-size: 13px;
      font-weight: 700;
    }

    .variant-mini-scale-cell {
      display: grid;
      place-items: center;
    }

    .variant-marks-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .variant-mark-card {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      align-items: start;
      min-height: 272px;
      padding: 18px;
      border: 1px solid var(--site-border);
      border-radius: 8px;
      background: var(--site-panel);
      color: var(--site-text);
      box-shadow: 0 12px 28px rgba(29, 37, 34, 0.08);
    }

    .variant-mark-lead {
      display: grid;
      place-items: center;
      min-height: 124px;
      border-radius: 8px;
      background: #f9faf7;
      color: var(--variant-mark-accent);
      --variant-mark-bg: #f9faf7;
    }

    .variant-mark-text {
      min-width: 0;
      display: grid;
      gap: 9px;
    }

    .variant-mark-text h2,
    .variant-mark-scale-group h2 {
      margin: 0;
      color: var(--site-text);
      font-size: 16px;
      line-height: 1.2;
    }

    .variant-mark-text p {
      margin: 0;
      color: var(--site-muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .variant-mark-preview {
      display: block;
      flex: 0 0 auto;
      color: currentColor;
    }

    .variant-mark-sizes {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
    }

    .variant-mark-size-sample {
      display: grid;
      place-items: center;
      width: max(var(--sample-size), 20px);
      height: 96px;
      color: var(--variant-mark-accent);
      --variant-mark-bg: #ffffff;
    }

    .variant-mark-scale-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .variant-mark-scale-group {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--site-border);
      border-radius: 8px;
      background: var(--site-panel);
      color: var(--site-text);
      --variant-mark-bg: #ffffff;
    }

    .variant-mark-scale-group.dark {
      background: #1d2522;
      color: #ebefee;
      --site-text: #ebefee;
      --variant-mark-bg: #1d2522;
    }

    .variant-mark-scale-group.accent .variant-mark-scale-row {
      color: var(--variant-mark-accent);
    }

    .variant-mark-scale-row {
      display: grid;
      grid-template-columns: 24px 16px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      min-height: 28px;
      color: currentColor;
    }

    .variant-mark-scale-row span {
      min-width: 0;
      overflow: hidden;
      color: currentColor;
      font-size: 12px;
      font-weight: 760;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 980px) {
      .variant-marks-grid,
      .variant-mark-scale-strip {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 560px) {
      .variant-mark-card {
        grid-template-columns: 1fr;
      }

      .variant-mark-lead {
        justify-self: start;
      }
    }
  `;
  document.head.append(style);
}
