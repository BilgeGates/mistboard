import './luzhanqi-preview.css';
import {
  ALL_LUZHANQI_SQUARES,
  LUZHANQI_SPEC_ID,
  applyLuzhanqiMove,
  createPendingLuzhanqiState,
  getLuzhanqiLegalMoves,
  getLuzhanqiPlayerView,
  isLuzhanqiCamp,
  isLuzhanqiHeadquarters,
  LUZHANQI_CAMPS,
  LUZHANQI_FRONTLINE_POINTS,
  LUZHANQI_HEADQUARTERS,
  LUZHANQI_MOUNTAINS,
  luzhanqiFormationForColor,
  luzhanqiTruthView,
  submitLuzhanqiFormation,
  type LuzhanqiColor,
  type LuzhanqiFile,
  type LuzhanqiGameState,
  type LuzhanqiPlayerView,
  type LuzhanqiPoint,
  type LuzhanqiSquare,
  type LuzhanqiVisiblePiece,
} from '@mistboard/game';
import { ROLE_SKIN, renderLuzhanqiSkinMark, roleDisplayName } from './luzhanqi-skin.js';

type ViewMode = LuzhanqiColor | 'truth';
type PreviewPoint = LuzhanqiPoint;
type LuzhanqiPlayout = {
  seed: number;
  states: LuzhanqiGameState[];
};

const FILES: readonly LuzhanqiFile[] = ['a', 'b', 'c', 'd', 'e'];
const RANKS_TOP_DOWN = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const RED_RANKS = [1, 2, 3, 4, 5, 6] as const;
const BLACK_RANKS = [13, 12, 11, 10, 9, 8] as const;
const CELL = 62;
const PAD = 36;
const WIDTH = PAD * 2 + CELL * (FILES.length - 1);
const HEIGHT = PAD * 2 + CELL * (RANKS_TOP_DOWN.length - 1);

const ROAD_EDGES = new Set<string>();
const RAIL_EDGES = new Set<string>();

function edgeKey(a: PreviewPoint, b: PreviewPoint): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addRoad(a: PreviewPoint, b: PreviewPoint): void {
  ROAD_EDGES.add(edgeKey(a, b));
}

function addRail(a: PreviewPoint, b: PreviewPoint): void {
  RAIL_EDGES.add(edgeKey(a, b));
  addRoad(a, b);
}

function pointOf(file: number, rank: number): PreviewPoint {
  return `${FILES[file]}${rank}` as PreviewPoint;
}

function addTerritoryRoads(ranks: readonly number[]): void {
  for (const rank of ranks) {
    for (let file = 0; file < FILES.length - 1; file += 1) {
      addRoad(pointOf(file, rank), pointOf(file + 1, rank));
    }
  }
  for (let rankIndex = 0; rankIndex < ranks.length - 1; rankIndex += 1) {
    for (let file = 0; file < FILES.length; file += 1) {
      addRoad(pointOf(file, ranks[rankIndex]), pointOf(file, ranks[rankIndex + 1]));
    }
  }
  const midRanks = ranks.slice(1);
  const diagPairs: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 1, 1],
    [2, 0, 1, 1],
    [2, 0, 3, 1],
    [4, 0, 3, 1],
    [1, 1, 2, 2],
    [3, 1, 2, 2],
    [1, 3, 2, 2],
    [3, 3, 2, 2],
    [0, 4, 1, 3],
    [2, 4, 1, 3],
    [2, 4, 3, 3],
    [4, 4, 3, 3],
  ];
  for (const [fileA, rankA, fileB, rankB] of diagPairs) {
    addRoad(pointOf(fileA, midRanks[rankA]), pointOf(fileB, midRanks[rankB]));
  }
}

function addTerritoryRails(ranks: readonly number[]): void {
  const backRail = ranks[1];
  const frontRail = ranks[5];
  for (let file = 0; file < FILES.length - 1; file += 1) {
    addRail(pointOf(file, backRail), pointOf(file + 1, backRail));
    addRail(pointOf(file, frontRail), pointOf(file + 1, frontRail));
  }
  for (const file of [0, 2, 4]) {
    for (let rankIndex = 1; rankIndex < ranks.length - 1; rankIndex += 1) {
      addRail(pointOf(file, ranks[rankIndex]), pointOf(file, ranks[rankIndex + 1]));
    }
  }
}

addTerritoryRoads(RED_RANKS);
addTerritoryRoads(BLACK_RANKS);
addTerritoryRails(RED_RANKS);
addTerritoryRails(BLACK_RANKS);
for (const file of [0, 2, 4]) addRail(pointOf(file, 6), pointOf(file, 8));

export function mountLuzhanqiPreview(root: HTMLElement): void {
  root.classList.remove('landing-page');
  root.classList.add('luzhanqi-preview-root');

  let playout = randomPlayout(seedFromUrl() ?? randomSeed());
  let plyIndex = 0;
  let mode: ViewMode = 'red';
  let autoplay: number | null = null;

  const shell = document.createElement('main');
  shell.className = 'luzhanqi-preview';

  const header = document.createElement('header');
  header.className = 'luzhanqi-preview__header';
  const title = document.createElement('h1');
  title.textContent = 'Luzhanqi';
  const status = document.createElement('div');
  status.className = 'luzhanqi-preview__status';
  header.append(title, status);

  const toolbar = document.createElement('div');
  toolbar.className = 'luzhanqi-preview__toolbar';
  const buttons = new Map<ViewMode, HTMLButtonElement>();
  for (const [nextMode, label] of [
    ['red', 'Red view'],
    ['black', 'Black view'],
    ['truth', 'Truth view'],
  ] satisfies Array<[ViewMode, string]>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      mode = nextMode;
      render();
    });
    buttons.set(nextMode, button);
    toolbar.append(button);
  }
  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.textContent = 'Create room';
  createButton.addEventListener('click', () => {
    void createLuzhanqiRoom(createButton);
  });
  toolbar.append(createButton);

  const playback = document.createElement('div');
  playback.className = 'luzhanqi-preview__playback';
  const previousButton = playbackButton('Previous');
  previousButton.addEventListener('click', () => {
    plyIndex = Math.max(0, plyIndex - 1);
    render();
  });
  const previousBattleButton = playbackButton('Prev battle');
  previousBattleButton.addEventListener('click', () => {
    plyIndex = previousBattleIndex(playout, plyIndex) ?? plyIndex;
    render();
  });
  const playButton = playbackButton('Play');
  playButton.addEventListener('click', () => {
    if (autoplay !== null) {
      window.clearInterval(autoplay);
      autoplay = null;
      render();
      return;
    }
    autoplay = window.setInterval(() => {
      if (plyIndex >= playout.states.length - 1) {
        window.clearInterval(autoplay!);
        autoplay = null;
        render();
        return;
      }
      plyIndex += 1;
      render();
    }, 650);
    render();
  });
  const nextButton = playbackButton('Next');
  nextButton.addEventListener('click', () => {
    plyIndex = Math.min(playout.states.length - 1, plyIndex + 1);
    render();
  });
  const nextBattleButton = playbackButton('Next battle');
  nextBattleButton.addEventListener('click', () => {
    plyIndex = nextBattleIndex(playout, plyIndex) ?? plyIndex;
    render();
  });
  const newButton = playbackButton('New playout');
  newButton.addEventListener('click', () => {
    if (autoplay !== null) window.clearInterval(autoplay);
    autoplay = null;
    playout = randomPlayout(randomSeed());
    plyIndex = 0;
    updateUrlSeed(playout.seed);
    render();
  });
  playback.append(previousButton, previousBattleButton, playButton, nextButton, nextBattleButton, newButton);

  const seedForm = document.createElement('form');
  seedForm.className = 'luzhanqi-preview__seed';
  const seedLabel = document.createElement('label');
  seedLabel.textContent = 'Seed';
  const seedInput = document.createElement('input');
  seedInput.name = 'seed';
  seedInput.inputMode = 'numeric';
  seedInput.pattern = '[0-9]+';
  seedInput.value = String(playout.seed);
  seedLabel.append(seedInput);
  const seedButton = document.createElement('button');
  seedButton.type = 'submit';
  seedButton.textContent = 'Replay';
  seedForm.append(seedLabel, seedButton);
  seedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const seed = parseSeed(seedInput.value);
    if (seed === null) {
      seedInput.setCustomValidity('Use a whole number from 0 to 4294967295.');
      seedInput.reportValidity();
      return;
    }
    seedInput.setCustomValidity('');
    if (autoplay !== null) window.clearInterval(autoplay);
    autoplay = null;
    playout = randomPlayout(seed);
    plyIndex = 0;
    updateUrlSeed(seed);
    render();
  });

  const layout = document.createElement('div');
  layout.className = 'luzhanqi-preview__layout';
  const boardSlot = document.createElement('section');
  boardSlot.className = 'luzhanqi-preview__board-shell';
  boardSlot.setAttribute('aria-label', 'Luzhanqi board');
  const side = document.createElement('aside');
  side.className = 'luzhanqi-preview__side';
  layout.append(boardSlot, side);
  shell.append(header, toolbar, playback, seedForm, layout);
  root.replaceChildren(shell);

  function render(): void {
    const state = playout.states[plyIndex];
    seedInput.value = String(playout.seed);
    status.textContent = statusText(state, plyIndex, playout.states.length - 1);
    for (const [buttonMode, button] of buttons) {
      button.classList.toggle('is-active', buttonMode === mode);
      button.ariaPressed = String(buttonMode === mode);
    }
    previousButton.disabled = plyIndex === 0;
    nextButton.disabled = plyIndex >= playout.states.length - 1;
    previousBattleButton.disabled = previousBattleIndex(playout, plyIndex) === null;
    nextBattleButton.disabled = nextBattleIndex(playout, plyIndex) === null;
    playButton.textContent = autoplay === null ? 'Play' : 'Pause';
    const view = viewForMode(state, mode);
    boardSlot.replaceChildren(renderBoard(view));
    side.replaceChildren(
      renderSide(view, mode, playout, plyIndex, (index) => {
        plyIndex = index;
        render();
      }),
    );
  }

  render();
}

function playbackButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  return button;
}

function previewState(): LuzhanqiGameState {
  let state = createPendingLuzhanqiState('local-luzhanqi-preview');
  state = submitLuzhanqiFormation(state, 'red', luzhanqiFormationForColor('red'));
  state = submitLuzhanqiFormation(state, 'black', luzhanqiFormationForColor('black'));
  return state;
}

function randomPlayout(seed: number, maxPlies = 120): LuzhanqiPlayout {
  const random = seededRandom(seed);
  const states: LuzhanqiGameState[] = [previewState()];
  for (let i = 0; i < maxPlies; i += 1) {
    const state = states.at(-1)!;
    if (state.status.type !== 'playing') break;
    const legalMoves = getLuzhanqiLegalMoves(state, state.status.turn);
    if (legalMoves.length === 0) break;
    const move = legalMoves[Math.floor(random() * legalMoves.length)];
    states.push(applyLuzhanqiMove(state, move));
  }
  return { seed, states };
}

function seedFromUrl(): number | null {
  return parseSeed(new URLSearchParams(window.location.search).get('seed'));
}

function parseSeed(raw: string | null): number | null {
  const trimmed = raw?.trim() ?? '';
  if (!/^\d+$/.test(trimmed)) return null;
  const seed = Number(trimmed);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : null;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

function updateUrlSeed(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function previousBattleIndex(playout: LuzhanqiPlayout, plyIndex: number): number | null {
  for (let index = plyIndex - 1; index > 0; index -= 1) {
    if (isBattlePly(playout, index)) return index;
  }
  return null;
}

function nextBattleIndex(playout: LuzhanqiPlayout, plyIndex: number): number | null {
  for (let index = plyIndex + 1; index < playout.states.length; index += 1) {
    if (isBattlePly(playout, index)) return index;
  }
  return null;
}

function isBattlePly(playout: LuzhanqiPlayout, plyIndex: number): boolean {
  const move = playout.states[plyIndex]?.lastMove;
  return move?.outcome.type === 'battle';
}

function battleIndices(playout: LuzhanqiPlayout): number[] {
  const indices: number[] = [];
  for (let index = 1; index < playout.states.length; index += 1) {
    if (isBattlePly(playout, index)) indices.push(index);
  }
  return indices;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function statusText(state: LuzhanqiGameState, ply: number, maxPly: number): string {
  if (state.status.type === 'playing') return `${capitalize(state.status.turn)} to move · ${ply}/${maxPly}`;
  if (state.status.type === 'finished') {
    return `${state.status.winner ? capitalize(state.status.winner) : 'No one'} wins · ${state.status.reason}`;
  }
  return `${state.status.type} · ${ply}/${maxPly}`;
}

function viewForMode(state: LuzhanqiGameState, mode: ViewMode): LuzhanqiPlayerView {
  return mode === 'truth' ? luzhanqiTruthView(state) : getLuzhanqiPlayerView(state, mode);
}

function renderBoard(view: LuzhanqiPlayerView): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'luzhanqi-board');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Luzhanqi ${view.perspective} board`);

  const network = svgGroup('luzhanqi-board__network');
  for (const edge of ROAD_EDGES) {
    const [from, to] = edge.split(':') as [PreviewPoint, PreviewPoint];
    network.append(lineBetween(from, to, RAIL_EDGES.has(edge)));
  }
  svg.append(network);

  for (const point of [...LUZHANQI_FRONTLINE_POINTS, ...LUZHANQI_MOUNTAINS]) {
    svg.append(renderFrontierPoint(point));
  }

  for (const square of ALL_LUZHANQI_SQUARES) {
    svg.append(renderSquareMarker(square, view.lastMove));
  }

  if (view.lastMove) svg.append(renderLastMoveBadge(view.lastMove));

  for (const square of ALL_LUZHANQI_SQUARES) {
    const piece = view.board[square];
    if (piece) svg.append(renderPiece(square, piece));
  }

  return svg;
}

function renderSide(
  view: LuzhanqiPlayerView,
  mode: ViewMode,
  playout: LuzhanqiPlayout,
  plyIndex: number,
  onJump: (index: number) => void,
): HTMLElement {
  const fragment = document.createElement('div');
  fragment.className = 'luzhanqi-preview__side-inner';
  const battles = battleIndices(playout);

  const heading = document.createElement('h2');
  heading.textContent = mode === 'truth' ? 'Truth state' : `${capitalize(mode)} state`;
  fragment.append(heading);

  const stats = document.createElement('dl');
  stats.className = 'luzhanqi-preview__stats';
  addStat(stats, 'Status', view.status.type === 'playing' ? 'Playing' : capitalize(view.status.type));
  addStat(stats, 'Turn', view.status.type === 'playing' ? capitalize(view.status.turn) : 'None');
  addStat(stats, 'Ply', String(view.ply));
  addStat(stats, 'Playback', `${plyIndex} / ${playout.states.length - 1}`);
  addStat(stats, 'Seed', String(playout.seed));
  addStat(stats, 'Battles', String(battles.length));
  addStat(stats, 'Legal moves', String(view.legalMoves.length));
  addStat(stats, 'Camps', String(LUZHANQI_CAMPS.red.length + LUZHANQI_CAMPS.black.length));
  addStat(stats, 'HQs', String(LUZHANQI_HEADQUARTERS.red.length + LUZHANQI_HEADQUARTERS.black.length));
  fragment.append(stats);

  if (view.lastMove) {
    const last = document.createElement('section');
    last.className = 'luzhanqi-preview__last';
    const lastHeading = document.createElement('h3');
    lastHeading.textContent = 'Last move';
    const lastBody = document.createElement('p');
    lastBody.textContent = `${view.lastMove.from}-${view.lastMove.to} · ${lastMoveSummary(view.lastMove)}`;
    last.append(lastHeading, lastBody);
    fragment.append(last);
  }

  if (battles.length > 0) {
    const log = document.createElement('section');
    log.className = 'luzhanqi-preview__battles';
    const logHeading = document.createElement('h3');
    logHeading.textContent = 'Battle log';
    const list = document.createElement('ol');
    for (const index of battles) {
      const move = playout.states[index]!.lastMove!;
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.toggle('is-active', index === plyIndex);
      button.textContent = `${index}. ${move.from}-${move.to}: ${lastMoveSummary(move)}`;
      button.addEventListener('click', () => onJump(index));
      item.append(button);
      list.append(item);
    }
    log.append(logHeading, list);
    fragment.append(log);
  }

  const roster = document.createElement('section');
  roster.className = 'luzhanqi-preview__roster';
  const rosterHeading = document.createElement('h3');
  rosterHeading.textContent = 'Visible pieces';
  roster.append(rosterHeading);
  const counts = visibleCounts(view);
  const list = document.createElement('ul');
  for (const [label, count] of counts) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = String(count);
    item.append(name, value);
    list.append(item);
  }
  roster.append(list);
  fragment.append(roster);

  return fragment;
}

function lastMoveSummary(move: NonNullable<LuzhanqiPlayerView['lastMove']>): string {
  if (move.outcome.type === 'move') return 'move';
  if (move.outcome.flagCaptured) return 'Den found';
  if (move.outcome.revealedFlag) return `Den revealed at ${move.outcome.revealedFlag.square}`;
  if (move.outcome.attackerRemoved && move.outcome.defenderRemoved) return 'both removed';
  if (move.outcome.attackerRemoved) return 'attacker removed';
  if (move.outcome.defenderRemoved) return 'defender removed';
  return 'defender held';
}

function addStat(stats: HTMLDListElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  stats.append(dt, dd);
}

function visibleCounts(view: LuzhanqiPlayerView): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const piece of Object.values(view.board)) {
    if (!piece) continue;
    const label = piece.known ? roleDisplayName(piece.role) : `${capitalize(piece.color)} hidden`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderPiece(square: LuzhanqiSquare, piece: LuzhanqiVisiblePiece): SVGElement {
  const [x, y] = pointPosition(square);
  const skin = piece.known ? ROLE_SKIN[piece.role] : null;
  const group = svgGroup(`luzhanqi-piece luzhanqi-piece--${piece.color}`);
  if (skin) {
    group.classList.add(`luzhanqi-piece--skin-${skin.kind}`);
    group.classList.add(`luzhanqi-piece--token-${skin.className}`);
  }
  if (!piece.known) group.classList.add('luzhanqi-piece--hidden');
  if (piece.immobile) group.classList.add('luzhanqi-piece--locked');
  group.setAttribute('transform', `translate(${x} ${y})`);

  const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  disc.setAttribute('class', 'luzhanqi-piece__disc');
  disc.setAttribute('r', '22');
  group.append(disc);
  group.append(renderLuzhanqiSkinMark(skin));

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('class', 'luzhanqi-piece__label');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'central');
  label.textContent = skin ? skin.shortLabel : '?';
  group.append(label);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = piece.known
    ? `${square}: ${piece.color} ${skin?.displayName ?? 'piece'}`
    : `${square}: hidden ${piece.color} token`;
  group.append(title);

  return group;
}

function renderLastMoveBadge(move: NonNullable<LuzhanqiPlayerView['lastMove']>): SVGElement {
  const [x, y] = pointPosition(move.to);
  const label = lastMoveBadgeLabel(move);
  const width = Math.max(44, label.length * 5.8 + 18);
  const above = y > 58;
  const group = svgGroup(`luzhanqi-last-badge luzhanqi-last-badge--${lastMoveBadgeTone(move)}`);
  group.setAttribute('transform', `translate(${x} ${above ? y - 34 : y + 34})`);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(-width / 2));
  rect.setAttribute('y', '-10');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', '20');
  rect.setAttribute('rx', '8');
  group.append(rect);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.textContent = label;
  group.append(text);
  return group;
}

function lastMoveBadgeLabel(move: NonNullable<LuzhanqiPlayerView['lastMove']>): string {
  if (move.outcome.type === 'move') return isRailMove(move) ? 'rail' : 'move';
  if (move.outcome.flagCaptured) return 'Den';
  if (move.outcome.revealedFlag) return 'reveal';
  if (move.outcome.attackerRemoved && move.outcome.defenderRemoved) return 'both out';
  if (move.outcome.attackerRemoved) return 'held';
  if (move.outcome.defenderRemoved) return 'hit';
  return 'bounce';
}

function lastMoveBadgeTone(move: NonNullable<LuzhanqiPlayerView['lastMove']>): 'capture' | 'move' | 'reveal' {
  if (move.outcome.type === 'move') return 'move';
  if (move.outcome.revealedFlag && !move.outcome.flagCaptured) return 'reveal';
  return 'capture';
}

function renderSquareMarker(square: LuzhanqiSquare, lastMove: LuzhanqiPlayerView['lastMove']): SVGElement {
  const [x, y] = pointPosition(square);
  const group = svgGroup('luzhanqi-square');
  group.setAttribute('transform', `translate(${x} ${y})`);
  if (isLuzhanqiCamp(square)) group.classList.add('luzhanqi-square--camp');
  if (isLuzhanqiHeadquarters(square)) group.classList.add('luzhanqi-square--hq');
  if (lastMove?.from === square) group.classList.add('luzhanqi-square--last-from');
  if (lastMove?.to === square) group.classList.add('luzhanqi-square--last-to');

  if (isLuzhanqiCamp(square)) {
    const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    diamond.setAttribute('points', '0,-17 17,0 0,17 -17,0');
    group.append(diamond);
  } else if (isLuzhanqiHeadquarters(square)) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-17');
    rect.setAttribute('y', '-17');
    rect.setAttribute('width', '34');
    rect.setAttribute('height', '34');
    rect.setAttribute('rx', '5');
    group.append(rect);
  } else {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '6');
    group.append(dot);
  }

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = square;
  group.append(title);
  return group;
}

function renderFrontierPoint(point: PreviewPoint): SVGElement {
  const [x, y] = pointPosition(point);
  const group = svgGroup('luzhanqi-frontier');
  group.setAttribute('transform', `translate(${x} ${y})`);
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  marker.setAttribute('r', LUZHANQI_MOUNTAINS.includes(point as (typeof LUZHANQI_MOUNTAINS)[number]) ? '10' : '7');
  group.classList.toggle(
    'luzhanqi-frontier--mountain',
    LUZHANQI_MOUNTAINS.includes(point as (typeof LUZHANQI_MOUNTAINS)[number]),
  );
  group.append(marker);
  return group;
}

function lineBetween(from: PreviewPoint, to: PreviewPoint, rail: boolean): SVGElement {
  const [x1, y1] = pointPosition(from);
  const [x2, y2] = pointPosition(to);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', rail ? 'luzhanqi-board__rail' : 'luzhanqi-board__road');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  return line;
}

function isRailMove(move: Pick<NonNullable<LuzhanqiPlayerView['lastMove']>, 'from' | 'to'>): boolean {
  const edge = edgeKey(move.from, move.to);
  return RAIL_EDGES.has(edge) || !ROAD_EDGES.has(edge);
}

function pointPosition(point: PreviewPoint): [number, number] {
  const file = point[0] as LuzhanqiFile;
  const rank = Number(point.slice(1));
  const fileIndex = FILES.indexOf(file);
  const rankIndex = RANKS_TOP_DOWN.indexOf(rank as (typeof RANKS_TOP_DOWN)[number]);
  if (fileIndex < 0 || rankIndex < 0) throw new Error(`invalid Luzhanqi preview point: ${point}`);
  return [PAD + fileIndex * CELL, PAD + rankIndex * CELL];
}

function svgGroup(className: string): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', className);
  return group;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function createLuzhanqiRoom(button: HTMLButtonElement): Promise<void> {
  const prior = button.textContent ?? 'Create room';
  button.disabled = true;
  button.textContent = 'Creating';
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'pvp',
        gameSpecId: LUZHANQI_SPEC_ID,
        preferredColor: 'random',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      }),
    });
    if (!response.ok) throw new Error(`create failed: ${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('create did not return a room URL');
    window.location.assign(data.url);
  } catch (err) {
    console.warn(err);
    button.disabled = false;
    button.textContent = 'Create failed';
    window.setTimeout(() => {
      button.textContent = prior;
    }, 2200);
  }
}
