import { describe, expect, it } from 'vitest';
import { parseInfo } from './ceval.js';

describe('parseInfo', () => {
  it('reads depth/score-cp/multipv/pv from a real info line', () => {
    const info = parseInfo(
      'info depth 14 seldepth 20 multipv 1 score cp 23 nodes 123456 nps 72000 time 1700 pv c1e3 h8e8 b3e3',
    );
    expect(info).not.toBeNull();
    expect(info?.depth).toBe(14);
    expect(info?.seldepth).toBe(20);
    expect(info?.multipv).toBe(1);
    expect(info?.scoreCp).toBe(23);
    expect(info?.mate).toBeNull();
    expect(info?.nodes).toBe(123456);
    expect(info?.nps).toBe(72000);
    expect(info?.pvUci).toEqual(['c1e3', 'h8e8', 'b3e3']);
  });

  it('reads a mate score and leaves scoreCp null', () => {
    const info = parseInfo('info depth 30 multipv 2 score mate -3 nodes 9 nps 9 pv a0a1');
    expect(info?.multipv).toBe(2);
    expect(info?.scoreCp).toBeNull();
    expect(info?.mate).toBe(-3);
    expect(info?.pvUci).toEqual(['a0a1']);
  });

  it('ignores info-string and non-info lines', () => {
    expect(parseInfo('info string NNUE evaluation using ...')).toBeNull();
    expect(parseInfo('bestmove c1e3')).toBeNull();
    expect(parseInfo('readyok')).toBeNull();
  });

  it('tolerates an info line with no pv (depth-only)', () => {
    const info = parseInfo('info depth 1 seldepth 1 nodes 20 nps 20000 time 1');
    expect(info?.depth).toBe(1);
    expect(info?.pvUci).toEqual([]);
  });
});
