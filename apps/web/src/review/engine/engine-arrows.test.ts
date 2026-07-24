import { pikafishUciToJieqiMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import type { CevalLine } from './ceval.js';
import {
  bestMoveArrow,
  bestMoveArrowWithParser,
  engineArrowsFromLines,
  engineArrowsFromLinesWithParser,
  SHOW_PV1_REPLY_SEGMENT,
} from './engine-arrows.js';

function line(multipv: number, pvUci: string[], scoreCp = 30 - multipv * 10): CevalLine {
  return { multipv, depth: 18, scoreCp, mate: null, pvUci };
}

describe('engineArrowsFromLines', () => {
  it('draws near-equal lines at near-equal weight, PV1 last so it lands on top', () => {
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3', 'h8e8'], 30),
      line(2, ['b3e3'], 25),
      line(3, ['b1c3'], 20),
    ]);
    const main = SHOW_PV1_REPLY_SEGMENT ? arrows.slice(1) : arrows;
    expect(main).toHaveLength(3);
    expect(main.map((a) => a.className)).toEqual([
      'xq-arrow--alt',
      'xq-arrow--alt',
      'xq-arrow--pv1',
    ]);
    // A few centipawns of gap costs almost nothing: all three stay near the top
    // of the ramp. This is the case rank-indexed styling got wrong.
    expect(main[0]?.width).toBe(12);
    expect(main[1]?.width).toBe(12);
    expect(main[2]).toMatchObject({ from: 'h3', to: 'e3', width: 14 });
    expect(main[0]).toMatchObject({ from: 'b1', to: 'c3' });
  });

  it('holds opacity constant so overlapping arrows cannot fake a third weight', () => {
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3'], 40),
      line(2, ['b3e3'], -60),
      line(3, ['b1c3'], -140),
    ]);
    const alts = arrows.filter((a) => a.className === 'xq-arrow--alt');
    expect(alts).toHaveLength(2);
    expect(new Set(alts.map((a) => a.opacity))).toEqual(new Set([0.35]));
  });

  it('thins an alternate as it concedes more of the position', () => {
    const near = engineArrowsFromLines([line(1, ['h3e3'], 40), line(2, ['b3e3'], -20)]);
    const far = engineArrowsFromLines([line(1, ['h3e3'], 40), line(2, ['b3e3'], -150)]);
    const nearAlt = near.find((a) => a.className === 'xq-arrow--alt');
    const farAlt = far.find((a) => a.className === 'xq-arrow--alt');
    expect(nearAlt?.width).toBeGreaterThan(farAlt?.width ?? 0);
    expect(farAlt?.width).toBeGreaterThanOrEqual(2);
  });

  it('drops an alternate that concedes past the cutoff, leaving one arrow', () => {
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3'], 500),
      line(2, ['b3e3'], -400),
      line(3, ['b1c3'], -900),
    ]);
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.className).toBe('xq-arrow--pv1');
  });

  it('drops an alternate that transiently outscores PV1 mid-search', () => {
    const arrows = engineArrowsFromLines([line(1, ['h3e3'], 10), line(2, ['b3e3'], 200)]);
    expect(arrows.map((a) => a.className)).toEqual(['xq-arrow--pv1']);
  });

  it('compares mate scores against centipawn scores on the same win% scale', () => {
    const arrows = engineArrowsFromLines([
      { multipv: 1, depth: 18, scoreCp: null, mate: 3, pvUci: ['h3e3'] },
      line(2, ['b3e3'], 50),
    ]);
    // Forced mate vs a half-pawn edge is far past the cutoff: only PV1 survives.
    expect(arrows.map((a) => a.className)).toEqual(['xq-arrow--pv1']);
  });

  it('adds a faint dashed PV1 reply segment when the line has one', () => {
    if (!SHOW_PV1_REPLY_SEGMENT) return;
    const arrows = engineArrowsFromLines([line(1, ['h3e3', 'h8e8'])]);
    expect(arrows[0]).toMatchObject({
      from: 'h8',
      to: 'e8',
      className: 'xq-arrow--pv1-reply',
      dashed: true,
    });
    expect(arrows.at(-1)).toMatchObject({ from: 'h3', to: 'e3' });
  });

  it('ignores unsorted input and puts the best line on top', () => {
    const arrows = engineArrowsFromLines([
      line(3, ['b1c3'], 30),
      line(1, ['h3e3'], 30),
      line(2, ['b3e3'], 30),
    ]);
    expect(arrows).toHaveLength(3);
    expect(arrows.at(-1)).toMatchObject({ className: 'xq-arrow--pv1', from: 'h3', to: 'e3' });
  });

  it('draws every near-equal line, so the count tracks the MultiPV setting', () => {
    // Five moves within a couple of centipawns is five playable moves. A rank cap
    // here would have shown three and implied the other two were unplayable.
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3'], 30),
      line(2, ['b3e3'], 29),
      line(3, ['b1c3'], 28),
      line(4, ['a1a2'], 27),
      line(5, ['i1i2'], 26),
    ]);
    expect(arrows).toHaveLength(5);
    expect(arrows.filter((a) => a.className === 'xq-arrow--alt')).toHaveLength(4);
    expect(arrows.at(-1)).toMatchObject({ className: 'xq-arrow--pv1' });
  });

  it('still lets the cutoff thin a large MultiPV down to the playable moves', () => {
    const arrows = engineArrowsFromLines([
      line(1, ['h3e3'], 400),
      line(2, ['b3e3'], 380),
      line(3, ['b1c3'], -400),
      line(4, ['a1a2'], -600),
      line(5, ['i1i2'], -900),
    ]);
    // Only PV2 stays within the gap; the three losing lines are dropped.
    expect(arrows.map((a) => a.className)).toEqual(['xq-arrow--alt', 'xq-arrow--pv1']);
  });

  it('skips lines whose first PV move does not parse', () => {
    const arrows = engineArrowsFromLines([line(1, ['h3e3']), line(2, ['not-a-move'])]);
    expect(arrows.map((a) => a.className)).toEqual(['xq-arrow--pv1']);
  });

  it('returns no arrows when the best line itself does not parse', () => {
    expect(engineArrowsFromLines([line(1, ['not-a-move'])])).toEqual([]);
  });

  it('returns no arrows for no lines', () => {
    expect(engineArrowsFromLines([])).toEqual([]);
  });
});

describe('bestMoveArrow', () => {
  it('builds a single best-move arrow from a whole-game analysis best move', () => {
    expect(bestMoveArrow('h3e3')).toEqual([
      { from: 'h3', to: 'e3', opacity: 0.4, width: 14, className: 'xq-arrow--best' },
    ]);
  });

  it('is empty for a missing or unparseable move', () => {
    expect(bestMoveArrow(null)).toEqual([]);
    expect(bestMoveArrow('zz99')).toEqual([]);
  });
});

describe('variant-specific engine move parsers', () => {
  it('maps PikaJieQi zero-indexed ranks into board arrows', () => {
    expect(
      engineArrowsFromLinesWithParser(
        [line(1, ['e3e4']), line(2, ['b0c2'])],
        pikafishUciToJieqiMove,
      ),
    ).toEqual([
      expect.objectContaining({ from: 'b1', to: 'c3', className: 'xq-arrow--alt' }),
      expect.objectContaining({ from: 'e4', to: 'e5', className: 'xq-arrow--pv1' }),
    ]);
    expect(bestMoveArrowWithParser('e3e4', pikafishUciToJieqiMove)).toEqual([
      { from: 'e4', to: 'e5', opacity: 0.4, width: 14, className: 'xq-arrow--best' },
    ]);
  });
});
