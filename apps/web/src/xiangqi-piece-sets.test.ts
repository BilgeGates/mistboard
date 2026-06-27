import { XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import type { XiangqiPiece } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_XIANGQI_PIECE_SET,
  renderXiangqiPieceGlyphed,
  xiangqiGlyph,
  xiangqiPieceTilePreview,
  xiangqiPreviewGlyph,
} from './xiangqi-piece-sets.js';

describe('default piece set', () => {
  it('defaults the xiangqi family to the animal origami art', () => {
    expect(DEFAULT_XIANGQI_PIECE_SET).toBe('animal-origami');
  });
});

describe('xiangqiGlyph', () => {
  it('uses distinct red/black characters for the traditional set', () => {
    expect(xiangqiGlyph('traditional', 'red', 'general')).toBe('帥');
    expect(xiangqiGlyph('traditional', 'black', 'general')).toBe('將');
    expect(xiangqiGlyph('traditional', 'red', 'horse')).toBe('傌');
    expect(xiangqiGlyph('traditional', 'black', 'horse')).toBe('馬');
  });

  it('covers the full xiangqi roles, including advisor and elephant', () => {
    expect(xiangqiGlyph('traditional', 'red', 'advisor')).toBe('仕');
    expect(xiangqiGlyph('traditional', 'black', 'advisor')).toBe('士');
    expect(xiangqiGlyph('traditional', 'red', 'elephant')).toBe('相');
    expect(xiangqiGlyph('traditional', 'black', 'elephant')).toBe('象');
    expect(xiangqiGlyph('western', 'red', 'advisor')).toBe('A');
    expect(xiangqiGlyph('western', 'red', 'elephant')).toBe('E');
  });

  it('uses shared modern characters for the simplified set', () => {
    expect(xiangqiGlyph('simplified', 'red', 'general')).toBe('帅');
    expect(xiangqiGlyph('simplified', 'black', 'general')).toBe('将');
    expect(xiangqiGlyph('simplified', 'red', 'horse')).toBe('马');
    expect(xiangqiGlyph('simplified', 'black', 'horse')).toBe('马');
  });

  it('uses color-agnostic Latin initials for the western set', () => {
    expect(xiangqiGlyph('western', 'red', 'chariot')).toBe('R');
    expect(xiangqiGlyph('western', 'black', 'cannon')).toBe('C');
    expect(xiangqiGlyph('western', 'red', 'soldier')).toBe('S');
  });

  it('keeps an initial fallback for the animal image sets', () => {
    expect(xiangqiGlyph('animal-seal', 'red', 'general')).toBe('G');
    expect(xiangqiGlyph('animal-origami', 'black', 'elephant')).toBe('E');
  });
});

describe('renderXiangqiPieceGlyphed', () => {
  const redGeneral: XiangqiPiece = { color: 'red', role: 'general' };

  it('renders the traditional character as the shared baked glyph path', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'traditional', {});
    // Unified rendering: the live board draws the same baked Noto outline the OG
    // cards and variant mini-boards use, not a system-serif <text> glyph.
    expect(svg).toContain(`<path d="${XIANGQI_GLYPH_PATHS.帥}"`);
    expect(svg).not.toContain('<text');
    expect(svg).toContain('aria-label="red general"');
  });

  it('renders the western initial', () => {
    expect(renderXiangqiPieceGlyphed(redGeneral, 'western', {})).toContain('>G<');
  });

  it('renders stroked line-art (no character text) for the symbols set', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'symbols', {});
    expect(svg).toContain('<path');
    expect(svg).not.toContain(XIANGQI_GLYPH_PATHS.帥);
  });

  it('renders a distinct symbol for advisor and elephant', () => {
    const advisor = renderXiangqiPieceGlyphed({ color: 'red', role: 'advisor' }, 'symbols', {});
    const elephant = renderXiangqiPieceGlyphed({ color: 'red', role: 'elephant' }, 'symbols', {});
    expect(advisor).toContain('<path');
    expect(elephant).toContain('<path');
    expect(advisor).not.toBe(elephant);
  });

  it('renders the animal sets from the full seven-role image assets', () => {
    const sealAdvisor = renderXiangqiPieceGlyphed(
      { color: 'red', role: 'advisor' },
      'animal-seal',
      {},
    );
    const origamiElephant = renderXiangqiPieceGlyphed(
      { color: 'black', role: 'elephant' },
      'animal-origami',
      {},
    );
    expect(sealAdvisor).toContain('/piece-sets/xiangqi/animal-seal/red-advisor.png');
    expect(origamiElephant).toContain('/piece-sets/xiangqi/animal-origami/black-elephant.png');
    expect(sealAdvisor).not.toContain('<text');
    expect(origamiElephant).not.toContain('<text');
  });

  it('uses the actual horse artwork for the seal horse slot', () => {
    const horse = renderXiangqiPieceGlyphed({ color: 'red', role: 'horse' }, 'animal-seal', {});
    expect(horse).toContain('/piece-sets/xiangqi/animal-seal/red-horse.png');
    expect(horse).not.toContain('crane');
  });

  it('uses tortoise advisor and elephant asset slots in the seal set', () => {
    const advisor = renderXiangqiPieceGlyphed(
      { color: 'black', role: 'advisor' },
      'animal-seal',
      {},
    );
    const elephant = renderXiangqiPieceGlyphed(
      { color: 'red', role: 'elephant' },
      'animal-seal',
      {},
    );
    expect(advisor).toContain('/piece-sets/xiangqi/animal-seal/black-advisor.png');
    expect(elephant).toContain('/piece-sets/xiangqi/animal-seal/red-elephant.png');
    expect(advisor).not.toContain('<text');
    expect(elephant).not.toContain('<text');
  });

  it('shows a role-neutral mark for a shrouded piece regardless of set', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'traditional', {
      shrouded: true,
      ariaLabel: 'red hidden piece',
    });
    expect(svg).toContain('?');
    expect(svg).not.toContain(XIANGQI_GLYPH_PATHS.帥);
    expect(svg).toContain('aria-label="red hidden piece"');
  });

  it('does not reveal animal identity for a shrouded animal-set piece', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'animal-seal', {
      shrouded: true,
      ariaLabel: 'red hidden piece',
    });
    expect(svg).toContain('?');
    expect(svg).not.toContain('/piece-sets/xiangqi/animal-seal/red-general.png');
    expect(svg).toContain('aria-label="red hidden piece"');
  });
});

describe('xiangqiPreviewGlyph', () => {
  it('returns a representative red general per set', () => {
    expect(xiangqiPreviewGlyph('traditional')).toBe('帥');
    expect(xiangqiPreviewGlyph('simplified')).toBe('帅');
    expect(xiangqiPreviewGlyph('western')).toBe('G');
    expect(xiangqiPreviewGlyph('symbols')).toBe('★');
    expect(xiangqiPreviewGlyph('animal-seal')).toBe('G');
    expect(xiangqiPreviewGlyph('animal-origami')).toBe('G');
  });
});

describe('xiangqiPieceTilePreview', () => {
  it('uses text previews for glyph sets and image previews for the animal sets', () => {
    expect(xiangqiPieceTilePreview('traditional')).toEqual({ kind: 'text', text: '帥' });
    expect(xiangqiPieceTilePreview('animal-seal')).toEqual({
      kind: 'image',
      href: '/piece-sets/xiangqi/animal-seal/red-general.png',
    });
    expect(xiangqiPieceTilePreview('animal-origami')).toEqual({
      kind: 'image',
      href: '/piece-sets/xiangqi/animal-origami/red-general.png',
    });
  });
});
