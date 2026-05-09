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
  hard_facts?: {
    hidden_opp_occupancy?: string[];
    square_facts?: string[];
    piece_facts?: string[];
    state_facts?: string[];
  };
  marginal_field: Record<string, BeliefPieceEntry[]>;
  top_k_clusters: BeliefCluster[];
};

export type TraceScore = {
  uci: string;
  score: number;
  support?: number;
};

export type TraceRow = {
  game_index: number;
  tier1_seat?: string;
  tier1_side: Color;
  ply: number;
  decision_path: string;
  move_chosen_uci: string;
  particle_count_pre_sample?: number;
  belief_unique_count?: number;
  chosen_move_belief_support?: number;
  chosen_move_belief_support_count?: number;
  chosen_move_belief_support_unique?: number;
  chosen_piece?: string | null;
  chosen_piece_value?: number;
  chosen_visible_capture_value?: number;
  best_visible_capture_uci?: string | null;
  best_visible_capture_value?: number;
  visible_capture_value_missed?: number;
  chosen_move_king_capture_risk?: number;
  chosen_move_piece_capture_risk?: number;
  chosen_move_risk_support_count?: number;
  chosen_move_risk_support_unique?: number;
  top_k_scores?: TraceScore[];
  belief_pre_stage_a?: number;
  belief_pre_stage_a_unique?: number;
  belief_post_stage_a?: number;
  belief_post_stage_a_unique?: number;
  stage_a_pushed_count?: number;
  stage_a_pushed_unique?: number;
  stage_a_consistent_count?: number;
  stage_a_consistent_unique?: number;
  stage_a_repair_supplement_count?: number;
  stage_a_elapsed_ms?: number;
  stage_a_filter_ms?: number;
  stage_a_repair_ms?: number;
  stage_a_csp_ms?: number;
  stage_a_resample_ms?: number;
  stage_a_reject_illegal?: number;
  stage_a_reject_observation?: number;
  stage_a_reject_hard?: number;
  belief_pre_stage_b?: number;
  belief_pre_stage_b_unique?: number;
  belief_post_stage_b?: number;
  belief_post_stage_b_unique?: number;
  stage_b_primary_count?: number;
  stage_b_primary_unique?: number;
  stage_b_constraint_count?: number;
  stage_b_constraint_unique?: number;
  stage_b_repair_supplement_count?: number;
  stage_b_elapsed_ms?: number;
  stage_b_expand_ms?: number;
  stage_b_repair_ms?: number;
  stage_b_csp_ms?: number;
  stage_b_resample_ms?: number;
  stage_b_expanded_count?: number;
  stage_b_obs_checked_count?: number;
  stage_b_reject_observation?: number;
  stage_b_reject_hard?: number;
  stage_b_reject_count?: number;
  constraint_pruned_stage_b?: number;
  csp_reseed_fired?: boolean;
  csp_reseed_count?: number;
  csp_reseed_stage_a?: number;
  csp_reseed_stage_b?: number;
  repair_fired?: boolean;
  repair_count?: number;
  repair_stage_a?: number;
  repair_stage_b?: number;
};

export type BeliefConfig = {
  rowsForSampleId: (sampleId: string) => BeliefRow[];
  traceRowsForSampleId?: (sampleId: string) => TraceRow[];
};

export type BeliefPanelHandle = {
  el: HTMLElement;
  setRows: (rows: BeliefRow[]) => void;
  setTraceRows: (rows: TraceRow[]) => void;
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

export async function loadTraceRows(url: string): Promise<TraceRow[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load trace log at ${url}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TraceRow);
}

export function createBeliefPanel(): BeliefPanelHandle {
  const urlParams = new URLSearchParams(window.location.search);
  const initialSelectedSquare = urlParams.get('square');
  const initialSelectedSeat = urlParams.get('beliefSeat') ?? urlParams.get('seat');
  const initialSelectedKind = parseSnapshotKind(urlParams.get('beliefKind') ?? urlParams.get('snapshot') ?? urlParams.get('kind'));
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

  const kindSelect = document.createElement('select');
  kindSelect.className = 'belief-seat-select';
  kindSelect.title = 'Choose belief snapshot';
  const controls = document.createElement('div');
  controls.className = 'belief-panel-controls';
  controls.append(kindSelect);
  header.append(titleWrap, controls);

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
  let traceRows: TraceRow[] = [];
  let selectedSeat: string | null = null;
  let selectedKind: SnapshotKind | null = null;
  let selectedSquare: string | null = isSquareName(initialSelectedSquare) ? initialSelectedSquare : null;
  let lastPly = 0;

  kindSelect.addEventListener('change', () => {
    selectedKind = (kindSelect.value || null) as SnapshotKind | null;
    render(lastPly);
  });

  function setRows(nextRows: BeliefRow[]): void {
    rows = nextRows;
    selectedSquare = isSquareName(initialSelectedSquare) ? initialSelectedSquare : null;
    selectedSeat = initialSelectedSeat && rows.some((row) => row.tier1_seat === initialSelectedSeat)
      ? initialSelectedSeat
      : rows[0]?.tier1_seat ?? null;
    selectedKind = initialSelectedKind && rows.some((row) => row.snapshot_kind === initialSelectedKind)
      ? initialSelectedKind
      : null;
  }

  function setTraceRows(nextRows: TraceRow[]): void {
    traceRows = nextRows;
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
    if (selectedKind && kindSelect.value !== selectedKind) kindSelect.value = selectedKind;
    status.textContent = `${row.tier1_seat} · ${row.tier1_side} · ply ${row.ply} · ${kindLabel(row)}`;
    renderBoard(row);
    const trace = traceForBeliefRow(row, traceRows);
    renderMeta(row, trace);
    renderSquareDetail(row);
    renderClusters(row, trace);
  }

  function renderBoard(row: BeliefRow): void {
    board.replaceChildren();
    const orderedSquares = orientedSquares(row.tier1_side);
    const hardPieceFacts = pieceFactsBySquare(row);
    for (const sq of orderedSquares) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'belief-square';
      if (selectedSquare === sq) btn.classList.add('selected');
      const entries = row.marginal_field[sq] ?? [];
      const isHardOppOccupancy = hardOppOccupancySquares(row).has(sq);
      const squarePieceFacts = hardPieceFacts.get(sq) ?? [];
      const oppMass = massFor(entries, (entry) => entry.piece !== null && entry.color !== row.tier1_side);
      const ownMass = massFor(entries, (entry) => entry.piece !== null && entry.color === row.tier1_side);
      const emptyMass = massFor(entries, (entry) => entry.piece === null);
      btn.style.setProperty('--opp-alpha', String(Math.min(0.86, oppMass)));
      btn.style.setProperty('--own-alpha', String(Math.min(0.62, ownMass)));
      btn.classList.toggle('has-opp', oppMass > 0.001);
      btn.classList.toggle('has-own', ownMass > 0.001);
      btn.classList.toggle('hard-opp-occupancy', isHardOppOccupancy);
      btn.classList.toggle('hard-piece-fact', squarePieceFacts.length > 0);
      btn.title = `${sq}: opp ${pct(oppMass)}, own ${pct(ownMass)}, empty ${pct(emptyMass)}${
        isHardOppOccupancy ? ' · hard fact: hidden opponent occupancy' : ''
      }${
        squarePieceFacts.length > 0 ? ` · hard fact: ${squarePieceFacts.join(', ')}` : ''
      }`;

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

  function renderMeta(row: BeliefRow, trace: TraceRow | null): void {
    meta.replaceChildren();
    meta.append(
      metric('Path', row.decision_path),
      metric('Move', row.move_chosen_uci ?? 'n/a'),
      metric('Particles', `${row.particle_count} (${row.particle_count_unique} unique)`),
      metric('Pruned', String(row.last_constraint_pruned)),
      metric('CSP', row.csp_reseed_fired ? String(row.csp_reseed_count ?? 0) : 'no'),
    );
    const health = renderBeliefHealth(row, trace);
    if (health) meta.append(health);
    const counts = document.createElement('div');
    counts.className = 'belief-counts';
    for (const name of pieceOrder) {
      const item = document.createElement('span');
      item.textContent = `${name[0].toUpperCase()} ${row.opp_remaining_counts[name] ?? 0}`;
      counts.append(item);
    }
    meta.append(counts);
    const hardFacts = renderHardFacts(row, (sq) => {
      selectedSquare = sq;
      render(lastPly);
    });
    if (hardFacts) meta.append(hardFacts);
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
    if (hardOppOccupancySquares(row).has(sq)) {
      const fact = document.createElement('div');
      fact.className = 'belief-hard-fact-chip';
      fact.textContent = 'hard fact: hidden opponent occupancy';
      squareDetail.append(fact);
    }
    for (const pieceFact of pieceFactsBySquare(row).get(sq) ?? []) {
      const fact = document.createElement('div');
      fact.className = 'belief-hard-fact-chip';
      fact.textContent = `hard fact: ${pieceFact}`;
      squareDetail.append(fact);
    }
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

  function renderClusters(row: BeliefRow, trace: TraceRow | null): void {
    clusters.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Top Worlds';
    clusters.append(title);
    if (trace?.top_k_scores && trace.top_k_scores.length > 0) {
      clusters.append(renderTopMoveScores(trace.top_k_scores));
    }
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

  return { el, setRows, setTraceRows, render };
}

function renderBeliefHealth(row: BeliefRow, trace: TraceRow | null): HTMLElement | null {
  if (!trace) return null;
  const wrap = document.createElement('div');
  wrap.className = 'belief-health';
  const title = document.createElement('div');
  title.className = 'belief-health-title';
  title.textContent = `Health · trace ply ${trace.ply}`;
  wrap.append(title);

  const support = trace.chosen_move_belief_support;
  if (support !== undefined) {
    wrap.append(healthLine(
      'Move support',
      `${pct(support)} · ${trace.chosen_move_belief_support_unique ?? trace.chosen_move_belief_support_count ?? '?'} worlds`,
      support < 0.25 ? 'bad' : support < 0.6 ? 'warn' : 'ok',
    ));
  }

  if ((trace.visible_capture_value_missed ?? 0) > 0) {
    wrap.append(healthLine(
      'Missed capture',
      `${trace.best_visible_capture_uci ?? '?'} · +${trace.visible_capture_value_missed}`,
      (trace.visible_capture_value_missed ?? 0) >= 3 ? 'bad' : 'warn',
    ));
  }

  if (trace.chosen_move_king_capture_risk !== undefined) {
    const risk = trace.chosen_move_king_capture_risk;
    wrap.append(healthLine(
      'King risk',
      `${pct(risk)} · ${trace.chosen_move_risk_support_unique ?? trace.chosen_move_risk_support_count ?? '?'} worlds`,
      risk >= 0.05 ? 'bad' : risk > 0 ? 'warn' : 'ok',
    ));
  }

  if (trace.chosen_move_piece_capture_risk !== undefined && trace.chosen_piece_value && trace.chosen_piece_value > 1) {
    const risk = trace.chosen_move_piece_capture_risk;
    wrap.append(healthLine(
      'Piece risk',
      `${trace.chosen_piece ?? '?'} · ${pct(risk)}`,
      risk >= 0.25 ? 'bad' : risk >= 0.1 ? 'warn' : 'ok',
    ));
  }

  const uniqueRatio = row.particle_count > 0 ? row.particle_count_unique / row.particle_count : 0;
  wrap.append(healthLine(
    'Diversity',
    `${row.particle_count_unique}/${row.particle_count}`,
    uniqueRatio < 0.1 ? 'bad' : uniqueRatio < 0.5 ? 'warn' : 'ok',
  ));

  const stageA = stageSummary('A', trace);
  if (stageA) wrap.append(stageA);
  const stageB = stageSummary('B', trace);
  if (stageB) wrap.append(stageB);
  const timingA = timingSummary('A', trace);
  if (timingA) wrap.append(timingA);
  const timingB = timingSummary('B', trace);
  if (timingB) wrap.append(timingB);
  const rejectA = rejectSummary('A', trace);
  if (rejectA) wrap.append(rejectA);
  const rejectB = rejectSummary('B', trace);
  if (rejectB) wrap.append(rejectB);

  const repairs: string[] = [];
  if (trace.stage_a_repair_supplement_count) repairs.push(`A+${trace.stage_a_repair_supplement_count}`);
  if (trace.stage_b_repair_supplement_count) repairs.push(`B+${trace.stage_b_repair_supplement_count}`);
  if (trace.repair_stage_a) repairs.push(`A repair ${trace.repair_count ?? ''}`.trim());
  if (trace.repair_stage_b) repairs.push(`B repair ${trace.repair_count ?? ''}`.trim());
  if (repairs.length > 0) wrap.append(healthLine('Repair', repairs.join(' · '), 'warn'));

  const csp: string[] = [];
  if (trace.csp_reseed_stage_a) csp.push('A');
  if (trace.csp_reseed_stage_b) csp.push('B');
  if (csp.length > 0 || trace.csp_reseed_fired) {
    wrap.append(healthLine('CSP reseed', csp.join('+') || String(trace.csp_reseed_count ?? 0), 'bad'));
  }

  return wrap;
}

function stageSummary(stage: 'A' | 'B', trace: TraceRow): HTMLElement | null {
  if (stage === 'A') {
    const pre = trace.belief_pre_stage_a_unique;
    const pushed = trace.stage_a_pushed_unique;
    const consistent = trace.stage_a_consistent_unique;
    const post = trace.belief_post_stage_a_unique;
    if (pre === undefined && post === undefined) return null;
    const value = `${fmtNum(pre)} → ${fmtNum(pushed)} → ${fmtNum(consistent)} → ${fmtNum(post)}`;
    return healthLine('Stage A', value, healthSeverity(pre, post));
  }
  const pre = trace.belief_pre_stage_b_unique;
  const primary = trace.stage_b_primary_unique;
  const constraint = trace.stage_b_constraint_unique;
  const post = trace.belief_post_stage_b_unique;
  if (pre === undefined && post === undefined) return null;
  const value = `${fmtNum(pre)} → ${fmtNum(primary)} → ${fmtNum(constraint)} → ${fmtNum(post)}`;
  return healthLine('Stage B', value, healthSeverity(pre, post));
}

function timingSummary(stage: 'A' | 'B', trace: TraceRow): HTMLElement | null {
  if (stage === 'A') {
    if (trace.stage_a_elapsed_ms === undefined) return null;
    const value = [
      `all ${fmtMs(trace.stage_a_elapsed_ms)}`,
      `filter ${fmtMs(trace.stage_a_filter_ms)}`,
      trace.stage_a_repair_ms ? `repair ${fmtMs(trace.stage_a_repair_ms)}` : '',
      trace.stage_a_csp_ms ? `csp ${fmtMs(trace.stage_a_csp_ms)}` : '',
      trace.stage_a_resample_ms ? `sample ${fmtMs(trace.stage_a_resample_ms)}` : '',
    ].filter(Boolean).join(' · ');
    return healthLine('Stage A ms', value, trace.stage_a_elapsed_ms > 25 ? 'warn' : 'ok');
  }
  if (trace.stage_b_elapsed_ms === undefined) return null;
  const value = [
    `all ${fmtMs(trace.stage_b_elapsed_ms)}`,
    `expand ${fmtMs(trace.stage_b_expand_ms)}`,
    trace.stage_b_repair_ms ? `repair ${fmtMs(trace.stage_b_repair_ms)}` : '',
    trace.stage_b_csp_ms ? `csp ${fmtMs(trace.stage_b_csp_ms)}` : '',
    trace.stage_b_resample_ms ? `sample ${fmtMs(trace.stage_b_resample_ms)}` : '',
  ].filter(Boolean).join(' · ');
  return healthLine('Stage B ms', value, trace.stage_b_elapsed_ms > 50 ? 'warn' : 'ok');
}

function rejectSummary(stage: 'A' | 'B', trace: TraceRow): HTMLElement | null {
  if (stage === 'A') {
    const illegal = trace.stage_a_reject_illegal ?? 0;
    const obs = trace.stage_a_reject_observation ?? 0;
    const hard = trace.stage_a_reject_hard ?? 0;
    if (illegal + obs + hard <= 0) return null;
    return healthLine('Stage A reject', `illegal ${illegal} · obs ${obs} · hard ${hard}`, hard > 0 ? 'bad' : 'warn');
  }
  const obs = trace.stage_b_reject_observation ?? 0;
  const hard = trace.stage_b_reject_hard ?? 0;
  const count = trace.stage_b_reject_count ?? 0;
  if (obs + hard + count <= 0) return null;
  const expanded = trace.stage_b_expanded_count ?? 0;
  const checked = trace.stage_b_obs_checked_count ?? 0;
  const value = `expanded ${expanded} · obs ${obs}/${checked} · hard ${hard} · count ${count}`;
  return healthLine('Stage B reject', value, hard > 0 || count > 0 ? 'bad' : 'warn');
}

function healthLine(label: string, value: string, severity: 'ok' | 'warn' | 'bad'): HTMLElement {
  const line = document.createElement('div');
  line.className = `belief-health-line ${severity}`;
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value;
  line.append(name, val);
  return line;
}

function renderTopMoveScores(scores: TraceScore[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'belief-top-moves';
  const title = document.createElement('h3');
  title.textContent = 'Top Moves';
  wrap.append(title);
  for (const score of scores.slice(0, 5)) {
    const line = document.createElement('div');
    line.className = 'belief-top-move-line';
    const move = document.createElement('span');
    move.textContent = score.uci;
    const value = document.createElement('strong');
    value.textContent = `${Math.round(score.score)}${score.support !== undefined ? ` · ${pct(score.support)}` : ''}`;
    line.append(move, value);
    wrap.append(line);
  }
  return wrap;
}

function traceForBeliefRow(row: BeliefRow, traces: TraceRow[]): TraceRow | null {
  const tracePly =
    row.snapshot_kind === 'after-own-move' ? row.ply + 2
    : row.snapshot_kind === 'after-opp-move' ? row.ply + 1
    : row.ply;
  return traces.find((trace) =>
    trace.game_index === row.game_index
    && trace.ply === tracePly
    && trace.tier1_side === row.tier1_side
    && (!trace.tier1_seat || trace.tier1_seat === row.tier1_seat)
  ) ?? null;
}

function healthSeverity(pre: number | undefined, post: number | undefined): 'ok' | 'warn' | 'bad' {
  if (pre === undefined || post === undefined || pre <= 0) return 'ok';
  const ratio = post / pre;
  return ratio < 0.1 ? 'bad' : ratio < 0.5 ? 'warn' : 'ok';
}

function fmtNum(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

function fmtMs(value: number | undefined): string {
  if (value === undefined) return '-';
  if (value < 1) return `${value.toFixed(2)}ms`;
  if (value < 10) return `${value.toFixed(1)}ms`;
  return `${Math.round(value)}ms`;
}

function hardOppOccupancySquares(row: BeliefRow): Set<string> {
  return new Set(row.hard_facts?.hidden_opp_occupancy ?? []);
}

function pieceFactsBySquare(row: BeliefRow): Map<string, string[]> {
  const bySquare = new Map<string, string[]>();
  for (const fact of row.hard_facts?.piece_facts ?? []) {
    const [sq] = fact.split(':', 1);
    if (!isSquareName(sq)) continue;
    const existing = bySquare.get(sq) ?? [];
    existing.push(fact);
    bySquare.set(sq, existing);
  }
  return bySquare;
}

function renderHardFacts(
  row: BeliefRow,
  onSelectSquare: (square: string) => void,
): HTMLElement | null {
  const hiddenOpp = row.hard_facts?.hidden_opp_occupancy ?? [];
  const pieceFacts = row.hard_facts?.piece_facts ?? [];
  const stateFacts = row.hard_facts?.state_facts ?? [];
  if (hiddenOpp.length === 0 && pieceFacts.length === 0 && stateFacts.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'belief-hard-facts';
  const label = document.createElement('div');
  label.className = 'belief-hard-facts-title';
  label.textContent = `${capitalize(row.tier1_side)} Belief Facts`;
  const chips = document.createElement('div');
  chips.className = 'belief-hard-facts-chips';
  for (const sq of hiddenOpp) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = `${sq} opp`;
    chip.title = `${sq}: hidden opponent occupancy`;
    chip.addEventListener('click', () => onSelectSquare(sq));
    chips.append(chip);
  }
  for (const fact of pieceFacts) {
    const sq = fact.split(':', 1)[0];
    const chip = isSquareName(sq) ? document.createElement('button') : document.createElement('span');
    if (chip instanceof HTMLButtonElement) {
      chip.type = 'button';
      chip.addEventListener('click', () => onSelectSquare(sq));
    }
    chip.textContent = fact;
    chip.title = 'piece identity fact';
    chips.append(chip);
  }
  for (const fact of stateFacts) {
    const chip = document.createElement('span');
    chip.textContent = fact;
    chip.title = 'state/rules fact';
    chips.append(chip);
  }
  wrap.append(label, chips);
  return wrap;
}

function isSquareName(value: string | null): value is string {
  return value !== null && /^[a-h][1-8]$/.test(value);
}

function parseSnapshotKind(value: string | null): SnapshotKind | null {
  if (value === 'decision' || value === 'after-own-move' || value === 'after-opp-move') {
    return value;
  }
  return null;
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
