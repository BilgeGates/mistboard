import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOGI_PIECE_SET,
  SHOGI_PIECE_SETS,
  shogiGlyph,
  shogiImagePieceHref,
  shogiImageSet,
  shogiPieceCode,
  shogiPieceTilePreview,
  shogiPreviewGlyph,
} from './shogi-piece-sets.js';

describe('shogiGlyph', () => {
  it('renders traditional kanji faces, the king differing by side', () => {
    expect(shogiGlyph('kanji', { color: 'black', role: 'K', promoted: false }).text).toBe('王');
    expect(shogiGlyph('kanji', { color: 'white', role: 'K', promoted: false }).text).toBe('玉');
    expect(shogiGlyph('kanji', { color: 'black', role: 'R', promoted: false }).text).toBe('飛');
    expect(shogiGlyph('kanji', { color: 'black', role: 'P', promoted: false }).text).toBe('歩');
  });

  it('uses promoted kanji faces inked red for promoted pieces', () => {
    expect(shogiGlyph('kanji', { color: 'black', role: 'P', promoted: true }).text).toBe('と');
    expect(shogiGlyph('kanji', { color: 'black', role: 'R', promoted: true }).text).toBe('龍');
    expect(shogiGlyph('kanji', { color: 'black', role: 'B', promoted: true }).text).toBe('馬');
    expect(shogiGlyph('kanji', { color: 'black', role: 'P', promoted: true }).promotedInk).toBe(
      true,
    );
  });

  it('kanji-light shares the characters but a cleaner gothic face', () => {
    const kanji = shogiGlyph('kanji', { color: 'black', role: 'S', promoted: false });
    const light = shogiGlyph('kanji-light', { color: 'black', role: 'S', promoted: false });
    expect(light.text).toBe(kanji.text); // same character (銀)
    expect(light.fontFamily).not.toBe(kanji.fontFamily);
    expect(light.fontFamily.toLowerCase()).toContain('gothic');
  });

  it('western uses Latin initials, prefixing + on promoted pieces', () => {
    expect(shogiGlyph('western', { color: 'black', role: 'R', promoted: false }).text).toBe('R');
    expect(shogiGlyph('western', { color: 'white', role: 'N', promoted: false }).text).toBe('N');
    expect(shogiGlyph('western', { color: 'black', role: 'R', promoted: true }).text).toBe('+R');
    expect(shogiGlyph('western', { color: 'black', role: 'P', promoted: true }).text).toBe('+P');
  });

  it('never prefixes + on the non-promoting king and gold', () => {
    // K/G never carry a real promoted flag, but guard the glyph regardless.
    expect(shogiGlyph('western', { color: 'black', role: 'K', promoted: true }).text).toBe('K');
    expect(shogiGlyph('western', { color: 'black', role: 'G', promoted: true }).text).toBe('G');
  });

  it('shrinks the two-character promoted western glyph so it fits the koma', () => {
    const plain = shogiGlyph('western', { color: 'black', role: 'R', promoted: false });
    const promoted = shogiGlyph('western', { color: 'black', role: 'R', promoted: true });
    expect(promoted.fontScale).toBeLessThan(plain.fontScale);
  });

  it('exposes a representative preview glyph per set', () => {
    expect(shogiPreviewGlyph('kanji')).toBe('飛');
    expect(shogiPreviewGlyph('kanji-light')).toBe('飛');
    expect(shogiPreviewGlyph('western')).toBe('R');
  });

  it('lists the text + image sets with kanji as the default', () => {
    expect(SHOGI_PIECE_SETS.map((set) => set.id)).toEqual([
      'kanji',
      'kanji-light',
      'western',
      'international',
      'colored',
      'chess',
    ]);
    expect(DEFAULT_SHOGI_PIECE_SET).toBe('kanji');
  });
});

describe('shogi image sets', () => {
  it('flags only the bundled-art sets as image sets', () => {
    expect(shogiImageSet('international')?.folder).toBe('international');
    expect(shogiImageSet('colored')?.license).toBe('CC BY 4.0');
    expect(shogiImageSet('chess')?.author).toBe('peanatsu');
    expect(shogiImageSet('kanji')).toBeUndefined();
    expect(shogiImageSet('western')).toBeUndefined();
  });

  it('maps pieces to lishogi codes, promotion included', () => {
    expect(shogiPieceCode({ color: 'black', role: 'K', promoted: false })).toBe('OU');
    expect(shogiPieceCode({ color: 'black', role: 'R', promoted: false })).toBe('HI');
    expect(shogiPieceCode({ color: 'black', role: 'P', promoted: false })).toBe('FU');
    expect(shogiPieceCode({ color: 'black', role: 'P', promoted: true })).toBe('TO');
    expect(shogiPieceCode({ color: 'black', role: 'R', promoted: true })).toBe('RY');
  });

  it('picks sente art (0) for your own pieces and gote art (1) for the opponent', () => {
    const set = shogiImageSet('international');
    if (!set) throw new Error('international should be an image set');
    expect(shogiImagePieceHref(set, { color: 'black', role: 'K', promoted: false }, true)).toBe(
      '/piece-sets/international/0OU.svg',
    );
    expect(shogiImagePieceHref(set, { color: 'white', role: 'K', promoted: false }, false)).toBe(
      '/piece-sets/international/1OU.svg',
    );
  });

  it('previews image sets with art and text sets with a glyph', () => {
    expect(shogiPieceTilePreview('chess')).toEqual({
      kind: 'image',
      href: '/piece-sets/chess/0OU.svg',
    });
    expect(shogiPieceTilePreview('kanji')).toEqual({ kind: 'text', text: '飛' });
  });
});
