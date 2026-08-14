/**
 * Render the endgame corpus + a verification run into a standalone HTML page.
 *
 * Input is the JSON written by verify-xiangqi-endgames.ts, so the page always
 * reports a real measurement rather than a remembered one. Diagrams reuse the
 * OG-card board renderer, which bakes its glyph paths and takes no font or
 * stylesheet dependency — exactly what a self-contained page needs.
 *
 * Usage:
 *   npx tsx apps/server/src/verify-xiangqi-endgames.ts --json /tmp/verify.json
 *   npx tsx apps/server/src/build-xiangqi-endgame-reference.ts /tmp/verify.json out.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderXiangqiOgBoardSvg, type XiangqiOgPiece } from '@mistboard/board-render';
import {
  type EndgameEntry,
  endgameEntryFen,
  endgameEntryState,
  XIANGQI_ENDGAME_CORPUS,
} from '@mistboard/game';

type VerifyRow = {
  id: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  read: string;
  agrees: boolean;
  expected: boolean;
  unresolved: boolean;
};

const FILES = 'abcdefghi';
const BOARD_HEIGHT = 268;

function boardSvg(entry: EndgameEntry): string {
  const state = endgameEntryState(entry);
  const pieces: XiangqiOgPiece[] = Object.entries(state.board).flatMap(([square, piece]) => {
    if (!piece) return [];
    const file = FILES.indexOf(square.slice(0, 1));
    const rank = Number(square.slice(1));
    return [{ file, rank, color: piece.color, role: piece.role as XiangqiOgPiece['role'] }];
  });
  // The renderer positions the board around centerX; mirror its own width
  // formula so the returned <svg> sits flush at x=0 and can be inlined.
  const cell = BOARD_HEIGHT / (10 - 1 + 2 * 0.58);
  const width = 2 * 0.58 * cell + 8 * cell;
  return renderXiangqiOgBoardSvg({
    files: 9,
    ranks: 10,
    pieces,
    riverBetweenRanks: [5, 6],
    palaces: [
      { fileLo: 3, fileHi: 5, rankLo: 1, rankHi: 3 },
      { fileLo: 3, fileHi: 5, rankLo: 8, rankHi: 10 },
    ],
    centerX: width / 2,
    y: 0,
    height: BOARD_HEIGHT,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreText(row: VerifyRow | undefined): string {
  if (!row) return 'not run';
  if (row.mate != null && row.mate !== 0) {
    return row.mate > 0 ? `mate in ${row.mate}` : `mated in ${-row.mate}`;
  }
  if (row.cp == null) return '—';
  const pawns = (row.cp / 100).toFixed(1);
  return `${row.cp > 0 ? '+' : ''}${pawns}`;
}

// The engine's standing relative to the book verdict, as a state a reader can
// act on rather than a raw number.
function agreementChip(row: VerifyRow | undefined): string {
  if (!row) return '<span class="chip chip-quiet">unchecked</span>';
  if (row.agrees) return '<span class="chip chip-ok">engine agrees</span>';
  if (row.expected) return '<span class="chip chip-dispute">engine disputes</span>';
  if (row.unresolved) return '<span class="chip chip-open">leans Red, unresolved</span>';
  return '<span class="chip chip-dispute">engine disagrees</span>';
}

const CATEGORY_TITLES: Record<string, string> = {
  soldier: 'Soldier endings',
  horse: 'Horse endings',
  cannon: 'Cannon endings',
  'horse-and-cannon': 'Horse and cannon',
  chariot: 'Chariot endings',
  insufficient: 'Not enough to mate',
};

const CATEGORY_BLURBS: Record<string, string> = {
  soldier:
    'Soldiers cannot retreat, so where they stand matters more than how many there are. The rank they sit on is part of the verdict, not a detail.',
  horse:
    'A horse can be blocked, which is why a lone elephant holds it and a lone advisor does not.',
  cannon:
    'A cannon captures by jumping something. Take away its platforms and it stops being a piece.',
  'horse-and-cannon':
    'The hardest family to hold in your head: the same attacking pair wins or draws depending on which minor piece is defending.',
  chariot:
    'The strongest piece on the board, and the one whose endgame results least resemble its value.',
  insufficient: 'Material that cannot force a result no matter how it is played.',
};

function entryCard(entry: EndgameEntry, row: VerifyRow | undefined): string {
  const verdictClass = entry.verdict === 'win' ? 'verdict-win' : 'verdict-draw';
  const verdictLabel = entry.verdict === 'win' ? 'Red wins' : 'Draw';
  const provenance =
    entry.provenance === 'diagram'
      ? '<span class="chip chip-quiet">source diagram</span>'
      : '<span class="chip chip-quiet">our position</span>';
  const turn = entry.turn === 'red' ? 'Red to move' : 'Black to move';

  return `
      <article class="card" id="${escapeHtml(entry.id)}">
        <div class="card-board">${boardSvg(entry)}</div>
        <div class="card-body">
          <h3 class="matchup">
            <span class="side side-red">${escapeHtml(entry.attacker)}</span>
            <span class="versus">versus</span>
            <span class="side side-black">${escapeHtml(entry.defender)}</span>
          </h3>
          <p class="verdict ${verdictClass}">${verdictLabel}</p>
          <div class="chips">
            <span class="chip chip-quiet">${turn}</span>
            ${provenance}
            ${agreementChip(row)}
          </div>
          ${entry.note ? `<p class="note">${escapeHtml(entry.note)}</p>` : ''}
          ${
            entry.engineDispute
              ? `<p class="dispute"><strong>Engine disputes this.</strong> ${escapeHtml(entry.engineDispute)}</p>`
              : ''
          }
          <dl class="readout">
            <div><dt>Pikafish</dt><dd class="num">${escapeHtml(scoreText(row))}</dd></div>
            <div><dt>Depth</dt><dd class="num">${row ? row.depth : '—'}</dd></div>
          </dl>
          <p class="fen"><code>${escapeHtml(endgameEntryFen(entry))}</code></p>
        </div>
      </article>`;
}

function main(): void {
  const [jsonPath, outPath] = process.argv.slice(2);
  if (!jsonPath || !outPath) {
    console.error('usage: build-xiangqi-endgame-reference.ts <verify.json> <out.html>');
    process.exitCode = 1;
    return;
  }
  const rows: VerifyRow[] = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const agreeing = rows.filter((row) => row.agrees).length;
  const disputed = rows.filter((row) => !row.agrees && row.expected).length;
  const unresolved = rows.filter((row) => !row.agrees && row.unresolved).length;
  const depth = rows[0]?.depth ?? 0;

  const categories = [...new Set(XIANGQI_ENDGAME_CORPUS.map((entry) => entry.category))];

  const sections = categories
    .map((category) => {
      const entries = XIANGQI_ENDGAME_CORPUS.filter((entry) => entry.category === category);
      return `
      <section class="group" id="group-${escapeHtml(category)}">
        <header class="group-head">
          <h2>${escapeHtml(CATEGORY_TITLES[category] ?? category)}</h2>
          <p>${escapeHtml(CATEGORY_BLURBS[category] ?? '')}</p>
        </header>
        <div class="cards">${entries.map((entry) => entryCard(entry, byId.get(entry.id))).join('')}</div>
      </section>`;
    })
    .join('');

  const html = `<meta charset="utf-8">
<title>Xiangqi Endgame Verdicts</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  --ground: #f3f4f2;
  --surface: #ffffff;
  --ink: #1b1e1c;
  --muted: #5e6562;
  --rule: #dbdfda;
  --seal: #a8261f;
  --slate: #46535d;
  --amber: #9a6714;
  --shadow: 0 1px 2px rgba(27, 30, 28, 0.06), 0 8px 24px rgba(27, 30, 28, 0.05);
  --display: ui-serif, "Songti SC", "Song Ti", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif;
  --body: ui-sans-serif, -apple-system, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #14171a;
    --surface: #1b1f22;
    --ink: #e7eae7;
    --muted: #98a09c;
    --rule: #2c3236;
    --seal: #e0655a;
    --slate: #9db2c0;
    --amber: #d9a441;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
  }
}
:root[data-theme="dark"] {
  --ground: #14171a;
  --surface: #1b1f22;
  --ink: #e7eae7;
  --muted: #98a09c;
  --rule: #2c3236;
  --seal: #e0655a;
  --slate: #9db2c0;
  --amber: #d9a441;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
.masthead { display: flex; flex-direction: column; gap: 1.25rem; max-width: 40rem; }
.eyebrow {
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--seal);
  margin: 0;
}
h1 {
  font-family: var(--display);
  font-size: clamp(2.1rem, 5vw, 3.1rem);
  line-height: 1.12;
  font-weight: 600;
  margin: 0;
  text-wrap: balance;
  letter-spacing: -0.01em;
}
.standfirst { font-size: 1.08rem; color: var(--muted); margin: 0; }
.tally {
  display: flex;
  flex-wrap: wrap;
  gap: 2.25rem;
  margin: 3rem 0 0;
  padding: 1.5rem 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.tally div { display: flex; flex-direction: column; gap: 0.15rem; }
.tally dt {
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.tally dd {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.method { margin: 2.5rem 0 0; max-width: 40rem; display: flex; flex-direction: column; gap: 1rem; }
.method h2 {
  font-family: var(--display);
  font-size: 1.25rem;
  margin: 0;
  font-weight: 600;
}
.method p { margin: 0; color: var(--muted); }
.method strong { color: var(--ink); font-weight: 600; }
.group { margin-top: 4.5rem; }
.group-head { max-width: 42rem; margin-bottom: 1.75rem; }
.group-head h2 {
  font-family: var(--display);
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0 0 0.4rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--seal);
  display: inline-block;
}
.group-head p { margin: 0.6rem 0 0; color: var(--muted); }
.cards { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr)); }
.card {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  box-shadow: var(--shadow);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.25rem;
  padding: 1.25rem;
  align-items: start;
}
.card-board { line-height: 0; }
.card-board svg { display: block; height: auto; max-width: 100%; }
.card-body { display: flex; flex-direction: column; gap: 0.7rem; min-width: 0; }
.matchup {
  font-family: var(--body);
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  line-height: 1.35;
}
.side-red { color: var(--seal); }
.side-black { color: var(--ink); }
.versus {
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 400;
}
.verdict {
  font-family: var(--display);
  font-size: 1.35rem;
  margin: 0;
  font-weight: 600;
}
.verdict-win { color: var(--seal); }
.verdict-draw { color: var(--slate); }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  padding: 0.16rem 0.45rem;
  border-radius: 2px;
  border: 1px solid var(--rule);
  color: var(--muted);
  white-space: nowrap;
}
.chip-ok { border-color: color-mix(in srgb, var(--slate) 40%, transparent); color: var(--slate); }
.chip-dispute { border-color: color-mix(in srgb, var(--amber) 55%, transparent); color: var(--amber); }
.chip-open { border-color: var(--rule); color: var(--muted); font-style: italic; }
.note { margin: 0; font-size: 0.9rem; color: var(--muted); }
.dispute {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ink);
  border-left: 2px solid var(--amber);
  padding-left: 0.7rem;
}
.dispute strong { color: var(--amber); }
.readout { display: flex; gap: 1.5rem; margin: 0; }
.readout div { display: flex; flex-direction: column; }
.readout dt {
  font-family: var(--mono);
  font-size: 0.63rem;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted);
}
.readout dd { margin: 0; font-variant-numeric: tabular-nums; font-size: 0.95rem; }
.fen { margin: 0; overflow-x: auto; }
.fen code {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
  white-space: nowrap;
}
footer {
  margin-top: 5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 0.88rem;
  max-width: 42rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
@media (max-width: 640px) {
  .wrap { padding: 2.5rem 1rem 4rem; }
  .card { grid-template-columns: 1fr; }
  .card-board { display: flex; justify-content: center; }
}
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Xiangqi reference</p>
    <h1>What actually wins a xiangqi endgame</h1>
    <p class="standfirst">Chinese endgame manuals state these verdicts as settled fact. English sources rarely collect them at all. Here they are in one place, each with a position on the board and a strong engine's second opinion.</p>
  </header>

  <dl class="tally">
    <div><dt>Verdicts</dt><dd class="num">${rows.length}</dd></div>
    <div><dt>Engine agrees</dt><dd class="num">${agreeing}</dd></div>
    <div><dt>Disputed</dt><dd class="num">${disputed}</dd></div>
    <div><dt>Unresolved</dt><dd class="num">${unresolved}</dd></div>
    <div><dt>Search depth</dt><dd class="num">${depth}</dd></div>
  </dl>

  <section class="method">
    <h2>How to read this</h2>
    <p><strong>The verdict is the manuals' claim.</strong> The position underneath it is one representative, not a proof. Book results assume best play from a sound defensive formation, so a single snapshot can only illustrate a class, never establish it. Positions marked <em>source diagram</em> are the ones the source draws itself; the rest we built.</p>
    <p><strong>The engine is a check on our positions, not on the manuals.</strong> Pikafish ran every position to depth ${depth}. When it finds a quick mate in something labelled a draw, the likeliest explanation by far is that our position is bad, and we fixed several that way. Two survived that treatment and are marked <em>engine disputes</em>: left in and flagged, rather than quietly tuned until the engine agreed.</p>
    <p><strong>Material is not the verdict.</strong> That is the reason this page is worth reading rather than skimming. A chariot, the strongest piece in the game, cannot beat four defensive pieces. Two horses can. Three soldiers can. A single elephant out of position turns a held fortress into a loss.</p>
  </section>
${sections}

  <footer>
    <p>Verdicts follow the endgame section of the English Wikipedia article on xiangqi, which compiles them from the standard manuals. Positions, notation, and every engine number here are ours. Positions and move sequences are facts and carry no copyright; the wording is not reused.</p>
    <p>Diagrams render through Mistboard's own board renderer, and each FEN is validated by Mistboard's xiangqi parser before it reaches the engine, so a mistyped position fails loudly instead of arriving as a plausible-looking wrong board.</p>
  </footer>
</div>
`;

  writeFileSync(outPath, html);
  console.log(
    `wrote ${outPath} (${XIANGQI_ENDGAME_CORPUS.length} entries, ${rows.length} checked)`,
  );
}

main();
