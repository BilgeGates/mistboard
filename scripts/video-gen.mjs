// Animate a still image into a short video clip via Replicate.
//
// Usage:
//   node --env-file=.env scripts/video-gen.mjs \
//     --image apps/web/public/pixel-lab-assets/gpt/fog-mistveil.png \
//     --out fog-mistveil
//
// SECRET HANDLING: a repo-root .env is fine for Node's --env-file flag to
// read. The agent (Claude) must NOT use its Read/Write tools on .env — only
// the user touches that file. Node reading via process.env / --env-file does
// not trigger the harness's file-modified tracker.
//
// Default model: wan-video/wan-2.2-i2v-fast (img2vid, ~$0.04/video, 81 frames).
//
// Outputs land at apps/web/public/pixel-lab-assets/video/<out>.mp4.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, 'apps/web/public/pixel-lab-assets/video');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function imageToDataUrl(path) {
  const bytes = await readFile(path);
  const b64 = bytes.toString('base64');
  return `data:image/png;base64,${b64}`;
}

async function replicateRun(modelOwner, modelName, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set');
  const url = `https://api.replicate.com/v1/models/${modelOwner}/${modelName}/predictions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({ input }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Replicate ${modelOwner}/${modelName}: ${r.status} ${text}`);
  const data = JSON.parse(text);
  if (data.status === 'starting' || data.status === 'processing') {
    return pollReplicate(data.id, token);
  }
  if (data.status !== 'succeeded') {
    throw new Error(`Replicate failed: ${data.status} ${JSON.stringify(data.error)}`);
  }
  return extractOutput(data.output);
}

async function pollReplicate(id, token) {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    if (data.status === 'succeeded') return extractOutput(data.output);
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${JSON.stringify(data.error)}`);
    }
  }
  throw new Error('Replicate polling timed out');
}

function extractOutput(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  if (output && typeof output === 'object' && output.url) return output.url;
  throw new Error(`Unexpected output shape: ${JSON.stringify(output)}`);
}

async function genWan(imageDataUrl, prompt) {
  return replicateRun('wan-video', 'wan-2.2-i2v-fast', {
    image: imageDataUrl,
    prompt:
      prompt ||
      'seamless drifting atmospheric fog, slow horizontal mist motion, looping seamlessly',
    num_frames: 81,
    frames_per_second: 16,
    resolution: '480p',
    interpolate_output: false,
  });
}

const MODELS = {
  wan: { gen: genWan, ext: 'mp4', label: 'Wan 2.2 i2v-fast' },
};

const args = parseArgs(process.argv.slice(2));
const modelKey = typeof args.model === 'string' ? args.model : 'wan';
const model = MODELS[modelKey];
if (!model) throw new Error(`unknown model: ${modelKey}`);
if (!args.image || !args.out) {
  console.error('Usage: node scripts/video-gen.mjs --image <path.png> --out <name> [--model svd]');
  process.exit(1);
}

await ensureDir(OUT_DIR);
const imagePath = resolve(REPO_ROOT, args.image);
console.log(`[${modelKey}] ${args.out}: encoding image...`);
const dataUrl = await imageToDataUrl(imagePath);
console.log(`[${modelKey}] ${args.out}: calling ${model.label}...`);
const t0 = Date.now();
const videoUrl = await model.gen(
  dataUrl,
  typeof args.prompt === 'string' ? args.prompt : undefined,
);
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[${modelKey}] ${args.out}: got URL in ${dt}s, downloading...`);
const r = await fetch(videoUrl);
if (!r.ok) throw new Error(`download failed: ${r.status}`);
const bytes = Buffer.from(await r.arrayBuffer());
const outPath = resolve(OUT_DIR, `${args.out}.${model.ext}`);
await writeFile(outPath, bytes);
console.log(
  `saved -> ${outPath.replace(REPO_ROOT + '/', '')}  (${(bytes.length / 1024).toFixed(0)} KB)`,
);
