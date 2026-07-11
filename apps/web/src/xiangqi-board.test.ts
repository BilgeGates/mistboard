import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
} from '@mistboard/game';
import { describe, expect, it, vi } from 'vitest';
import { type DisplayPreferenceValue, writeDisplayPreference } from './display-preferences.js';
import { renderXiangqiBoardSvg as renderLiveXiangqiBoardSvg } from './live-xiangqi.js';
import {
  animateXiangqiBoardMove,
  createXiangqiInteractiveBoard,
  renderXiangqiBoardSvg as renderSharedXiangqiBoardSvg,
  type XiangqiBoardArrow,
  xiangqiArrowSvg,
} from './xiangqi-board.js';

// This happy-dom build ships no window.localStorage; back it with memory (same
// idiom as puzzles.test.ts) so the pieceAnimation preference writes work.
const storageValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return storageValues.size;
    },
    clear: () => storageValues.clear(),
    getItem: (key: string) => storageValues.get(key) ?? null,
    key: (index: number) => [...storageValues.keys()][index] ?? null,
    removeItem: (key: string) => void storageValues.delete(key),
    setItem: (key: string, value: string) => void storageValues.set(key, value),
  } satisfies Storage,
});

const NON_SELECTABLE_RIVER_GROUP =
  '<g class="xq-live-river" aria-hidden="true" pointer-events="none" style="-webkit-user-select: none; user-select: none;">';

describe('standard Xiangqi board SVG', () => {
  it('renders the river label as theme-controlled non-selectable board furniture', () => {
    const state = createInitialXiangqiState('xq-board-render');
    const view = getStandardXiangqiPlayerView(state, 'red');

    expect(renderSharedXiangqiBoardSvg(view)).toContain(NON_SELECTABLE_RIVER_GROUP);
    expect(renderSharedXiangqiBoardSvg(view)).toContain('class="xq-live-river-label"');
    expect(renderLiveXiangqiBoardSvg(view)).toContain(NON_SELECTABLE_RIVER_GROUP);
    expect(renderLiveXiangqiBoardSvg(view)).toContain('class="xq-live-river-label"');
  });

  it('re-exports ONE renderer from live-xiangqi (no duplicate implementation)', () => {
    expect(renderLiveXiangqiBoardSvg).toBe(renderSharedXiangqiBoardSvg);
  });

  it('marks the last move with an origin shadow and a destination ring', () => {
    const state = applyXiangqiMove(createInitialXiangqiState('xq-board-lastmove'), {
      from: 'b3',
      to: 'e3',
    });
    const view = getStandardXiangqiPlayerView(state, 'red');
    expect(view.lastMove).toEqual({ from: 'b3', to: 'e3' });

    // Red perspective geometry: x = 36 + file*60, y = 36 + (10 - rank)*60.
    // b3 -> (96, 456); e3 -> (276, 456). Origin = the darker -from shadow disc;
    // destination = the gold ring around the moved piece (r=29 > piece r=27).
    const svg = renderSharedXiangqiBoardSvg(view);
    expect(svg).toContain(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="96" cy="456" r="27"/>',
    );
    expect(svg).toContain('<circle class="xq-live-lastmove-ring" cx="276" cy="456" r="26"/>');
    expect(svg.match(/xq-live-lastmove-from/g)).toHaveLength(1);
    expect(svg.match(/xq-live-lastmove-ring/g)).toHaveLength(1);

    // Black perspective flips ranks: rank 3 lands at y = 36 + 2*60 = 156.
    const flipped = renderSharedXiangqiBoardSvg(view, 'black');
    expect(flipped).toContain(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="96" cy="156" r="27"/>',
    );
    expect(flipped).toContain('<circle class="xq-live-lastmove-ring" cx="276" cy="156" r="26"/>');
  });

  it('renders no last-move marker when the view has no lastMove', () => {
    const view = getStandardXiangqiPlayerView(createInitialXiangqiState('xq-board-fresh'), 'red');
    expect(view.lastMove).toBeUndefined();
    expect(renderSharedXiangqiBoardSvg(view)).not.toContain('xq-live-lastmove-cell');
    expect(renderSharedXiangqiBoardSvg(view)).not.toContain('xq-live-lastmove-ring');
  });
});

describe('keyed piece slots + animateXiangqiBoardMove', () => {
  function mountMovedBoard(): HTMLDivElement {
    const state = applyXiangqiMove(createInitialXiangqiState('xq-board-anim'), {
      from: 'b3',
      to: 'e3',
    });
    const view = getStandardXiangqiPlayerView(state, 'red');
    const host = document.createElement('div');
    host.innerHTML = renderSharedXiangqiBoardSvg(view);
    return host;
  }

  it('wraps every piece in a keyed slot the glide can target', () => {
    const view = getStandardXiangqiPlayerView(createInitialXiangqiState('xq-board-slots'), 'red');
    const svg = renderSharedXiangqiBoardSvg(view);
    expect(svg).toContain('<g class="xq-piece-slot" data-piece-square="a1">');
    expect(svg.match(/xq-piece-slot/g)).toHaveLength(32);
  });

  it('glides the destination slot from the move origin in viewBox user units', () => {
    const host = mountMovedBoard();
    const slot = host.querySelector('[data-piece-square="e3"]');
    expect(slot).not.toBeNull();
    const animate = vi.fn();
    Object.assign(slot as object, { animate });
    animateXiangqiBoardMove(host, { from: 'b3', to: 'e3' }, 'red');
    // b3 -> (96, 456), e3 -> (276, 456): the piece starts 180 units left of rest.
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: 'translate(-180px, 0px)' },
      { transform: 'none' },
    ]);
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 250 });
  });

  it('reverse-animates the origin slot on a back-step and skips missing slots', () => {
    const view = getStandardXiangqiPlayerView(createInitialXiangqiState('xq-board-rev'), 'red');
    const host = document.createElement('div');
    host.innerHTML = renderSharedXiangqiBoardSvg(view);
    const slot = host.querySelector('[data-piece-square="b3"]');
    const animate = vi.fn();
    Object.assign(slot as object, { animate });
    animateXiangqiBoardMove(host, { from: 'b3', to: 'e3' }, 'red', { reverse: true });
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: 'translate(180px, 0px)' },
      { transform: 'none' },
    ]);
    // Empty destination square (no slot): safe no-op, nothing throws.
    expect(() => animateXiangqiBoardMove(host, { from: 'e6', to: 'e7' }, 'red')).not.toThrow();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the pieceAnimation preference is none', () => {
    // Same cast the settings UI uses for select values (see account.ts).
    writeDisplayPreference('pieceAnimation', 'none' as DisplayPreferenceValue<'pieceAnimation'>);
    try {
      const host = mountMovedBoard();
      const slot = host.querySelector('[data-piece-square="e3"]');
      const animate = vi.fn();
      Object.assign(slot as object, { animate });
      animateXiangqiBoardMove(host, { from: 'b3', to: 'e3' }, 'red');
      expect(animate).not.toHaveBeenCalled();
    } finally {
      writeDisplayPreference('pieceAnimation', 'normal');
    }
  });

  it('no-ops safely in a DOM without WAAPI (el.animate missing)', () => {
    const host = mountMovedBoard();
    const slot = host.querySelector('[data-piece-square="e3"]');
    Object.assign(slot as object, { animate: undefined });
    expect(() => animateXiangqiBoardMove(host, { from: 'b3', to: 'e3' }, 'red')).not.toThrow();
  });
});

describe('xiangqiArrowSvg', () => {
  it('draws shaft + head between intersection centers, inset at both ends', () => {
    // Red perspective: b3 -> (96, 456), e3 -> (276, 456); horizontal arrow.
    // Start inset 12 -> x=108. Tip inset 24 -> tip x=252; head length 20 -> the
    // shaft ends at the head base (x=232); head half-width 11.
    const svg = xiangqiArrowSvg({ from: 'b3', to: 'e3' }, 'red');
    expect(svg).toContain('class="xq-arrow"');
    expect(svg).toContain('opacity="0.9"');
    expect(svg).toContain(
      '<line x1="108" y1="456" x2="232" y2="456" stroke-width="9" stroke-linecap="round"/>',
    );
    expect(svg).toContain('<polygon points="252,456 232,467 232,445" stroke="none"/>');
    expect(svg).toContain('pointer-events="none"');
  });

  it('flips with the board perspective (same transform as the pieces)', () => {
    // Black perspective flips ranks only: rank 3 lands at y = 36 + 2*60 = 156.
    const svg = xiangqiArrowSvg({ from: 'b3', to: 'e3' }, 'black');
    expect(svg).toContain('<line x1="108" y1="156" x2="232" y2="156"');
    expect(svg).toContain('<polygon points="252,156 232,167 232,145"');
  });

  it('honours per-arrow class, opacity, width, and dash', () => {
    const svg = xiangqiArrowSvg(
      { from: 'h3', to: 'e3', className: 'xq-arrow--pv2', opacity: 0.55, width: 8, dashed: true },
      'red',
    );
    expect(svg).toContain('class="xq-arrow xq-arrow--pv2"');
    expect(svg).toContain('opacity="0.55"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toContain('stroke-dasharray="10 8"');
  });

  it('renders nothing for a degenerate zero-length arrow', () => {
    expect(xiangqiArrowSvg({ from: 'e3', to: 'e3' }, 'red')).toBe('');
  });
});

describe('interactive board arrow overlay', () => {
  function mountBoard() {
    const host = document.createElement('div');
    document.body.append(host);
    const view = getStandardXiangqiPlayerView(createInitialXiangqiState('xq-board-arrows'), 'red');
    const board = createXiangqiInteractiveBoard({
      board: host,
      getInteractionView: () => view,
      getPerspective: () => 'red',
      seatFor: () => 'red',
      enabled: () => true,
      onMove: () => {},
    });
    board.render(view, 'red');
    return { host, board, view };
  }

  const PV_ARROWS: XiangqiBoardArrow[] = [
    { from: 'b1', to: 'c3', className: 'xq-arrow--pv3', opacity: 0.35, width: 7 },
    { from: 'b3', to: 'b7', className: 'xq-arrow--pv2', opacity: 0.55, width: 8 },
    { from: 'h3', to: 'e3', className: 'xq-arrow--pv1', opacity: 0.9, width: 9 },
  ];

  it('setArrows patches the arrows layer in place with ranked opacity, strongest last', () => {
    const { host, board } = mountBoard();
    board.setArrows(PV_ARROWS);
    const groups = [...host.querySelectorAll('.xq-live-arrows .xq-arrow')];
    expect(groups).toHaveLength(3);
    // Array order = draw order: weakest first, PV1 painted last (on top).
    expect(groups.map((g) => g.getAttribute('opacity'))).toEqual(['0.35', '0.55', '0.9']);
    expect(groups[2]?.getAttribute('class')).toContain('xq-arrow--pv1');
    host.remove();
  });

  it('clears with an empty list and survives a full re-render until cleared', () => {
    const { host, board, view } = mountBoard();
    board.setArrows(PV_ARROWS);
    // A full innerHTML re-render (ply/flip/selection) must keep the overlay.
    board.render(view, 'red');
    expect(host.querySelectorAll('.xq-live-arrows .xq-arrow')).toHaveLength(3);
    board.setArrows([]);
    expect(host.querySelectorAll('.xq-live-arrows .xq-arrow')).toHaveLength(0);
    host.remove();
  });

  it('renders posted ceval MultiPV lines as ranked arrows and clears them again', async () => {
    // The real pipeline the review glue drives: CevalLine[] -> spec builder ->
    // setArrows. Three lines -> three PV arrows with descending opacity
    // (plus the faint dashed PV1 reply at the bottom of the stack).
    const { engineArrowsFromLines, SHOW_PV1_REPLY_SEGMENT } = await import(
      './review/engine/engine-arrows.js'
    );
    const { host, board } = mountBoard();
    board.setArrows(
      engineArrowsFromLines([
        { multipv: 1, depth: 18, scoreCp: 35, mate: null, pvUci: ['h3e3', 'h8e8'] },
        { multipv: 2, depth: 18, scoreCp: 12, mate: null, pvUci: ['b3e3'] },
        { multipv: 3, depth: 18, scoreCp: 4, mate: null, pvUci: ['b1c3'] },
      ]),
    );
    const groups = [...host.querySelectorAll('.xq-live-arrows .xq-arrow')];
    expect(groups).toHaveLength(SHOW_PV1_REPLY_SEGMENT ? 4 : 3);
    const pvOpacities = groups
      .filter((g) => !(g.getAttribute('class') ?? '').includes('reply'))
      .map((g) => Number(g.getAttribute('opacity')));
    expect(pvOpacities).toEqual([0.35, 0.55, 0.9]);
    // Engine toggled off / ply changed: the glue posts a clear.
    board.setArrows([]);
    expect(host.querySelectorAll('.xq-live-arrows .xq-arrow')).toHaveLength(0);
    host.remove();
  });
});
