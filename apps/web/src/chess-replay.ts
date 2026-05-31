// Lightweight client-side chess game replay. One chessground board stepped
// through a move list by replaying through the rules kernel — the game ships as
// a compact UCI string and each position is rendered on demand. The chess
// analogue of xiangqi-replay.ts; first used by the Chess Rules article to show
// a full historical game.
import { boardFen, mountBoard } from '@mistboard/board-render/interactive';
import {
  type Color,
  darkChessVariant,
  type GameState,
  type Move,
  moveToAlgebraic,
  type Square,
} from '@mistboard/game';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';

export type ChessReplaySpec = {
  // Space-separated UCI coordinate tokens (e.g. "e2e4 e7e5 ..."). Castling is
  // the king-two-square form (e1g1 / e1c1); promotions carry a trailing piece
  // letter (e.g. "e7e8q").
  uci: string;
  white: string;
  black: string;
  event: string;
  perspective?: Color;
  // Shown on the final ply. The records stop at the last move played, so the
  // rules kernel still reports "playing"; the result is supplied explicitly.
  resultText: string;
};

export type ChessReplayController = { destroy: () => void };

const PROMO: Record<string, Move['promotion']> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

function uciToMove(tok: string): Move {
  const move: Move = { from: tok.slice(0, 2) as Square, to: tok.slice(2, 4) as Square };
  const promo = tok[4] ? PROMO[tok[4]] : undefined;
  return promo ? { ...move, promotion: promo } : move;
}

export function mountChessReplay(host: HTMLElement, spec: ChessReplaySpec): ChessReplayController {
  const perspective = spec.perspective ?? 'white';
  const moves = spec.uci
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t))
    .map(uciToMove);

  // Replay once; cache every position so stepping is instant. `sans[i]` is the
  // algebraic label for `moves[i]`, computed from the state before the move.
  const states: GameState[] = [darkChessVariant.createInitialState('chess-replay')];
  const sans: string[] = [];
  for (const move of moves) {
    const prev = states[states.length - 1]!;
    sans.push(moveToAlgebraic(prev, move));
    states.push(darkChessVariant.applyMove(prev, move));
  }
  const total = moves.length;

  host.classList.add('chess-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'chess-replay-header';
  const players = document.createElement('div');
  players.className = 'chess-replay-players';
  players.textContent = `${spec.white} (White) vs ${spec.black} (Black)`;
  const eventLine = document.createElement('div');
  eventLine.className = 'chess-replay-event';
  eventLine.textContent = spec.event;
  header.append(players, eventLine);

  const frame = document.createElement('div');
  frame.className = 'chess-replay-board cg-wrap';

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
  slider.className = 'chess-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', 'Move');

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  host.append(header, frame, controls, slider, narrative);

  const api: Api = mountBoard(frame, {
    animation: { enabled: true, duration: 180 },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: boardFen(states[0]!.board),
    orientation: perspective,
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    highlight: { lastMove: true },
    viewOnly: true,
  });

  let index = 0;
  function render(): void {
    const move = index > 0 ? moves[index - 1] : undefined;
    api.set({
      fen: boardFen(states[index]!.board),
      lastMove: move ? [move.from as cg.Key, move.to as cg.Key] : undefined,
    });
    counter.textContent = index === 0 ? 'Start' : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent = 'Step through the moves. White moves first.';
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const moveNo = Math.ceil(index / 2);
      const san = sans[index - 1]!;
      narrative.textContent = index % 2 === 1 ? `${moveNo}. ${san}` : `${moveNo}… ${san}`;
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

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      api.destroy();
      host.replaceChildren();
      host.classList.remove('chess-replay', 'stepper');
    },
  };
}
