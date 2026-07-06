import { describe, expect, it } from 'vitest';
import { importXiangqiGame } from './xiangqi-import.js';

// Canonical moves for the shared test opening (red central cannon, black central
// cannon, red horse) — every notation below must normalize to exactly these.
const OPENING = [
  { from: 'b3', to: 'e3' },
  { from: 'h8', to: 'e8' },
  { from: 'b1', to: 'c3' },
];

describe('importXiangqiGame', () => {
  it('reads our 1-indexed coordinate notation', () => {
    const result = importXiangqiGame('1. b3e3 h8-e8 2. b1c3');
    expect(result.error).toBeUndefined();
    expect(result.format).toBe('coordinate');
    expect(result.moves).toEqual(OPENING);
  });

  it('reads 0-indexed UCI/ICCS notation (rank 0 forces the convention)', () => {
    // The same game one rank lower: our b3e3 -> b2e2, h8e8 -> h7e7, b1c3 -> b0c2.
    // The b0c2 token has rank 0, which only the 0-indexed codec accepts.
    const result = importXiangqiGame('b2e2 h7e7 b0c2');
    expect(result.error).toBeUndefined();
    expect(result.format).toBe('uci-0indexed');
    expect(result.moves).toEqual(OPENING);
  });

  it('prefers our native 1-indexed reading when a game is legal under both', () => {
    // Every token here is rank 1-9, so both coordinate codecs detect it; the
    // 1-indexed reading replays legally and wins the tiebreak.
    const result = importXiangqiGame('b3e3 h8e8 b1c3');
    expect(result.format).toBe('coordinate');
    expect(result.moves).toEqual(OPENING);
  });

  it('reads rank-10 tokens unambiguously as 1-indexed', () => {
    const result = importXiangqiGame('a1a2 a10a9');
    expect(result.error).toBeUndefined();
    expect(result.format).toBe('coordinate');
    expect(result.moves).toEqual([
      { from: 'a1', to: 'a2' },
      { from: 'a10', to: 'a9' },
    ]);
  });

  it('rejects notation nothing can parse', () => {
    const result = importXiangqiGame('hello there');
    expect(result.moves).toEqual([]);
    expect(result.format).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('reports an illegal coordinate game rather than pretending it parsed', () => {
    // b1b2 is a well-formed coordinate token but not a legal horse move.
    const result = importXiangqiGame('b1b2');
    expect(result.format).toBeNull();
    expect(result.error).toMatch(/not legal/);
  });

  it('treats empty input as an error, not an empty game', () => {
    expect(importXiangqiGame('   ').error).toBeTruthy();
  });

  describe('WXF relative notation', () => {
    it('reads the documented opening C2.5 / C8.5 / H2+3', () => {
      // Straight from articles/content: 炮二平五, 炮8平5, 马二进三.
      const result = importXiangqiGame('C2.5 C8.5 H2+3');
      expect(result.error).toBeUndefined();
      expect(result.format).toBe('wxf');
      expect(result.moves).toEqual([
        { from: 'h3', to: 'e3' }, // red file-2 cannon (h) traverses to centre
        { from: 'h8', to: 'e8' }, // black file-8 cannon (h) traverses to centre
        { from: 'h1', to: 'g3' }, // red file-2 horse advances to file 3 (g)
      ]);
    });

    it('reads a straight-mover rank-count move (R1+1)', () => {
      const result = importXiangqiGame('R1+1');
      expect(result.format).toBe('wxf');
      expect(result.moves).toEqual([{ from: 'i1', to: 'i2' }]); // file-1 chariot (i) up one
    });

    it('accepts lowercase letters and the = traverse operator', () => {
      const result = importXiangqiGame('c2=5');
      expect(result.format).toBe('wxf');
      expect(result.moves).toEqual([{ from: 'h3', to: 'e3' }]);
    });

    it('does not misread coordinate tokens as WXF', () => {
      expect(importXiangqiGame('b3e3').format).toBe('coordinate');
    });
  });

  describe('Chinese relative notation', () => {
    const EXPECTED = [
      { from: 'h3', to: 'e3' },
      { from: 'h8', to: 'e8' },
      { from: 'h1', to: 'g3' },
    ];

    it('reads the same opening with mixed Chinese/Arabic numerals', () => {
      // Red numerals Chinese, black numerals Arabic — the standard convention.
      const result = importXiangqiGame('炮二平五 炮8平5 马二进三');
      expect(result.error).toBeUndefined();
      expect(result.format).toBe('chinese');
      expect(result.moves).toEqual(EXPECTED);
    });

    it('chunks a spaceless record into four-character moves', () => {
      const result = importXiangqiGame('炮二平五炮8平5马二进三');
      expect(result.format).toBe('chinese');
      expect(result.moves).toEqual(EXPECTED);
    });

    it('tolerates move-number ordinals in the record', () => {
      const result = importXiangqiGame('1. 炮二平五 炮8平5 2. 马二进三');
      expect(result.format).toBe('chinese');
      expect(result.moves).toEqual(EXPECTED);
    });
  });

  describe('DhtmlXQ packed records', () => {
    it('decodes the 炮二平五 anchor move (7747 = h3->e3)', () => {
      const result = importXiangqiGame('7747');
      expect(result.error).toBeUndefined();
      expect(result.format).toBe('dhtmlxq');
      expect(result.moves).toEqual([{ from: 'h3', to: 'e3' }]);
    });

    it('decodes the documented opening as a packed digit string', () => {
      // h3e3=7747, h8e8=7242, h1g3=7967.
      const result = importXiangqiGame('774772427967');
      expect(result.format).toBe('dhtmlxq');
      expect(result.moves).toEqual([
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
        { from: 'h1', to: 'g3' },
      ]);
    });

    it('extracts the movelist from a full [DhtmlXQ_movelist] block', () => {
      const result = importXiangqiGame('[DhtmlXQ_movelist]774772427967[DhtmlXQ_whoplay]0');
      expect(result.format).toBe('dhtmlxq');
      expect(result.moves).toHaveLength(3);
    });

    it('rejects a digit run that is not a whole number of moves', () => {
      expect(importXiangqiGame('774').format).toBeNull();
    });
  });

  describe('cross-format equivalence', () => {
    // The same opening (h3e3, h8e8, h1g3) written five ways must normalize to
    // identical canonical moves — one property that catches any codec drift.
    const CANONICAL = [
      { from: 'h3', to: 'e3' },
      { from: 'h8', to: 'e8' },
      { from: 'h1', to: 'g3' },
    ];
    const SAME_GAME: Record<string, string> = {
      coordinate: 'h3e3 h8e8 h1g3',
      'uci-0indexed': 'h2e2 h7e7 h0g2',
      wxf: 'C2.5 C8.5 H2+3',
      chinese: '炮二平五 炮8平5 马二进三',
      dhtmlxq: '774772427967',
    };

    for (const [format, input] of Object.entries(SAME_GAME)) {
      it(`decodes ${format} to the same canonical moves`, () => {
        const result = importXiangqiGame(input);
        expect(result.format).toBe(format);
        expect(result.moves).toEqual(CANONICAL);
      });
    }
  });
});
