// Throwaway dev preview generator: renders the variant mini-board candidates to
// a static HTML file so they can be eyeballed without the dev server / browser
// extension. Run: npx tsx apps/web/scripts/gen-mini-preview.mts
import { writeFileSync } from 'node:fs';
import { renderVariantMiniBoard, VARIANT_MINIS } from '../src/variant-mini-boards.js';

const MINI_SIZES = [96, 64, 48, 32, 24, 16];

const cards = VARIANT_MINIS.map((def) => {
  const big = renderVariantMiniBoard(def.id, { size: 132, label: def.label });
  return `
    <article class="card" style="--accent:${def.accent}">
      <div class="lead">${big}</div>
      <div class="text">
        <div class="titlerow"><h3>${def.label}</h3><span class="chip">${def.shortLabel}</span></div>
        <p>${def.blurb}</p>
      </div>
    </article>`;
}).join('');

const ramp = VARIANT_MINIS.map((def) => {
  const cells = MINI_SIZES.map(
    (size) => `<span class="cell">${renderVariantMiniBoard(def.id, { size, label: `${def.label} ${size}` })}</span>`,
  ).join('');
  return `<div class="row"><span class="name">${def.label}</span>${cells}</div>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 28px; background: #f3f5f1; color: #1d2522;
    font-family: -apple-system, system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em;
    color: #5d6b64; margin: 28px 0 12px; }
  .sub { color: #5d6b64; margin: 0 0 8px; max-width: 720px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .card { display: grid; grid-template-columns: 132px 1fr; gap: 16px; align-items: center;
    padding: 16px; border: 1px solid #dfe4de; border-radius: 8px; background: #fff;
    box-shadow: 0 12px 28px rgba(29,37,34,.08); }
  .lead { width: 132px; height: 132px; display: grid; place-items: center; }
  .titlerow { display: flex; align-items: center; gap: 8px; }
  .titlerow h3 { margin: 0; font-size: 16px; }
  .chip { display: inline-grid; place-items: center; min-width: 26px; height: 18px;
    padding: 0 6px; border-radius: 5px; background: var(--accent); color: #fff;
    font-size: 11px; font-weight: 800; }
  .text p { margin: 6px 0 0; color: #5d6b64; font-size: 13px; }
  .ramp { padding: 16px; border: 1px solid #dfe4de; border-radius: 8px; background: #fff; }
  .row { display: flex; align-items: center; gap: 16px; padding: 6px 0; }
  .name { flex: 0 0 132px; color: #5d6b64; font-size: 13px; font-weight: 700; }
  .cell { display: grid; place-items: center; }
  .darkstrip { margin-top: 14px; padding: 16px; border-radius: 8px; background: #1d2522; }
  .darkstrip .name { color: #aebab4; }
</style></head>
<body>
  <h1>Variant mini-boards — candidates</h1>
  <p class="sub">A 4x4 crop of each real board instead of an abstract glyph. Reusing cburnett chess art + xiangqi glyphs. Question to answer: do they stay recognizable as the size drops, and do any two collide?</p>
  <h2>At card size (132px)</h2>
  <div class="grid">${cards}</div>
  <h2>Size ramp — 96 / 64 / 48 / 32 / 24 / 16px</h2>
  <div class="ramp">${ramp}</div>
  <div class="ramp darkstrip">${ramp}</div>
</body></html>`;

writeFileSync('/tmp/mistboard-mini-preview.html', html, 'utf8');
console.log('wrote /tmp/mistboard-mini-preview.html');
