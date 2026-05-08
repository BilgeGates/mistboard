type Color = 'white' | 'black';
type SnapshotKind = 'decision' | 'after-own-move' | 'after-opp-move';

type BeliefPieceEntry = {
  piece: string | null;
  color?: Color;
  prob: number;
};

export type BeliefCluster = {
  fen: string;
  weight: number;
  particle_count: number;
};

export type BeliefRow = {
  game_index: number;
  tier1_seat: string;
  tier1_side: Color;
  ply: number;
  snapshot_kind?: SnapshotKind;
  decision_path: string;
  particle_count: number;
  particle_count_unique: number;
  move_chosen_uci?: string | null;
  opp_remaining_counts: Record<string, number>;
  last_constraint_pruned: number;
  csp_reseed_fired?: boolean;
  csp_reseed_count?: number;
  marginal_field: Record<string, BeliefPieceEntry[]>;
  top_k_clusters: BeliefCluster[];
};

export type BeliefConfig = {
  rowsForSampleId: (sampleId: string) => BeliefRow[];
};

export type BeliefPanelHandle = {
  el: HTMLElement;
  setRows: (rows: BeliefRow[]) => void;
  render: (ply: number) => void;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ranks = [1, 2, 3, 4, 5, 6, 7, 8];
const pieceOrder = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const roleByFen: Record<string, string> = {
  b: 'bishop',
  k: 'king',
  n: 'knight',
  p: 'pawn',
  q: 'queen',
  r: 'rook',
};

export async function loadBeliefRows(url: string): Promise<BeliefRow[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load belief log at ${url}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BeliefRow);
}

export function createBeliefPanel(): BeliefPanelHandle {
  const el = document.createElement('section');
  el.className = 'belief-panel';

  const header = document.createElement('div');
  header.className = 'belief-panel-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Belief';
  const status = document.createElement('div');
  status.className = 'belief-panel-status';
  titleWrap.append(title, status);

  const seatSelect = document.createElement('select');
  seatSelect.className = 'belief-seat-select';
  seatSelect.title = 'Choose Tier-1 seat';
  const kindSelect = document.createElement('select');
  kindSelect.className = 'belief-seat-select';
  kindSelect.title = 'Choose belief snapshot';
  header.append(titleWrap, seatSelect, kindSelect);

  const body = document.createElement('div');
  body.className = 'belief-panel-body';

  const board = document.createElement('div');
  board.className = 'belief-board';

  const side = document.createElement('aside');
  side.className = 'belief-sidebar';

  const meta = document.createElement('div');
  meta.className = 'belief-meta';
  const clusters = document.createElement('div');
  clusters.className = 'belief-clusters';
  const squareDetail = document.createElement('div');
  squareDetail.className = 'belief-square-detail';
  side.append(meta, clusters, squareDetail);

  body.append(board, side);
  el.append(header, body);

  let rows: BeliefRow[] = [];
  let selectedSeat: string | null = null;
  let selectedKind: SnapshotKind | null = null;
  let selectedSquare: string | null = null;
  let lastPly = 0;

  seatSelect.addEventListener('change', () => {
    selectedSeat = seatSelect.value || null;
    render(lastPly);
  });
  kindSelect.addEventListener('change', () => {
    selectedKind = (kindSelect.value || null) as SnapshotKind | null;
    render(lastPly);
  });

  function setRows(nextRows: BeliefRow[]): void {
    rows = nextRows;
    selectedSquare = null;
    const seats = uniqueSeats(rows);
    if (!selectedSeat || !seats.includes(selectedSeat)) {
      selectedSeat = seats[0] ?? null;
    }
    renderSeatOptions(seatSelect, seats, selectedSeat);
    selectedKind = null;
  }

  function render(ply: number): void {
    lastPly = ply;
    el.hidden = rows.length === 0;
    if (rows.length === 0) return;

    const kinds = snapshotKindsFor(rows, ply, selectedSeat);
    if (!selectedKind || !kinds.includes(selectedKind)) {
      selectedKind = preferredSnapshotKind(kinds);
    }
    renderKindOptions(kindSelect, kinds, selectedKind);

    const row = rowForPly(rows, ply, selectedSeat, selectedKind);
    if (!row) {
      status.textContent = `${selectedSeat ?? 'seat'} · no snapshot at ply ${ply}`;
      board.replaceChildren();
      meta.replaceChildren(emptyLine('Engine did not emit a belief row for the selected seat at this ply.'));
      squareDetail.replaceChildren();
      clusters.replaceChildren();
      return;
    }

    selectedSeat = row.tier1_seat;
    selectedKind = row.snapshot_kind ?? null;
    if (seatSelect.value !== selectedSeat) seatSelect.value = selectedSeat;
    if (selectedKind && kindSelect.value !== selectedKind) kindSelect.value = selectedKind;
    status.textContent = `${row.tier1_seat} · ${row.tier1_side} · ply ${row.ply} · ${kindLabel(row)}`;
    renderBoard(row);
    renderMeta(row);
    renderSquareDetail(row);
    renderClusters(row);
  }

  function renderBoard(row: BeliefRow): void {
    board.replaceChildren();
    const orderedSquares = orientedSquares(row.tier1_side);
    for (const sq of orderedSquares) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'belief-square';
      if (selectedSquare === sq) btn.classList.add('selected');
      const entries = row.marginal_field[sq] ?? [];
      const oppMass = massFor(entries, (entry) => entry.piece !== null && entry.color !== row.tier1_side);
      const ownMass = massFor(entries, (entry) => entry.piece !== null && entry.color === row.tier1_side);
      const emptyMass = massFor(entries, (entry) => entry.piece === null);
      btn.style.setProperty('--opp-alpha', String(Math.min(0.86, oppMass)));
      btn.style.setProperty('--own-alpha', String(Math.min(0.62, ownMass)));
      btn.classList.toggle('has-opp', oppMass > 0.001);
      btn.classList.toggle('has-own', ownMass > 0.001);
      btn.title = `${sq}: opp ${pct(oppMass)}, own ${pct(ownMass)}, empty ${pct(emptyMass)}`;

      const coord = document.createElement('span');
      coord.className = 'belief-square-coord';
      coord.textContent = sq;
      const label = document.createElement('span');
      label.className = 'belief-square-label';
      const top = topPiece(entries);
      label.textContent = top ? `${top.piece}${Math.round(top.prob * 100)}` : '';
      btn.append(coord, label);
      btn.addEventListener('click', () => {
        selectedSquare = selectedSquare === sq ? null : sq;
        render(lastPly);
      });
      board.append(btn);
    }
  }

  function renderMeta(row: BeliefRow): void {
    meta.replaceChildren();
    meta.append(
      metric('Path', row.decision_path),
      metric('Move', row.move_chosen_uci ?? 'n/a'),
      metric('Particles', `${row.particle_count} (${row.particle_count_unique} unique)`),
      metric('Pruned', String(row.last_constraint_pruned)),
      metric('CSP', row.csp_reseed_fired ? String(row.csp_reseed_count ?? 0) : 'no'),
    );
    const counts = document.createElement('div');
    counts.className = 'belief-counts';
    for (const name of pieceOrder) {
      const item = document.createElement('span');
      item.textContent = `${name[0].toUpperCase()} ${row.opp_remaining_counts[name] ?? 0}`;
      counts.append(item);
    }
    meta.append(counts);
  }

  function renderSquareDetail(row: BeliefRow): void {
    squareDetail.replaceChildren();
    const sq = selectedSquare;
    if (!sq) {
      squareDetail.append(emptyLine('Click a square to inspect its distribution.'));
      return;
    }
    const title = document.createElement('h3');
    title.textContent = sq;
    squareDetail.append(title);
    const entries = row.marginal_field[sq] ?? [];
    if (entries.length === 0) {
      squareDetail.append(emptyLine('No non-empty marginal above capture threshold.'));
      return;
    }
    for (const entry of [...entries].sort((a, b) => b.prob - a.prob)) {
      const line = document.createElement('div');
      line.className = 'belief-dist-line';
      const name = document.createElement('span');
      name.textContent = entry.piece === null ? 'empty' : `${entry.color} ${entry.piece}`;
      const value = document.createElement('span');
      value.textContent = pct(entry.prob);
      line.append(name, value);
      squareDetail.append(line);
    }
  }

  function renderClusters(row: BeliefRow): void {
    clusters.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Top Worlds';
    clusters.append(title);
    if (row.top_k_clusters.length === 0) {
      clusters.append(emptyLine('No particle clusters.'));
      return;
    }
    row.top_k_clusters.forEach((cluster, idx) => {
      const item = document.createElement('details');
      item.className = 'belief-cluster';
      if (idx === 0) item.open = true;
      const summary = document.createElement('summary');
      summary.textContent = `#${idx + 1} ${pct(cluster.weight)} (${cluster.particle_count})`;
      const mini = renderMiniFen(cluster.fen, row.tier1_side);
      const fen = document.createElement('div');
      fen.className = 'belief-cluster-fen';
      fen.textContent = cluster.fen;
      item.append(summary, mini, fen);
      clusters.append(item);
    });
  }

  return { el, setRows, render };
}

function uniqueSeats(rows: BeliefRow[]): string[] {
  return [...new Set(rows.map((row) => row.tier1_seat))].sort();
}

function rowForPly(
  rows: BeliefRow[],
  ply: number,
  seat: string | null,
  kind: SnapshotKind | null,
): BeliefRow | null {
  const exact = rows.filter((row) => row.ply === ply);
  const candidates = seat === null
    ? exact
    : exact.filter((row) => row.tier1_seat === seat);
  if (kind !== null) {
    const selected = candidates.find((row) => row.snapshot_kind === kind);
    if (selected) return selected;
  }
  return (
    candidates.find((row) => row.snapshot_kind === preferredSnapshotKind(snapshotKinds(candidates)))
    ?? candidates[0]
    ?? null
  );
}

function snapshotKindsFor(rows: BeliefRow[], ply: number, seat: string | null): SnapshotKind[] {
  const exact = rows.filter((row) => row.ply === ply);
  const candidates = seat === null
    ? exact
    : exact.filter((row) => row.tier1_seat === seat);
  return snapshotKinds(candidates);
}

function snapshotKinds(rows: BeliefRow[]): SnapshotKind[] {
  const found = new Set<SnapshotKind>();
  for (const row of rows) {
    if (row.snapshot_kind) found.add(row.snapshot_kind);
  }
  return (['after-own-move', 'after-opp-move', 'decision'] as SnapshotKind[])
    .filter((kind) => found.has(kind));
}

function preferredSnapshotKind(kinds: SnapshotKind[]): SnapshotKind | null {
  return (
    kinds.find((kind) => kind === 'after-own-move')
    ?? kinds.find((kind) => kind === 'after-opp-move')
    ?? kinds.find((kind) => kind === 'decision')
    ?? null
  );
}

function kindLabel(row: BeliefRow): string {
  if (row.snapshot_kind === 'after-own-move') return 'after own move';
  if (row.snapshot_kind === 'after-opp-move') return 'after opp move';
  if (row.snapshot_kind === 'decision') return 'decision';
  return row.decision_path;
}

function renderSeatOptions(
  select: HTMLSelectElement,
  seats: string[],
  selectedSeat: string | null,
): void {
  select.replaceChildren();
  for (const seat of seats) {
    const opt = document.createElement('option');
    opt.value = seat;
    opt.textContent = seat;
    select.append(opt);
  }
  if (selectedSeat) select.value = selectedSeat;
}

function renderKindOptions(
  select: HTMLSelectElement,
  kinds: SnapshotKind[],
  selectedKind: SnapshotKind | null,
): void {
  select.replaceChildren();
  select.hidden = kinds.length <= 1;
  for (const kind of kinds) {
    const opt = document.createElement('option');
    opt.value = kind;
    opt.textContent = kindLabel({ snapshot_kind: kind } as BeliefRow);
    select.append(opt);
  }
  if (selectedKind) select.value = selectedKind;
}

function orientedSquares(orientation: Color): string[] {
  const rankOrder = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const fileOrder = orientation === 'white' ? files : [...files].reverse();
  return rankOrder.flatMap((rank) => fileOrder.map((file) => `${file}${rank}`));
}

function massFor(entries: BeliefPieceEntry[], pred: (entry: BeliefPieceEntry) => boolean): number {
  return entries.reduce((sum, entry) => sum + (pred(entry) ? entry.prob : 0), 0);
}

function topPiece(entries: BeliefPieceEntry[]): BeliefPieceEntry | null {
  return entries
    .filter((entry) => entry.piece !== null)
    .sort((a, b) => b.prob - a.prob)[0] ?? null;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function metric(label: string, value: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'belief-metric';
  const key = document.createElement('span');
  key.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value;
  el.append(key, val);
  return el;
}

function emptyLine(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'belief-empty';
  el.textContent = text;
  return el;
}

function renderMiniFen(fen: string, orientation: Color): HTMLElement {
  const board = document.createElement('div');
  board.className = 'belief-mini-board cg-wrap';
  const placement = fen.split(' ')[0] ?? '8/8/8/8/8/8/8/8';
  const bySquare = pieceMapFromFenPlacement(placement);
  for (const sq of orientedSquares(orientation)) {
    const cell = document.createElement('span');
    const piece = bySquare.get(sq);
    if (piece) cell.append(renderPiece(piece));
    board.append(cell);
  }
  return board;
}

function pieceMapFromFenPlacement(placement: string): Map<string, { color: Color; role: string }> {
  const map = new Map<string, { color: Color; role: string }>();
  const fenRanks = placement.split('/');
  for (let rankIdx = 0; rankIdx < fenRanks.length; rankIdx += 1) {
    const rank = 8 - rankIdx;
    let fileIdx = 0;
    for (const ch of fenRanks[rankIdx] ?? '') {
      const empty = Number(ch);
      if (Number.isInteger(empty) && empty > 0) {
        fileIdx += empty;
        continue;
      }
      const file = files[fileIdx];
      const role = roleByFen[ch.toLowerCase()];
      if (file && role) {
        map.set(`${file}${rank}`, {
          color: ch === ch.toUpperCase() ? 'white' : 'black',
          role,
        });
      }
      fileIdx += 1;
    }
  }
  return map;
}

function renderPiece(piece: { color: Color; role: string }): HTMLElement {
  const el = document.createElement('piece');
  el.className = `${piece.color} ${piece.role}`;
  return el;
}
