// Lightweight client-side Fortress Xiangqi replay for the rules article: one
// 7x8 board plus both reserves, stepped through a compact move list by
// replaying the real rules kernel. Boards render through the live renderer
// (renderFortressXiangqiBoardSvg), so the replay tracks the reader's xiangqi
// board theme and piece set and draws the same last-move markers as a live game.
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiSquare,
  getFortressXiangqiPlayerView,
  isFortressXiangqiLegalMove,
  oppositeFortressXiangqiColor,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import {
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import { fillFortressXiangqiReserve, fortressXiangqiMoveLabel } from './fortress-xiangqi-view.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';

export type FortressXiangqiReplaySpec = {
  // Space-separated coordinate tokens. Board moves use from+to, for example
  // "g1g4". Drops use R/N/C/P/T/A/E for chariot/horse/cannon/soldier/treasure/
  // advisor/elephant, for example "T@e5". Ranks 1-8 keep Red's back rank at 1.
  moves: string;
  red: string;
  black: string;
  event: string;
  perspective?: FortressXiangqiColor;
  resultText: string;
};

export type FortressXiangqiReplayRecord = {
  tokens: string[];
  moves: FortressXiangqiMove[];
  states: FortressXiangqiGameState[];
};

export type FortressXiangqiReplayController = { destroy: () => void };

const DROP_ROLE_BY_LETTER: Record<string, FortressXiangqiDropRole> = {
  R: 'chariot',
  N: 'horse',
  C: 'cannon',
  P: 'soldier',
  T: 'treasure',
  A: 'advisor',
  E: 'elephant',
};

function tokenizeMoves(moves: string): string[] {
  return moves
    .trim()
    .split(/\s+/)
    .map((raw) => raw.replace(/^\d+\./, '').replace(/[,.]+$/g, ''))
    .filter(Boolean);
}

function tokenToMove(token: string, ply: number): FortressXiangqiMove {
  const board = /^([a-g][1-8])([a-g][1-8])$/.exec(token);
  if (board) {
    return {
      from: board[1] as FortressXiangqiSquare,
      to: board[2] as FortressXiangqiSquare,
    };
  }

  const drop = /^([RNCPTAE])@([a-g][1-8])$/i.exec(token);
  if (drop) {
    const role = DROP_ROLE_BY_LETTER[drop[1]!.toUpperCase()];
    if (!role) throw new Error(`Invalid Fortress Xiangqi drop token at ply ${ply}: ${token}`);
    return { drop: role, to: drop[2] as FortressXiangqiSquare };
  }

  throw new Error(`Invalid Fortress Xiangqi replay token at ply ${ply}: ${token}`);
}

export function replayFortressXiangqiNotation(movesText: string): FortressXiangqiReplayRecord {
  const tokens = tokenizeMoves(movesText);
  const moves: FortressXiangqiMove[] = [];
  const states: FortressXiangqiGameState[] = [
    createInitialFortressXiangqiState('fortress-xiangqi-replay'),
  ];

  for (const [index, token] of tokens.entries()) {
    const state = states[states.length - 1]!;
    const move = tokenToMove(token, index + 1);
    if (!isFortressXiangqiLegalMove(state, move)) {
      throw new Error(`Fortress Xiangqi replay token ${token} at ply ${index + 1} is illegal`);
    }
    const next = applyFortressXiangqiMove(state, move);
    if (next === state) {
      throw new Error(`Fortress Xiangqi replay token ${token} at ply ${index + 1} did not apply`);
    }
    moves.push(move);
    states.push(next);
  }

  return { tokens, moves, states };
}

function reserveHost(labelText: string): { root: HTMLElement; pieces: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'drop-mini-replay-hand';
  const label = document.createElement('span');
  label.className = 'drop-mini-replay-hand-label';
  label.textContent = labelText;
  const pieces = document.createElement('div');
  pieces.className = 'drop-mini-replay-hand-pieces';
  root.append(label, pieces);
  return { root, pieces };
}

function sideName(color: FortressXiangqiColor): string {
  return color === 'red' ? 'Red' : 'Black';
}

export function mountFortressXiangqiReplay(
  host: HTMLElement,
  spec: FortressXiangqiReplaySpec,
): FortressXiangqiReplayController {
  installFortressXiangqiBoardStyles();
  const perspective = spec.perspective ?? 'red';
  const topColor = oppositeFortressXiangqiColor(perspective);
  const bottomColor = perspective;
  const { moves, states } = replayFortressXiangqiNotation(spec.moves);
  const total = moves.length;

  host.classList.add('xq-replay', 'drop-mini-replay', 'stepper', 'notranslate');
  host.setAttribute('translate', 'no');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  const headerPlayers = document.createElement('div');
  headerPlayers.textContent = `${spec.red} (Red) vs ${spec.black} (Black)`;
  const headerEvent = document.createElement('div');
  headerEvent.className = 'xq-replay-header-event';
  headerEvent.textContent = spec.event;
  header.append(headerPlayers, headerEvent);

  const frame = document.createElement('div');
  frame.className =
    'raw-svg-stepper-frame raw-svg-stepper-frame-xq replay-pane drop-mini-replay-frame';
  const topReserve = reserveHost(`${sideName(topColor)} reserve`);
  const board = document.createElement('div');
  board.className = 'drop-mini-replay-board';
  const bottomReserve = reserveHost(`${sideName(bottomColor)} reserve`);
  frame.append(topReserve.root, board, bottomReserve.root);

  const controls = document.createElement('div');
  controls.className = 'stepper-controls';
  const mkButton = (label: string, aria: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stepper-button';
    b.setAttribute('aria-label', aria);
    b.textContent = label;
    return b;
  };
  const first = mkButton('⏮', 'First move');
  const prev = mkButton('←', 'Previous move');
  prev.classList.add('stepper-button-prev');
  const counter = document.createElement('span');
  counter.className = 'stepper-counter';
  const next = mkButton('→', 'Next move');
  next.classList.add('stepper-button-next');
  const last = mkButton('⏭', 'Last move');
  controls.append(first, prev, counter, next, last);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'xq-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', 'Move');

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  host.append(header, frame, controls, slider, narrative);

  let index = 0;
  function render(): void {
    const state = states[index]!;
    const view = getFortressXiangqiPlayerView(state, perspective);
    board.innerHTML = renderFortressXiangqiBoardSvg(view, perspective);
    fillFortressXiangqiReserve(topReserve.pieces, view, topColor);
    fillFortressXiangqiReserve(bottomReserve.pieces, view, bottomColor);
    counter.textContent = index === 0 ? 'Start' : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent = 'Step through the moves. Red moves first.';
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const mover = index % 2 === 1 ? 'Red' : 'Black';
      narrative.textContent = `Move ${Math.ceil(index / 2)} · ${mover}: ${fortressXiangqiMoveLabel(moves[index - 1]!)}`;
    }
  }

  function goto(target: number): void {
    const clamped = Math.max(0, Math.min(total, target));
    if (clamped !== index) {
      index = clamped;
      render();
    }
  }
  const onFirst = () => goto(0);
  const onPrev = () => goto(index - 1);
  const onNext = () => goto(index + 1);
  const onLast = () => goto(total);
  const onSlider = () => goto(Number(slider.value));
  first.addEventListener('click', onFirst);
  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  last.addEventListener('click', onLast);
  slider.addEventListener('input', onSlider);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      onPrev();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      onNext();
      e.preventDefault();
    }
  };
  host.addEventListener('keydown', onKey);
  window.addEventListener(xiangqiAppearanceChangedEvent, render);

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      window.removeEventListener(xiangqiAppearanceChangedEvent, render);
      host.replaceChildren();
      host.classList.remove('xq-replay', 'drop-mini-replay', 'stepper', 'notranslate');
      host.removeAttribute('translate');
    },
  };
}
