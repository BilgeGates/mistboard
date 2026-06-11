import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDefaultOgSvg, svgToPng } from '../og-image.js';

const here = dirname(fileURLToPath(import.meta.url));
const webPublic = resolve(here, '..', '..', '..', 'web', 'public');
const outPath = resolve(webPublic, 'og-image.png');

const logoSvg = await fs.readFile(resolve(webPublic, 'logo.svg'), 'utf-8');
const svg = renderDefaultOgSvg(logoSvg);
const png = svgToPng(svg);
await fs.writeFile(outPath, png);
console.log(`wrote ${outPath} (${png.byteLength} bytes)`);
