import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crossroadsChessEnabled,
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
    ['Crossroads Chess', 'VITE_CROSSROADS_CHESS_ENABLED', crossroadsChessEnabled],
    ['Dark Crossroads Chess', 'VITE_DARK_CROSSROADS_CHESS_ENABLED', darkCrossroadsChessEnabled],
    ['Reveal Chess', 'VITE_REVEAL_CHESS_ENABLED', revealChessEnabled],
    ['Kriegspiel', 'VITE_KRIEGSPIEL_ENABLED', kriegspielEnabled],
  ])('keeps %s disabled in dev unless explicitly opted in', (_name, envName, enabled) => {
    expect(enabled()).toBe(false);

    vi.stubEnv(envName, 'true');
    expect(enabled()).toBe(true);
  });

  it.each([
    ['Dark Xiangqi', 'VITE_DARK_XIANGQI_ENABLED', darkXiangqiEnabled],
    ['Dark Shogi', 'VITE_DARK_SHOGI_ENABLED', darkShogiEnabled],
    ['Dark Crazyhouse', 'VITE_DARK_CRAZYHOUSE_ENABLED', darkCrazyhouseEnabled],
  ])('enables %s in dev while keeping production opt-in', (_name, envName, enabled) => {
    expect(enabled()).toBe(true);

    vi.stubEnv('DEV', false);
    expect(enabled()).toBe(false);

    vi.stubEnv(envName, 'true');
    expect(enabled()).toBe(true);
  });
});
