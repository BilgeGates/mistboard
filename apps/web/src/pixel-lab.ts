// Hidden DEV-only experimentation surface at /pixel-lab. Compares AI-generated
// pixel-art piece sets and fog tiles across multiple providers and styles.
//
// Assets at apps/web/public/pixel-lab-assets/<provider>/*.png are gitignored (large,
// reproducible). Regenerate with:
//   node --env-file=.env scripts/pixel-gen.mjs --batch set --style <name>
//   node --env-file=.env scripts/pixel-gen.mjs --batch fog
//   node --env-file=.env scripts/video-gen.mjs --image <png> --out <name>
//   node scripts/loop-video.mjs --in <mp4> --out <name>
// Requires REPLICATE_API_TOKEN + OPENAI_API_KEY in .env (gitignored). The
// agent (Claude) must not Read or Write .env directly — only the user
// populates it. Node reading via --env-file is fine.
//
// Findings as of 2026-05-22:
//   * gpt-image-1 produces the most consistent pixel-art sets at scale.
//     Recraft v3 has true transparency but poor cross-piece style adherence.
//     Flux 1.1 Pro is beautiful but has no alpha channel (rules it out for
//     piece sprites; still usable for fog).
//   * Atmospheric Staunton + 8-bit Lantern sets both succeeded at set level.
//   * The original "dark lantern in mist" probe knight was the best single
//     output, but the aesthetic collapses at set level — gpt-image-1 reads
//     "shrouded in darkness + transparent background" as "render almost
//     nothing." Unblocking it likely requires either a pixel artist or a
//     dark-background + post-processing alpha-extraction pipeline.
//   * Fog tile animation works via Wan 2.2 i2v-fast + ffmpeg palindrome loop
//     (~$0.04/tile + free local post-processing for seamless loop).
//
// Hand-authored SVG sprites below are baseline-only and obsolete vs. the
// AI-generated outputs; kept as a "what hand-coded looks like" reference.

type Palette = {
  // index 0 = transparent, 1 = outline, 2 = dark, 3 = mid, 4 = light, 5 = highlight
  readonly white: readonly [string, string, string, string, string, string];
  readonly black: readonly [string, string, string, string, string, string];
};

type Style = {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly palette: Palette;
  readonly fogColors: readonly [string, string]; // dark, light — alternated for dither
  readonly boardLight: string;
  readonly boardDark: string;
};

const transparent = 'transparent';

const STYLES: readonly Style[] = [
  {
    id: 'nes',
    label: 'NES chunky',
    blurb: 'Final Fantasy 1 / Dragon Quest. Warm sepia, hard outlines, 4 colors.',
    palette: {
      white: [transparent, '#2a1810', '#6b4423', '#b48d50', '#e8c98a', '#fff5d6'],
      black: [transparent, '#0a0604', '#2a1810', '#4a2c1a', '#7a4a2a', '#a06030'],
    },
    fogColors: ['#1a0f08', '#3a2418'],
    boardLight: '#d4a574',
    boardDark: '#8b5a2b',
  },
  {
    id: 'gameboy',
    label: 'GameBoy DMG',
    blurb: 'Original 4-shade green LCD. Same palette for both sides — read by density.',
    palette: {
      white: [transparent, '#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#cadc9f'],
      black: [transparent, '#0f380f', '#0f380f', '#306230', '#306230', '#8bac0f'],
    },
    fogColors: ['#0f380f', '#306230'],
    boardLight: '#8bac0f',
    boardDark: '#306230',
  },
  {
    id: 'modern',
    label: 'Modern pixel',
    blurb: 'Celeste / Stardew. Cooler palette, soft AA edges, more midtones.',
    palette: {
      white: [transparent, '#1c1a2e', '#5a4a6e', '#a08bb0', '#e0d4e8', '#ffffff'],
      black: [transparent, '#0a0814', '#1c1a2e', '#3a3050', '#5a4a6e', '#8070a0'],
    },
    fogColors: ['#1c1a2e', '#3a3050'],
    boardLight: '#c8b8d8',
    boardDark: '#5a4a6e',
  },
];

// Pixel codes: . = 0 (transparent), 1 = outline, 2 = dark, 3 = mid, 4 = light, 5 = highlight
//
// Pawn — squat, rounded, base-flared. Light from top-left.
const PAWN = [
  '................',
  '................',
  '......1111......',
  '.....144441.....',
  '.....145441.....',
  '......1441......',
  '.....144441.....',
  '....14444441....',
  '....14443331....',
  '.....14431......',
  '.....14431......',
  '....144443321...',
  '...14444433321..',
  '..1444433333321.',
  '..1111111111111.',
  '................',
];

// Knight — horsehead facing left, connected silhouette (no floating pixels).
// Ear at top, eye highlight on the side, mouth notch on the front, mane
// flowing down-right into the neck, widening base.
const KNIGHT = [
  '................',
  '......11........',
  '.....1441.......',
  '....144441......',
  '...14444411.....',
  '...14454443321..',
  '..1444444443321.',
  '..1411444443321.',
  '.144.1444433321.',
  '1441..14443332..',
  '.14...144433321.',
  '......144433321.',
  '......1444333321',
  '.....14444433321',
  '....144444433321',
  '....111111111111',
];

function renderSprite(pixels: readonly string[], colors: readonly string[], scale: number = 1): string {
  const w = pixels[0].length;
  const h = pixels.length;
  const rects: string[] = [];
  for (let y = 0; y < h; y++) {
    const row = pixels[y];
    let runStart = -1;
    let runColor = '';
    for (let x = 0; x <= w; x++) {
      const ch = x < w ? row[x] : '.';
      const idx = ch === '.' ? 0 : parseInt(ch, 10);
      const color = idx === 0 ? '' : colors[idx];
      if (color !== runColor) {
        if (runStart >= 0 && runColor) {
          rects.push(
            `<rect x="${runStart * scale}" y="${y * scale}" width="${(x - runStart) * scale}" height="${scale}" fill="${runColor}"/>`,
          );
        }
        runStart = x;
        runColor = color;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * scale} ${h * scale}" shape-rendering="crispEdges" width="${w * scale}" height="${h * scale}">${rects.join('')}</svg>`;
}

// Dithered fog tile — Bayer 4x4 ordered dither @ 50% in style colors. 16x16 tileable.
function renderFogTile(dark: string, light: string, scale: number = 1): string {
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const w = 16;
  const h = 16;
  const rects: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const threshold = bayer4[y % 4][x % 4];
      const color = threshold < 8 ? dark : light;
      rects.push(
        `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${color}"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * scale} ${h * scale}" shape-rendering="crispEdges" width="${w * scale}" height="${h * scale}">${rects.join('')}</svg>`;
}

function dataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function styleCard(style: Style): HTMLElement {
  const card = document.createElement('section');
  card.className = 'pixel-lab__card';

  const header = document.createElement('header');
  header.className = 'pixel-lab__card-header';
  const title = document.createElement('h2');
  title.textContent = style.label;
  const blurb = document.createElement('p');
  blurb.textContent = style.blurb;
  blurb.className = 'pixel-lab__blurb';
  header.append(title, blurb);

  // Sprite row — pawn + knight, both colors, large preview at 8x scale.
  const spriteRow = document.createElement('div');
  spriteRow.className = 'pixel-lab__sprite-row';
  const sprites: Array<[string, readonly string[], readonly string[]]> = [
    ['wP', PAWN, style.palette.white],
    ['wN', KNIGHT, style.palette.white],
    ['bP', PAWN, style.palette.black],
    ['bN', KNIGHT, style.palette.black],
  ];
  for (const [label, pixels, palette] of sprites) {
    const cell = document.createElement('div');
    cell.className = 'pixel-lab__sprite-cell';
    const img = document.createElement('img');
    img.src = dataUrl(renderSprite(pixels, palette, 1));
    img.alt = `${label} ${style.id}`;
    img.width = 128;
    img.height = 128;
    img.style.imageRendering = 'pixelated';
    const cap = document.createElement('div');
    cap.className = 'pixel-lab__sprite-label';
    cap.textContent = label;
    cell.append(img, cap);
    spriteRow.append(cell);
  }

  // Mini board — 4x4 squares with pieces placed + fog overlay on one square.
  const boardWrap = document.createElement('div');
  boardWrap.className = 'pixel-lab__board-wrap';
  const board = document.createElement('div');
  board.className = 'pixel-lab__board';
  board.style.setProperty('--light', style.boardLight);
  board.style.setProperty('--dark', style.boardDark);
  // 4x4 mini board. Place a few pieces + a fog square.
  const layout: Array<{ piece?: 'wP' | 'wN' | 'bP' | 'bN'; fog?: boolean }> = [
    { piece: 'bN' }, {}, { piece: 'bP' }, { fog: true },
    {}, { piece: 'bP' }, { fog: true }, {},
    {}, { fog: true }, { piece: 'wP' }, {},
    { piece: 'wN' }, {}, {}, { piece: 'wP' },
  ];
  const fogUrl = dataUrl(renderFogTile(style.fogColors[0], style.fogColors[1], 1));
  for (let i = 0; i < 16; i++) {
    const square = document.createElement('div');
    const file = i % 4;
    const rank = Math.floor(i / 4);
    const isLight = (file + rank) % 2 === 0;
    square.className = `pixel-lab__square ${isLight ? 'is-light' : 'is-dark'}`;
    const slot = layout[i];
    if (slot.piece) {
      const isWhite = slot.piece.startsWith('w');
      const isPawn = slot.piece.endsWith('P');
      const sprite = renderSprite(
        isPawn ? PAWN : KNIGHT,
        isWhite ? style.palette.white : style.palette.black,
        1,
      );
      const img = document.createElement('img');
      img.src = dataUrl(sprite);
      img.style.imageRendering = 'pixelated';
      img.style.width = '100%';
      img.style.height = '100%';
      square.append(img);
    }
    if (slot.fog) {
      const fog = document.createElement('div');
      fog.className = 'pixel-lab__fog';
      fog.style.backgroundImage = `url("${fogUrl}")`;
      fog.style.imageRendering = 'pixelated';
      square.append(fog);
    }
    board.append(square);
  }
  boardWrap.append(board);

  // Fog tile preview at large scale.
  const fogPreview = document.createElement('div');
  fogPreview.className = 'pixel-lab__fog-preview';
  const fogLabel = document.createElement('div');
  fogLabel.className = 'pixel-lab__fog-label';
  fogLabel.textContent = 'Fog tile (16×16, Bayer dither)';
  const fogImg = document.createElement('img');
  fogImg.src = fogUrl;
  fogImg.width = 128;
  fogImg.height = 128;
  fogImg.style.imageRendering = 'pixelated';
  fogPreview.append(fogLabel, fogImg);

  // Palette swatches.
  const swatches = document.createElement('div');
  swatches.className = 'pixel-lab__swatches';
  for (const [label, colors] of [
    ['white', style.palette.white],
    ['black', style.palette.black],
  ] as const) {
    const group = document.createElement('div');
    group.className = 'pixel-lab__swatch-group';
    const groupLabel = document.createElement('span');
    groupLabel.textContent = label;
    group.append(groupLabel);
    for (let i = 1; i < colors.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'pixel-lab__swatch';
      dot.style.background = colors[i];
      dot.title = colors[i];
      group.append(dot);
    }
    swatches.append(group);
  }

  card.append(header, spriteRow, boardWrap, fogPreview, swatches);
  return card;
}

const PROVIDERS = ['flux', 'recraft', 'gpt'] as const;
const PROVIDER_LABELS: Record<(typeof PROVIDERS)[number], string> = {
  flux: 'Flux 1.1 Pro',
  recraft: 'Recraft v3',
  gpt: 'gpt-image-1',
};

const PIECE_ORDER = ['K', 'Q', 'R', 'B', 'N', 'P'] as const;

function fogVariantsSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__api';

  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Fog variants — pushing further';
  const p = document.createElement('p');
  p.textContent =
    'New fog directions beyond the original 9, plus first animated test (Wan 2.2 image-to-video).';
  header.append(h2, p);
  section.append(header);

  const grid = document.createElement('div');
  grid.className = 'pixel-lab__fog-grid';

  const variants: Array<{ id: string; label: string; blurb: string; isVideo?: boolean; src?: string }> = [
    { id: 'fog-mistveil', label: 'Mistveil (static)', blurb: 'Dense rolling cloud cover, atmospheric depth' },
    { id: 'fog-mistveil-video', label: 'Mistveil (ANIMATED — raw)', blurb: 'Wan 2.2 i2v, 5s, raw — seam visible at loop point', isVideo: true },
    { id: 'fog-mistveil-loop', label: 'Mistveil (LOOPED — palindrome)', blurb: '10s perfect loop, forward+reverse concat via ffmpeg', isVideo: true, src: '/pixel-lab-assets/video/fog-mistveil-loop.mp4' },
    { id: 'fog-lantern', label: 'Lantern-lit night', blurb: 'Dark with warm/cool light pinpricks' },
    { id: 'fog-wispy', label: 'Wispy sparse drift', blurb: 'Too sparse — reads as calligraphy not fog' },
    { id: 'fog-void', label: 'Deep void', blurb: 'Near-black, extreme "see nothing" mode' },
  ];

  for (const v of variants) {
    const cell = document.createElement('div');
    cell.className = 'pixel-lab__fog-cell';
    if (v.isVideo) {
      const vid = document.createElement('video');
      vid.src = v.src || `/pixel-lab-assets/video/fog-mistveil.mp4`;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.style.width = '100%';
      vid.style.height = 'auto';
      vid.style.display = 'block';
      cell.append(vid);
    } else {
      const img = document.createElement('img');
      img.src = `/pixel-lab-assets/gpt/${v.id}.png`;
      img.alt = v.label;
      img.style.imageRendering = 'pixelated';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      cell.append(img);
    }
    const cap = document.createElement('div');
    cap.className = 'pixel-lab__fog-cap';
    const capLabel = document.createElement('strong');
    capLabel.textContent = v.label;
    const capBlurb = document.createElement('span');
    capBlurb.textContent = v.blurb;
    cap.append(capLabel, document.createElement('br'), capBlurb);
    cell.append(cap);
    grid.append(cell);
  }
  section.append(grid);
  return section;
}

function themedKnightsSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__themed';
  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Themed knight probes — searching for the Mistboard signature';
  const p = document.createElement('p');
  p.textContent =
    '3 directions tested. Pick which (if any) becomes the basis for a full set.';
  header.append(h2, p);
  section.append(header);

  const grid = document.createElement('div');
  grid.className = 'pixel-lab__themed-grid';
  const themes: Array<{ id: string; label: string; blurb: string }> = [
    { id: 'A-atmospheric', label: 'A. Atmospheric Staunton', blurb: 'Classic silhouette + fog wisps + cool grey-blue. Safe evolution.' },
    { id: 'B-shrouded', label: 'B. Shrouded / visored', blurb: 'Reads as grungy knight, not fog-themed. Weakest.' },
    { id: 'C-lantern', label: 'C. Lantern in the dark', blurb: 'Dark horsehead with glowing lantern. Strongest identity — but white/black distinction needs work.' },
  ];
  for (const t of themes) {
    const card = document.createElement('div');
    card.className = 'pixel-lab__themed-card';
    const img = document.createElement('img');
    img.src = `/pixel-lab-assets/gpt/themed-${t.id}-w.png`;
    img.alt = t.label;
    img.style.imageRendering = 'pixelated';
    const labelEl = document.createElement('h3');
    labelEl.textContent = t.label;
    const blurbEl = document.createElement('p');
    blurbEl.textContent = t.blurb;
    blurbEl.className = 'pixel-lab__themed-blurb';
    card.append(img, labelEl, blurbEl);
    grid.append(card);
  }
  section.append(grid);
  return section;
}

// 8x8 starting-position chess board with the gpt-image-1 Modern set at real
// board scale, plus a few fog overlays to test the combined look. This is the
// closest preview to how the pieces will render in production.
function realScaleBoardSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__board-section';

  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Real-scale preview — Lantern Dark 8-bit (gpt-image-2)';
  const p = document.createElement('p');
  p.textContent =
    'Pieces at ~64px squares (close to production board scale). Fog overlay on a4, c5, f5, h4 to test how the set reads with mist. If pieces and fog read clearly here, the set is shippable.';
  header.append(h2, p);
  section.append(header);

  // FEN-derived starting position. Row 0 = rank 8 (black back), Row 7 = rank 1.
  const startingPosition = [
    ['bR','bN','bB','bQ','bK','bB','bN','bR'],
    ['bP','bP','bP','bP','bP','bP','bP','bP'],
    ['',  '',  '',  '',  '',  '',  '',  ''  ],
    ['',  '',  '',  '',  '',  '',  '',  ''  ],
    ['',  '',  '',  '',  '',  '',  '',  ''  ],
    ['',  '',  '',  '',  '',  '',  '',  ''  ],
    ['wP','wP','wP','wP','wP','wP','wP','wP'],
    ['wR','wN','wB','wQ','wK','wB','wN','wR'],
  ];

  // Squares to overlay fog on. Coords are [row, col], row=0 is rank 8.
  const fogSquares = new Set(['4,0', '3,2', '3,5', '4,7']);

  const wrap = document.createElement('div');
  wrap.className = 'pixel-lab__realboard-wrap';
  const board = document.createElement('div');
  board.className = 'pixel-lab__realboard';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = `pixel-lab__realboard-sq ${isLight ? 'is-light' : 'is-dark'}`;
      const piece = startingPosition[r][c];
      if (piece) {
        const img = document.createElement('img');
        const color = piece[0]; // w or b
        const type = piece[1]; // K Q R B N P
        img.src = `/pixel-lab-assets/gpt/set-lantern-dark-8bit-${color}${type}.png`;
        img.alt = piece;
        img.style.imageRendering = 'pixelated';
        sq.append(img);
      }
      if (fogSquares.has(`${r},${c}`)) {
        const fog = document.createElement('div');
        fog.className = 'pixel-lab__realboard-fog';
        sq.append(fog);
      }
      board.append(sq);
    }
  }
  wrap.append(board);
  section.append(wrap);

  // A second board at SMALLER scale (~48px squares) to test legibility on a
  // mobile-sized board.
  const smallHeader = document.createElement('p');
  smallHeader.className = 'pixel-lab__realboard-caption';
  smallHeader.textContent = 'Same board, smaller scale (mobile-size ~48px):';
  section.append(smallHeader);

  const smallWrap = document.createElement('div');
  smallWrap.className = 'pixel-lab__realboard-wrap';
  const smallBoard = document.createElement('div');
  smallBoard.className = 'pixel-lab__realboard pixel-lab__realboard--small';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = `pixel-lab__realboard-sq ${isLight ? 'is-light' : 'is-dark'}`;
      const piece = startingPosition[r][c];
      if (piece) {
        const img = document.createElement('img');
        const color = piece[0];
        const type = piece[1];
        img.src = `/pixel-lab-assets/gpt/set-lantern-dark-8bit-${color}${type}.png`;
        img.alt = piece;
        img.style.imageRendering = 'pixelated';
        sq.append(img);
      }
      if (fogSquares.has(`${r},${c}`)) {
        const fog = document.createElement('div');
        fog.className = 'pixel-lab__realboard-fog';
        sq.append(fog);
      }
      smallBoard.append(sq);
    }
  }
  smallWrap.append(smallBoard);
  section.append(smallWrap);

  return section;
}

function fullSetSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__api';

  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Full Modern set — Recraft v3 vs gpt-image-1';
  const p = document.createElement('p');
  p.textContent =
    'All 6 piece types × 2 colors, generated in Modern style on each provider. ' +
    'Compare consistency within each row: do the 12 sprites in each provider feel like they came from the same hand?';
  header.append(h2, p);
  section.append(header);

  for (const provider of ['recraft', 'gpt'] as const) {
    const block = document.createElement('div');
    block.className = 'pixel-lab__set-block';

    const blockLabel = document.createElement('h3');
    blockLabel.textContent = PROVIDER_LABELS[provider];
    blockLabel.className = 'pixel-lab__api-subhead';
    block.append(blockLabel);

    const grid = document.createElement('div');
    grid.className = 'pixel-lab__set-grid';

    for (const color of ['w', 'b'] as const) {
      for (const piece of PIECE_ORDER) {
        const cell = document.createElement('div');
        cell.className = 'pixel-lab__set-cell';
        const img = document.createElement('img');
        img.src = `/pixel-lab/${provider}/set-modern-${color}${piece}.png`;
        img.alt = `${provider} ${color}${piece}`;
        img.loading = 'lazy';
        img.style.imageRendering = 'pixelated';
        img.onerror = () => { img.style.display = 'none'; };
        const cap = document.createElement('div');
        cap.className = 'pixel-lab__set-cap';
        cap.textContent = `${color}${piece}`;
        cell.append(img, cap);
        grid.append(cell);
      }
    }
    block.append(grid);
    section.append(block);
  }

  return section;
}

function themedSetsSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__api';

  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Themed full sets — Atmospheric vs Lantern (Mistboard signature search)';
  const p = document.createElement('p');
  p.textContent =
    'Both sets generated via gpt-image-1, one prompt per piece. Atmospheric: classic silhouettes + fog wisps + cool palette. Lantern: dark silhouettes with warm-gold (white) or cool-cyan (black) light source as the side differentiator.';
  header.append(h2, p);
  section.append(header);

  for (const style of ['lantern-dark-8bit', 'lantern-dark', 'lantern-dark-v1', 'lantern-8bit', 'atmospheric', 'lantern'] as const) {
    const block = document.createElement('div');
    block.className = 'pixel-lab__set-block';

    const blockLabel = document.createElement('h3');
    blockLabel.textContent =
      style === 'atmospheric' ? 'Atmospheric Staunton'
      : style === 'lantern' ? 'Lantern (v3, integrated gems — mixed quality)'
      : style === 'lantern-8bit' ? 'Lantern 8-bit (simpler — pieces holding lanterns)'
      : style === 'lantern-dark-v1' ? 'Lantern Dark V1 (gpt-image-1, FAILED — invisible pieces)'
      : style === 'lantern-dark-8bit' ? 'Lantern Dark — TRUE 8-BIT (gpt-image-2, tight constraints) ★'
      : 'Lantern Dark V2 (gpt-image-2, illustrated — gorgeous but not 8-bit)';
    blockLabel.className = 'pixel-lab__api-subhead';
    block.append(blockLabel);

    const grid = document.createElement('div');
    grid.className = 'pixel-lab__set-grid';

    for (const color of ['w', 'b'] as const) {
      for (const piece of PIECE_ORDER) {
        const cell = document.createElement('div');
        cell.className = 'pixel-lab__set-cell';
        const img = document.createElement('img');
        // v1 outputs were renamed with -v1 suffix; remap path.
        const fileStyle = style === 'lantern-dark-v1' ? 'lantern-dark' : style;
        const suffix = style === 'lantern-dark-v1' ? '-v1' : '';
        img.src = `/pixel-lab-assets/gpt/set-${fileStyle}-${color}${piece}${suffix}.png`;
        img.alt = `${style} ${color}${piece}`;
        img.loading = 'lazy';
        img.style.imageRendering = 'pixelated';
        img.onerror = () => { img.style.display = 'none'; };
        const cap = document.createElement('div');
        cap.className = 'pixel-lab__set-cap';
        cap.textContent = `${color}${piece}`;
        cell.append(img, cap);
        grid.append(cell);
      }
    }
    block.append(grid);
    section.append(block);
  }

  return section;
}

function apiGallery(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pixel-lab__api';

  const header = document.createElement('header');
  header.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'API-generated comparison';
  const p = document.createElement('p');
  p.textContent =
    'Same prompt structure across 3 providers × 3 styles × 2 colors. Row = provider; columns grouped by style. Files under apps/web/public/pixel-lab/<provider>/.';
  header.append(h2, p);
  section.append(header);

  const table = document.createElement('div');
  table.className = 'pixel-lab__api-table';

  const styleIds: Array<{ id: string; label: string }> = [
    { id: 'nes', label: 'NES chunky' },
    { id: 'gameboy', label: 'GameBoy DMG' },
    { id: 'modern', label: 'Modern pixel' },
  ];

  // Header row: empty corner, then style group headers.
  const headerRow = document.createElement('div');
  headerRow.className = 'pixel-lab__api-row pixel-lab__api-row--head';
  const corner = document.createElement('div');
  corner.className = 'pixel-lab__api-cell pixel-lab__api-cell--corner';
  headerRow.append(corner);
  for (const s of styleIds) {
    const cell = document.createElement('div');
    cell.className = 'pixel-lab__api-cell pixel-lab__api-cell--head';
    cell.textContent = s.label;
    headerRow.append(cell);
  }
  table.append(headerRow);

  for (const provider of PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'pixel-lab__api-row';

    const labelCell = document.createElement('div');
    labelCell.className = 'pixel-lab__api-cell pixel-lab__api-cell--rowlabel';
    labelCell.textContent = PROVIDER_LABELS[provider];
    row.append(labelCell);

    for (const s of styleIds) {
      const cell = document.createElement('div');
      cell.className = 'pixel-lab__api-cell';
      for (const color of ['w', 'b'] as const) {
        const img = document.createElement('img');
        img.src = `/pixel-lab/${provider}/knight-${s.id}-${color}.png`;
        img.alt = `${provider} ${s.id} ${color}`;
        img.loading = 'lazy';
        img.style.imageRendering = 'pixelated';
        img.onerror = () => {
          img.style.display = 'none';
        };
        cell.append(img);
      }
      row.append(cell);
    }
    table.append(row);
  }
  section.append(table);

  // Fog row.
  const fogHeader = document.createElement('h3');
  fogHeader.textContent = 'Fog tiles';
  fogHeader.className = 'pixel-lab__api-subhead';
  section.append(fogHeader);

  const fogTable = document.createElement('div');
  fogTable.className = 'pixel-lab__api-table';
  const fogHeaderRow = document.createElement('div');
  fogHeaderRow.className = 'pixel-lab__api-row pixel-lab__api-row--head';
  const fogCorner = document.createElement('div');
  fogCorner.className = 'pixel-lab__api-cell pixel-lab__api-cell--corner';
  fogHeaderRow.append(fogCorner);
  for (const s of styleIds) {
    const cell = document.createElement('div');
    cell.className = 'pixel-lab__api-cell pixel-lab__api-cell--head';
    cell.textContent = s.label;
    fogHeaderRow.append(cell);
  }
  fogTable.append(fogHeaderRow);

  for (const provider of PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'pixel-lab__api-row';
    const labelCell = document.createElement('div');
    labelCell.className = 'pixel-lab__api-cell pixel-lab__api-cell--rowlabel';
    labelCell.textContent = PROVIDER_LABELS[provider];
    row.append(labelCell);
    for (const s of styleIds) {
      const cell = document.createElement('div');
      cell.className = 'pixel-lab__api-cell';
      const img = document.createElement('img');
      img.src = `/pixel-lab/${provider}/fog-${s.id}.png`;
      img.alt = `${provider} fog ${s.id}`;
      img.loading = 'lazy';
      img.style.imageRendering = 'pixelated';
      img.onerror = () => {
        img.style.display = 'none';
      };
      cell.append(img);
      row.append(cell);
    }
    fogTable.append(row);
  }
  section.append(fogTable);

  return section;
}

export function mountPixelLab(root: HTMLElement): void {
  root.innerHTML = '';
  const page = document.createElement('main');
  page.className = 'pixel-lab';

  const intro = document.createElement('header');
  intro.className = 'pixel-lab__intro';
  const h1 = document.createElement('h1');
  h1.textContent = 'Pixel lab — style probes';
  const p = document.createElement('p');
  p.innerHTML =
    'Top: API-generated outputs (Flux, Recraft, gpt-image-1) across 3 styles. ' +
    'Bottom: hand-authored sprites + dithered fog (baseline, mostly to illustrate what AI-generated buys us). ' +
    'Pick the winning provider × style — that combination gets the full 6-piece set generated and shipped CC-BY.';
  intro.append(h1, p);
  page.append(intro);

  page.append(fogVariantsSection());
  page.append(themedSetsSection());
  page.append(themedKnightsSection());
  page.append(realScaleBoardSection());
  page.append(fullSetSection());
  page.append(apiGallery());

  const handAuthHeader = document.createElement('header');
  handAuthHeader.className = 'pixel-lab__intro';
  const h2 = document.createElement('h2');
  h2.textContent = 'Hand-authored baseline (mediocre — for reference)';
  const p2 = document.createElement('p');
  p2.textContent =
    'These are SVG sprites I hand-coded as a baseline before wiring API generation. They underperform the AI outputs and exist only so you can see the delta.';
  handAuthHeader.append(h2, p2);
  page.append(handAuthHeader);

  const grid = document.createElement('div');
  grid.className = 'pixel-lab__grid';
  for (const style of STYLES) {
    grid.append(styleCard(style));
  }
  page.append(grid);

  // Inline styles so this lab page doesn't pollute production styles.css.
  const style = document.createElement('style');
  style.textContent = `
    .pixel-lab { max-width: 1400px; margin: 0 auto; padding: 24px; color: #e8e8e8; }
    .pixel-lab__intro { margin-bottom: 32px; }
    .pixel-lab__intro h1 { font-size: 24px; margin: 0 0 8px; }
    .pixel-lab__intro p { margin: 0; opacity: 0.75; max-width: 720px; line-height: 1.5; }
    .pixel-lab__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 24px; }
    .pixel-lab__card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; }
    .pixel-lab__card-header h2 { font-size: 18px; margin: 0 0 6px; }
    .pixel-lab__blurb { font-size: 13px; opacity: 0.65; margin: 0 0 16px; line-height: 1.4; }
    .pixel-lab__sprite-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .pixel-lab__sprite-cell { background: #0d0d0d; border-radius: 4px; padding: 8px; text-align: center; }
    .pixel-lab__sprite-cell img { width: 100%; height: auto; display: block; }
    .pixel-lab__sprite-label { font-size: 10px; opacity: 0.5; margin-top: 4px; font-family: monospace; }
    .pixel-lab__board-wrap { margin-bottom: 16px; }
    .pixel-lab__board { display: grid; grid-template-columns: repeat(4, 1fr); aspect-ratio: 1; max-width: 320px; border: 2px solid #2a2a2a; }
    .pixel-lab__square { position: relative; aspect-ratio: 1; }
    .pixel-lab__square.is-light { background: var(--light); }
    .pixel-lab__square.is-dark { background: var(--dark); }
    .pixel-lab__fog { position: absolute; inset: 0; background-repeat: repeat; background-size: 100% 100%; opacity: 0.92; }
    .pixel-lab__fog-preview { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: #0d0d0d; border-radius: 4px; }
    .pixel-lab__fog-preview img { display: block; }
    .pixel-lab__fog-label { font-size: 11px; opacity: 0.55; font-family: monospace; }
    .pixel-lab__swatches { display: flex; flex-direction: column; gap: 8px; }
    .pixel-lab__swatch-group { display: flex; align-items: center; gap: 6px; }
    .pixel-lab__swatch-group > span:first-child { font-size: 11px; opacity: 0.5; font-family: monospace; width: 44px; }
    .pixel-lab__swatch { display: inline-block; width: 20px; height: 20px; border-radius: 3px; border: 1px solid #333; }
    .pixel-lab__api { margin-bottom: 48px; }
    .pixel-lab__api-table { display: grid; gap: 2px; background: #2a2a2a; padding: 2px; border-radius: 6px; margin-bottom: 24px; }
    .pixel-lab__api-row { display: grid; grid-template-columns: 140px repeat(3, 1fr); gap: 2px; }
    .pixel-lab__api-row--head { font-size: 12px; font-weight: 600; }
    .pixel-lab__api-cell { background: #0d0d0d; padding: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 80px; }
    .pixel-lab__api-cell--head { background: #1a1a1a; opacity: 0.7; }
    .pixel-lab__api-cell--corner { background: #1a1a1a; }
    .pixel-lab__api-cell--rowlabel { background: #1a1a1a; font-size: 12px; opacity: 0.7; font-weight: 600; justify-content: flex-start; padding-left: 14px; }
    .pixel-lab__api-cell img { max-width: 100%; max-height: 180px; width: auto; height: auto; display: block; }
    .pixel-lab__api-subhead { font-size: 16px; margin: 32px 0 12px; opacity: 0.8; }
    .pixel-lab__set-block { margin-bottom: 32px; }
    .pixel-lab__set-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; background: #2a2a2a; padding: 8px; border-radius: 6px; }
    .pixel-lab__set-cell { background: #0d0d0d; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .pixel-lab__set-cell img { width: 100%; height: auto; display: block; }
    .pixel-lab__set-cap { font-size: 10px; opacity: 0.5; font-family: monospace; }
    .pixel-lab__board-section { margin-bottom: 48px; }
    .pixel-lab__realboard-wrap { display: flex; justify-content: flex-start; margin-bottom: 16px; }
    .pixel-lab__realboard { display: grid; grid-template-columns: repeat(8, 64px); grid-auto-rows: 64px; border: 2px solid #1a1a1a; }
    .pixel-lab__realboard--small { grid-template-columns: repeat(8, 40px); grid-auto-rows: 40px; }
    .pixel-lab__realboard-sq { position: relative; width: 100%; height: 100%; }
    .pixel-lab__realboard-sq.is-light { background: #b5a890; }
    .pixel-lab__realboard-sq.is-dark { background: #6a5a48; }
    .pixel-lab__realboard-sq img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .pixel-lab__realboard-fog { position: absolute; inset: 0; background-image: url('/pixel-lab-assets/gpt/fog-mistveil.png'); background-size: cover; image-rendering: pixelated; opacity: 0.85; }
    .pixel-lab__realboard-caption { font-size: 12px; opacity: 0.6; margin: 16px 0 8px; }
    .pixel-lab__themed { margin-bottom: 48px; }
    .pixel-lab__themed-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .pixel-lab__themed-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; }
    .pixel-lab__themed-card img { width: 100%; height: auto; display: block; background: #0d0d0d; border-radius: 4px; margin-bottom: 12px; }
    .pixel-lab__themed-card h3 { font-size: 14px; margin: 0 0 6px; }
    .pixel-lab__themed-blurb { font-size: 12px; opacity: 0.65; margin: 0; line-height: 1.4; }
    .pixel-lab__fog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .pixel-lab__fog-cell { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; overflow: hidden; }
    .pixel-lab__fog-cap { padding: 12px; font-size: 11px; line-height: 1.5; }
    .pixel-lab__fog-cap strong { font-size: 13px; }
    .pixel-lab__fog-cap span { opacity: 0.6; }
  `;
  page.append(style);

  root.append(page);
}
