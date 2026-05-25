import { describe, expect, it } from 'vitest';
import { shouldCopyPublicAsset } from './public-assets';

describe('public build asset filter', () => {
  it('copies normal public assets', () => {
    expect(shouldCopyPublicAsset('logo.svg')).toBe(true);
    expect(shouldCopyPublicAsset('pieces/chessnut/wK.svg')).toBe(true);
    expect(shouldCopyPublicAsset('replay-samples/bakeoff-g21.jsonl')).toBe(true);
  });

  it('skips local dev artifact directories by default', () => {
    expect(shouldCopyPublicAsset('bakeoff/manifest.json')).toBe(false);
    expect(shouldCopyPublicAsset('bakeoff-v0.9.0/manifest.json')).toBe(false);
    expect(shouldCopyPublicAsset('pixel-lab/gpt/knight-modern-w.png')).toBe(false);
    expect(shouldCopyPublicAsset('pixel-lab-assets/gpt/fog-mistveil.png')).toBe(false);
  });

  it('supports Windows-style paths', () => {
    expect(shouldCopyPublicAsset('pixel-lab-assets\\gpt\\fog-mistveil.png')).toBe(false);
  });

  it('can explicitly include dev artifacts for local builds', () => {
    expect(shouldCopyPublicAsset('bakeoff-v0.9.0/manifest.json', true)).toBe(true);
    expect(shouldCopyPublicAsset('pixel-lab-assets/gpt/fog-mistveil.png', true)).toBe(true);
  });
});
