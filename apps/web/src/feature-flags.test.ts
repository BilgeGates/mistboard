import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  darkCrazyhouseEnabled,
  darkCrossroadsChessEnabled,
  darkShogiEnabled,
  darkXiangqiEnabled,
  kriegspielEnabled,
  revealChessEnabled,
} from './feature-flags.js';

describe('client feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['Dark Xiangqi', 'VITE_DARK_XIANGQI_ENABLED', darkXiangqiEnabled],
    ['Reveal Chess', 'VITE_REVEAL_CHESS_ENABLED', revealChessEnabled],
    ['Dark Crossroads Chess', 'VITE_DARK_CROSSROADS_CHESS_ENABLED', darkCrossroadsChessEnabled],
    ['Dark Shogi', 'VITE_DARK_SHOGI_ENABLED', darkShogiEnabled],
    ['Dark Crazyhouse', 'VITE_DARK_CRAZYHOUSE_ENABLED', darkCrazyhouseEnabled],
    ['Kriegspiel', 'VITE_KRIEGSPIEL_ENABLED', kriegspielEnabled],
  ])('enables %s in dev while keeping production opt-in', (_name, envName, enabled) => {
    expect(enabled()).toBe(true);

    vi.stubEnv('DEV', false);
    expect(enabled()).toBe(false);

    vi.stubEnv(envName, 'true');
    expect(enabled()).toBe(true);
  });
});
