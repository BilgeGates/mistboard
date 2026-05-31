import type { XiangqiPiece } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  renderXiangqiPieceGlyphed,
  xiangqiGlyph,
  xiangqiPreviewGlyph,
} from './xiangqi-piece-sets.js';

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
});

describe('renderXiangqiPieceGlyphed', () => {
  const redGeneral: XiangqiPiece = { color: 'red', role: 'general' };

  it('renders the traditional character with a labeled disc', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'traditional', {});
    expect(svg).toContain('帥');
    expect(svg).toContain('aria-label="red general"');
  });

  it('renders the western initial', () => {
    expect(renderXiangqiPieceGlyphed(redGeneral, 'western', {})).toContain('>G<');
  });

  it('renders stroked line-art (no character text) for the symbols set', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'symbols', {});
    expect(svg).toContain('<path');
    expect(svg).not.toContain('帥');
  });

  it('renders a distinct symbol for advisor and elephant', () => {
    const advisor = renderXiangqiPieceGlyphed({ color: 'red', role: 'advisor' }, 'symbols', {});
    const elephant = renderXiangqiPieceGlyphed({ color: 'red', role: 'elephant' }, 'symbols', {});
    expect(advisor).toContain('<path');
    expect(elephant).toContain('<path');
    expect(advisor).not.toBe(elephant);
  });

  it('shows a role-neutral mark for a shrouded piece regardless of set', () => {
    const svg = renderXiangqiPieceGlyphed(redGeneral, 'traditional', {
      shrouded: true,
      ariaLabel: 'red hidden piece',
    });
    expect(svg).toContain('?');
    expect(svg).not.toContain('帥');
    expect(svg).toContain('aria-label="red hidden piece"');
  });
});

describe('xiangqiPreviewGlyph', () => {
  it('returns a representative red general per set', () => {
    expect(xiangqiPreviewGlyph('traditional')).toBe('帥');
    expect(xiangqiPreviewGlyph('simplified')).toBe('帅');
    expect(xiangqiPreviewGlyph('western')).toBe('G');
    expect(xiangqiPreviewGlyph('symbols')).toBe('★');
  });
});
