// Generate pixel-art piece sprites and fog tiles via 3 image APIs:
//   --provider flux     -> Replicate, black-forest-labs/flux-1.1-pro
//   --provider recraft  -> Replicate, recraft-ai/recraft-v3 (pixel-art style)
//   --provider gpt      -> OpenAI, gpt-image-1
//
// Single-shot:
//   node scripts/pixel-gen.mjs --provider gpt --prompt "..." --out knight-nes
//
// Batch (knight comparison, 3 styles × 3 providers = 9 outputs):
//   node scripts/pixel-gen.mjs --batch knight
//
// Batch (fog tiles, 3 styles × 3 providers = 9 outputs):
//   node scripts/pixel-gen.mjs --batch fog
//
// Env required:
//   REPLICATE_API_TOKEN  (for flux + recraft)
//   OPENAI_API_KEY       (for gpt)
//
// Outputs land in apps/web/public/pixel-lab/<provider>/<name>.png.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_BASE = resolve(REPO_ROOT, 'apps/web/public/pixel-lab');

const STYLES = {
  nes: {
    suffix: 'NES Final Fantasy 1 / Dragon Quest 8-bit style, warm sepia palette (cream, tan, dark brown, black), hard 1-pixel black outlines, NO anti-aliasing, NO gradients, transparent background',
    fogSuffix: 'NES 8-bit style dark mist texture, warm dark brown and black, large pixel grain, NO anti-aliasing',
  },
  gameboy: {
    suffix: 'original GameBoy DMG palette using ONLY these 4 colors: #9bbc0f (lightest green), #8bac0f, #306230, #0f380f (darkest green). 8-bit pixel art, NO anti-aliasing, NO other colors, transparent background',
    fogSuffix: 'GameBoy DMG 4-shade green dithered mist, ONLY these colors: #9bbc0f, #8bac0f, #306230, #0f380f. Large pixel grain, NO anti-aliasing',
  },
  modern: {
    suffix: 'modern indie pixel art style like Celeste or Stardew Valley, cool palette (lavender, soft purple, deep indigo, off-white), subtle anti-aliased edges using palette colors only, transparent background',
    fogSuffix: 'modern indie pixel art atmospheric mist, cool palette (lavender, soft purple, deep indigo), subtle dithering, soft horizontal drift suggesting drifting fog',
  },
  // A — Atmospheric Staunton (Mistboard signature, gameplay-focused):
  // classic silhouettes with mist wisps at the base and moonlight rim glow.
  atmospheric: {
    suffix: 'MISTBOARD ATMOSPHERIC STAUNTON style: the piece silhouette EMERGES FROM DRIFTING FOG — wispy white mist trails curl up around the foot of the piece, and a soft moonlight glow rims the upper silhouette as if backlit by moonlight through mist. Misty cool palette: deep slate-charcoal outlines, pale silver highlights, faint teal-cyan accents, white fog wisps at the base. The body color follows the chess-piece-side instruction above (pale silver-blue for white, deep slate-charcoal for black). Hard pixel edges, no anti-aliasing except palette-color soft glow at the rim. Transparent background.',
    fogSuffix: 'Mistboard atmospheric mist texture, cool palette (silver-blue, slate, white wisps), subtle drift',
  },
  // C — Lantern in the dark (Mistboard distribution/showcase set):
  // dark silhouettes for both sides; side identified by lantern color.
  lantern: {
    suffix: 'MISTBOARD LANTERN style. The chess piece is rendered like a SOLID FILLED SILHOUETTE LOGO — imagine the chess piece shape STAMPED IN SOLID INK across the canvas. The ENTIRE INTERIOR of the piece is filled with solid opaque color, no outline-only rendering, no hollow body, no transparency inside the piece shape. ONLY the background (outside the piece outline) is transparent. The piece silhouette fills about 75% of the canvas height. Per-piece lantern placement: PAWN — small lantern at the foot/base; KNIGHT — small lantern hanging from the bridle near the mouth; BISHOP — small glow at the tip of the mitre; ROOK — a single lit window in the tower; QUEEN — small glowing orb in the crown\'s center; KING — small glowing gem in the crown\'s center. The lantern is a SMALL accent (~15% of the piece) and casts a small soft pool of light on the immediately adjacent piece body. A subtle 1-pixel pale moonlight rim traces the upper silhouette edges. Subtle grey mist wisps drift at the base (small, secondary). Pixel art aesthetic: visible pixel grid, hard pixel edges. The piece body interior is FILLED, not hollow. Background OUTSIDE the piece is transparent.',
    colorLine: (color) => color === 'white'
      ? 'WHITE-SIDE chess piece. The piece body interior is FILLED SOLID with a medium-dark slate-blue color (around #44506b — visibly mid-dark, like a chess piece silhouette stamped in deep slate ink). NOT an outline. NOT pure black. NOT invisible. The integrated lantern glows WARM GOLDEN-AMBER.'
      : 'BLACK-SIDE chess piece. The piece body interior is FILLED SOLID with a darker charcoal-slate color (around #2a2f3e — visibly dark but still readable as a chess silhouette stamped in dark ink). NOT an outline. NOT pure black. NOT invisible. The integrated lantern glows COOL CYAN-ICE-BLUE.',
    fogSuffix: 'Mistboard lantern-style night fog texture, dark blue-black with subtle warm and cool light wisps drifting through',
  },
  // Lantern Dark — bespoke per-piece prompts preserving the original probe's
  // "shrouded in deep dark blue-black mist, silhouetted against darkness, single
  // warm/cool glow at the lantern" aesthetic. Each piece carries its lantern at
  // a natural location for its silhouette.
  'lantern-dark': {
    buildPrompt: (pieceKey, color) => {
      const warmth = color === 'white' ? 'WARM GOLDEN-AMBER' : 'COOL CYAN-ICE-BLUE';
      const rimColor = color === 'white' ? 'amber' : 'cyan';
      const base = `Pixel art piece, 32x32 design rendered crisp at high resolution, hard pixel edges, no anti-aliasing except the lantern's soft glow. Palette: very dark navy and black mist tones for the piece body, a single ${warmth} glow at the lantern (the bright focal point), faint ${rimColor} rim light where the lantern's light touches the piece body. Transparent background. The piece is shrouded in deep dark blue-black mist — its body silhouetted against the darkness, mostly hidden except where lantern light touches it.`;
      switch (pieceKey) {
        case 'P':
          return `A chess PAWN piece: a small squat figure with a round head atop a ringed collar and a wide flared circular base. ${base} A small glowing lantern sits on the base beside the pawn, casting ${warmth} light upward, illuminating the underside of the pawn's body with a soft ${rimColor} glow.`;
        case 'N':
          return `A chess KNIGHT piece: horsehead silhouette facing LEFT, mane down the back, mounted on a circular base. ${base} A small glowing lantern hangs from the bridle near the horse's mouth, casting ${warmth} light. The lantern is the bright focal point — faint ${rimColor} rim light traces the front of the muzzle and the chest where the lantern's light touches the horse.`;
        case 'B':
          return `A chess BISHOP piece: tall slim profile with a pointed mitre top split by a vertical slit, narrow collar, wide circular base. ${base} A small glowing lantern hangs from a chain off the front of the mitre, casting ${warmth} light downward and forward. The lantern light illuminates the lower front edge of the mitre and the upper body with a soft ${rimColor} glow.`;
        case 'R':
          return `A chess ROOK piece: a short castle tower with rectangular crenellations along the top edge, vertical sides, wide stepped base. ${base} A single rectangular window in the tower wall glows from within with ${warmth} light — a hidden lantern inside the tower. The window is the bright focal point — the rest of the tower is dark, with faint ${rimColor} rim light where the window's light spills onto the surrounding stones.`;
        case 'Q':
          return `A chess QUEEN piece: tall stately figure with a crown of rounded points along the top, narrowing collar, wide circular base. ${base} She holds a small glowing lantern aloft beside her crown, casting ${warmth} light outward. The lantern is held at the queen's shoulder level — its light illuminates the side of her crown, neck, and upper body with a soft ${rimColor} glow.`;
        case 'K':
          return `A chess KING piece: tallest figure with a CROSS on top above a rounded crown, narrowing collar, wide circular base. ${base} He holds a small glowing lantern aloft beside his crown, casting ${warmth} light outward. The lantern is held at the king's shoulder level — its light illuminates the side of his crown (including the cross), neck, and upper body with a soft ${rimColor} glow.`;
        default:
          throw new Error(`unknown piece key: ${pieceKey}`);
      }
    },
    fogSuffix: 'Lantern-dark night fog: deep navy and black mist with warm and cool light pinpricks drifting through',
  },
  // Simpler 8-bit retry. Strip back to "chess piece + lantern, NES style."
  // Let gpt-image-1 pick natural lantern placement per piece. Visible body
  // colors per side (no "invisible silhouette" trap). Chunky pixels.
  'lantern-8bit': {
    suffix: 'NES Final Fantasy 1 / Dragon Quest 8-bit pixel art style. Chunky pixels, limited 4-color palette per piece, hard 1-pixel black outlines, NO anti-aliasing, NO gradients. The chess piece has a small glowing lantern attached to or held by the piece (the model picks natural placement for the piece type — e.g. lantern in knight\'s mouth, lantern at foot of pawn, lantern at top of bishop\'s mitre, lantern at the rook\'s window). The lantern is small (15-20% of the piece). Centered, full body visible, small margin. 16x16 pixel art rendered crisp at high resolution. Transparent background.',
    colorLine: (color) => color === 'white'
      ? 'WHITE chess piece: solid pale cream-grey body (#e0d8c8) with dark brown outlines (#3a2818). The lantern glows WARM GOLDEN-AMBER (#ffb84a).'
      : 'BLACK chess piece: solid dark slate body (#3a3a4a) with near-black outlines (#0a0a14). The lantern glows COOL CYAN-ICE (#7adaff).',
    fogSuffix: 'NES 8-bit lantern fog, dark night with warm and cool light pinpricks',
  },
};

const PIECES = {
  P: { code: 'P', label: 'pawn', desc: 'a CHESS PAWN piece: short squat piece with a round ball-head on top of a ringed collar and a wide flared circular base. The classic Staunton pawn silhouette.' },
  N: { code: 'N', label: 'knight', desc: 'a CHESS KNIGHT piece: a horsehead silhouette facing LEFT, with a flowing mane down the back, a defined muzzle and ear, mounted on a circular base.' },
  B: { code: 'B', label: 'bishop', desc: 'a CHESS BISHOP piece: tall slim profile with a pointed mitre top split by a single vertical slit, narrow collar, and a wide circular base.' },
  R: { code: 'R', label: 'rook', desc: 'a CHESS ROOK piece: a short squat castle tower with FOUR rectangular crenellations along the top edge, vertical sides, and a wider stepped base.' },
  Q: { code: 'Q', label: 'queen', desc: 'a CHESS QUEEN piece: tall stately piece with a crown of NINE rounded points along the top, narrowing collar, and a wide circular base. Slightly taller than the bishop.' },
  K: { code: 'K', label: 'king', desc: 'a CHESS KING piece: tallest piece with a CROSS on top above a rounded crown, narrowing collar, and a wide circular base.' },
};

const FOG_BASE = 'A seamless tileable atmospheric fog texture for use as a chess board square overlay, abstract mist, no recognizable objects.';

function buildPiecePrompt(pieceKey, styleKey, color) {
  const piece = PIECES[pieceKey];
  const style = STYLES[styleKey];
  // Some styles (lantern-dark) provide a fully bespoke builder; honor it.
  if (typeof style.buildPrompt === 'function') return style.buildPrompt(pieceKey, color);
  const defaultColorLine = color === 'white'
    ? 'WHITE chess piece (light-colored body, pale fill).'
    : 'BLACK chess piece (dark-colored body, deep fill).';
  const colorLine = typeof style.colorLine === 'function' ? style.colorLine(color) : defaultColorLine;
  return `${piece.desc} ${colorLine} Centered, full body visible with small margin. 32x32 pixel art design rendered crisp at high resolution. ${style.suffix}`;
}

function buildFogPrompt(styleKey) {
  const style = STYLES[styleKey];
  return `${FOG_BASE} ${style.fogSuffix}`;
}

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

async function saveBytes(provider, name, bytes) {
  const dir = resolve(OUT_BASE, provider);
  await ensureDir(dir);
  const path = resolve(dir, `${name}.png`);
  await writeFile(path, bytes);
  return path;
}

async function fetchToBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
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
  // If still processing (rare with Prefer: wait), poll.
  if (data.status === 'starting' || data.status === 'processing') {
    return pollReplicate(data.id, token);
  }
  if (data.status !== 'succeeded') {
    throw new Error(`Replicate failed: ${data.status} ${JSON.stringify(data.error)}`);
  }
  return extractReplicateOutput(data.output);
}

async function pollReplicate(id, token) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    if (data.status === 'succeeded') return extractReplicateOutput(data.output);
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${JSON.stringify(data.error)}`);
    }
  }
  throw new Error('Replicate polling timed out');
}

function extractReplicateOutput(output) {
  // Output may be a string URL or an array of URLs.
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error(`Unexpected Replicate output shape: ${JSON.stringify(output)}`);
}

async function genFlux(prompt) {
  const url = await replicateRun('black-forest-labs', 'flux-1.1-pro', {
    prompt,
    aspect_ratio: '1:1',
    output_format: 'png',
    safety_tolerance: 2,
  });
  return fetchToBytes(url);
}

async function genRecraft(prompt) {
  const url = await replicateRun('recraft-ai', 'recraft-v3', {
    prompt,
    size: '1024x1024',
    style: 'digital_illustration/pixel_art',
  });
  return fetchToBytes(url);
}

async function genGpt(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI gpt-image-1: ${r.status} ${text}`);
  const data = JSON.parse(text);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI response missing b64_json: ${text.slice(0, 200)}`);
  return Buffer.from(b64, 'base64');
}

const PROVIDERS = {
  flux: genFlux,
  recraft: genRecraft,
  gpt: genGpt,
};

async function generate(provider, prompt, name) {
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`unknown provider: ${provider}`);
  process.stdout.write(`[${provider}] ${name}... `);
  const t0 = Date.now();
  try {
    const bytes = await fn(prompt);
    const path = await saveBytes(provider, name, bytes);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`ok (${dt}s) -> ${path.replace(REPO_ROOT + '/', '')}`);
    return { ok: true, path };
  } catch (err) {
    console.log(`FAIL ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function runBatchKnight(providers) {
  const styles = ['nes', 'gameboy', 'modern'];
  const colors = ['white', 'black'];
  const results = [];
  for (const provider of providers) {
    for (const style of styles) {
      for (const color of colors) {
        const prompt = buildPiecePrompt('N', style, color);
        const name = `knight-${style}-${color === 'white' ? 'w' : 'b'}`;
        results.push(await generate(provider, prompt, name));
      }
    }
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} generated.`);
}

async function runBatchSet(providers, styleFilter, pieceFilter) {
  const styles = styleFilter ? [styleFilter] : ['nes', 'gameboy', 'modern'];
  const colors = ['white', 'black'];
  const allPieceKeys = Object.keys(PIECES); // P N B R Q K
  const pieceKeys = pieceFilter
    ? pieceFilter.split('').filter((p) => allPieceKeys.includes(p))
    : allPieceKeys;
  const results = [];
  for (const provider of providers) {
    for (const style of styles) {
      for (const piece of pieceKeys) {
        for (const color of colors) {
          const prompt = buildPiecePrompt(piece, style, color);
          const c = color === 'white' ? 'w' : 'b';
          const name = `set-${style}-${c}${piece}`;
          results.push(await generate(provider, prompt, name));
        }
      }
    }
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} generated.`);
}

async function runBatchFog(providers) {
  const styles = ['nes', 'gameboy', 'modern'];
  const results = [];
  for (const provider of providers) {
    for (const style of styles) {
      const prompt = buildFogPrompt(style);
      const name = `fog-${style}`;
      results.push(await generate(provider, prompt, name));
    }
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} generated.`);
}

const args = parseArgs(process.argv.slice(2));

const onlyArg = typeof args.only === 'string' ? args.only : null;
const providerSubset = onlyArg ? onlyArg.split(',').filter((p) => p in PROVIDERS) : Object.keys(PROVIDERS);

const styleFilter = typeof args.style === 'string' ? args.style : null;

if (args.batch === 'knight') {
  await runBatchKnight(providerSubset);
} else if (args.batch === 'fog') {
  await runBatchFog(providerSubset);
} else if (args.batch === 'set') {
  const pieceFilter = typeof args.pieces === 'string' ? args.pieces.toUpperCase() : null;
  await runBatchSet(providerSubset, styleFilter, pieceFilter);
} else if (args.provider && args.prompt && args.out) {
  await generate(args.provider, args.prompt, args.out);
} else {
  console.error(
    'Usage:\n' +
      '  node scripts/pixel-gen.mjs --provider <flux|recraft|gpt> --prompt "..." --out <name>\n' +
      '  node scripts/pixel-gen.mjs --batch knight [--only flux,recraft,gpt]\n' +
      '  node scripts/pixel-gen.mjs --batch fog    [--only flux,recraft,gpt]\n' +
      '  node scripts/pixel-gen.mjs --batch set    [--style modern] [--only recraft,gpt]\n',
  );
  process.exit(1);
}
