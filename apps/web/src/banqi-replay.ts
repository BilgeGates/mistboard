// Banqi game replay for the rules article.
//
// Sibling of jieqi-replay.ts: the spec carries the hidden deal + a move list, not
// per-ply board images. Each position is produced by replaying the moves through
// the real banqi kernel (createInitialBanqiState(id, deal) + applyBanqiMove) and
// rendered on demand by the live banqi board renderer. Face-down tiles show as
// backs and flip to their dealt piece the first time they are turned over,
// exactly as in play.

import {
  applyBanqiMove,
  type BanqiDeal,
  type BanqiGameState,
  type BanqiMove,
  type BanqiSeat,
  type BanqiSquare,
  createInitialBanqiState,
  getBanqiPlayerView,
} from '@mistboard/game';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';

export type BanqiReplaySpec = {
  red: string;
  black: string;
  event: string;
  // Short result line shown under the players (e.g. "Red wins by resignation · 49 moves").
  outcome?: string;
  // Shown on the final ply. The kernel reports the real result; this overrides
  // the narrative text there.
  resultText: string;
  // The 32-tile deal in ALL_BANQI_SQUARES order — reveals follow it.
  deal: BanqiDeal;
  // Space-separated from+to tokens (files a-h, ranks 1-4); a flip is from==to.
  moves: string;
  perspective?: BanqiSeat;
};

export type BanqiReplayController = { destroy(): void };

const SQUARE_MOVE = /^([a-h][1-4])([a-h][1-4])$/;

function tokenToMove(tok: string): BanqiMove | null {
  const m = SQUARE_MOVE.exec(tok);
  if (!m) return null;
  return { from: m[1] as BanqiSquare, to: m[2] as BanqiSquare };
}

export function mountBanqiReplay(host: HTMLElement, spec: BanqiReplaySpec): BanqiReplayController {
  installBanqiBoardStyles();
  const perspective = spec.perspective ?? 'red';
  const moves = spec.moves
    .trim()
    .split(/\s+/)
    .map(tokenToMove)
    .filter((m): m is BanqiMove => m !== null);

  // Replay once; cache every position so stepping is instant.
  const states: BanqiGameState[] = [createInitialBanqiState('banqi-replay', spec.deal)];
  for (const move of moves) {
    states.push(applyBanqiMove(states[states.length - 1]!, move));
  }
  const total = moves.length;

  host.classList.add('banqi-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  const headerPlayers = document.createElement('div');
  headerPlayers.textContent = `${spec.red} (Red) vs ${spec.black} (Black)`;
  const headerEvent = document.createElement('div');
  headerEvent.className = 'xq-replay-header-event';
  headerEvent.textContent = spec.event;
  header.append(headerPlayers, headerEvent);
  if (spec.outcome) {
    const headerOutcome = document.createElement('div');
    headerOutcome.className = 'xq-replay-header-event';
    headerOutcome.textContent = spec.outcome;
    header.append(headerOutcome);
  }

  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame raw-svg-stepper-frame-banqi';

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
    frame.innerHTML = renderBanqiBoardSvg(
      getBanqiPlayerView(states[index]!, perspective),
      perspective,
    );
    counter.textContent = index === 0 ? 'Start' : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent =
        'Step through the game. Red moves first; a tile flips to its dealt piece the first time it is turned over.';
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const mv = moves[index - 1]!;
      const mover = index % 2 === 1 ? 'Red' : 'Black';
      const action = mv.from === mv.to ? `flips ${mv.from}` : `${mv.from}–${mv.to}`;
      narrative.textContent = `Move ${Math.ceil(index / 2)} · ${mover}: ${action}`;
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
      host.replaceChildren();
      host.classList.remove('banqi-replay', 'stepper');
    },
  };
}
