import { describe, expect, it } from 'vitest';
import type { CevalLine } from './ceval.js';
import { bestMoveArrow, engineArrowsFromLines, SHOW_PV1_REPLY_SEGMENT } from './engine-arrows.js';

function line(multipv: number, pvUci: string[]): CevalLine {
  return { multipv, depth: 18, scoreCp: 30 - multipv * 10, mate: null, pvUci };
}

describe('engineArrowsFromLines', () => {
  it('maps three PV lines to ranked arrows, weakest first so PV1 draws on top', () => {
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3', 'h8e8']),
      line(2, ['b3e3']),
      line(3, ['b1c3']),
    ]);
    // Reply segment (when enabled) sits at the bottom of the stack.
    const main = SHOW_PV1_REPLY_SEGMENT ? arrows.slice(1) : arrows;
    expect(main).toHaveLength(3);
    expect(main.map((a) => a.className)).toEqual([
      'xq-arrow--pv3',
      'xq-arrow--pv2',
      'xq-arrow--pv1',
    ]);
    // Rank encoding: descending opacity and width toward weaker lines.
    expect(main.map((a) => a.opacity)).toEqual([0.35, 0.55, 0.9]);
    expect(main.map((a) => a.width)).toEqual([7, 8, 9]);
    // PV1 last = drawn on top; carries the best line's first move.
    expect(main[2]).toMatchObject({ from: 'h3', to: 'e3' });
    expect(main[0]).toMatchObject({ from: 'b1', to: 'c3' });
  });

  it('adds a faint dashed PV1 reply segment when the line has one', () => {
    if (!SHOW_PV1_REPLY_SEGMENT) return;
    const arrows = engineArrowsFromLines([line(1, ['h3e3', 'h8e8'])]);
    expect(arrows[0]).toMatchObject({
      from: 'h8',
      to: 'e8',
      className: 'xq-arrow--pv1-reply',
      opacity: 0.25,
      dashed: true,
    });
    // Main PV1 arrow still present and on top.
    expect(arrows.at(-1)).toMatchObject({ from: 'h3', to: 'e3', opacity: 0.9 });
  });

  it('ignores unsorted input and caps at three lines', () => {
    const arrows = engineArrowsFromLines([
      line(4, ['a1a2']),
      line(2, ['b3e3']),
      line(1, ['h3e3']),
      line(3, ['b1c3']),
    ]);
    const classes = arrows.map((a) => a.className);
    expect(classes).not.toContain('xq-arrow--pv4');
    expect(classes.at(-1)).toBe('xq-arrow--pv1');
  });

  it('skips lines whose first PV move does not parse', () => {
    const arrows = engineArrowsFromLines([line(1, ['h3e3']), line(2, ['not-a-move'])]);
    expect(arrows.some((a) => a.className === 'xq-arrow--pv2')).toBe(false);
    expect(arrows.some((a) => a.className === 'xq-arrow--pv1')).toBe(true);
  });

  it('returns no arrows for no lines', () => {
    expect(engineArrowsFromLines([])).toEqual([]);
  });
});

describe('bestMoveArrow', () => {
  it('builds a single full-weight arrow from a whole-game analysis best move', () => {
    expect(bestMoveArrow('h3e3')).toEqual([
      { from: 'h3', to: 'e3', opacity: 0.9, width: 9, className: 'xq-arrow--best' },
    ]);
  });

  it('is empty for a missing or unparseable move', () => {
    expect(bestMoveArrow(null)).toEqual([]);
    expect(bestMoveArrow('zz99')).toEqual([]);
  });
});
