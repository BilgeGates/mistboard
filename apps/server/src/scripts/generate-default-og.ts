import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDefaultOgSvg, svgToPng } from '../og-image.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', '..', '..', 'web', 'public', 'og-image.png');

const svg = renderDefaultOgSvg();
const png = svgToPng(svg);
await fs.writeFile(outPath, png);
console.log(`wrote ${outPath} (${png.byteLength} bytes)`);
