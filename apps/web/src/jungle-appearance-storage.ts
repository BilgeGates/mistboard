// Jungle-family appearance resolution, split from theme.ts so the renderers can
// read the current look without importing the whole theme module.
//
// There is NO settings UI for these yet (decision 2026-07-26): the product ships
// one opinionated default, and the query hooks below are how alternatives get
// compared. Adding a picker is a product call, not a prerequisite — the axes are
// separate here so a future picker is a UI change, not a rendering change.
//
//   ?jungleBoard=illustrated|bare
//   ?junglePieces=animals|characters
//
// Mirrors the existing `?xqPieces=` preview hook.

import {
  DEFAULT_JUNGLE_BOARD_SKIN,
  DEFAULT_JUNGLE_PIECE_SKIN,
  isJungleBoardSkin,
  isJunglePieceSkin,
  type JungleBoardSkin,
  type JunglePieceSkin,
} from './jungle-skins.js';

function queryParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function currentJungleBoardSkin(): JungleBoardSkin {
  const value = queryParam('jungleBoard');
  return isJungleBoardSkin(value) ? value : DEFAULT_JUNGLE_BOARD_SKIN;
}

export function currentJunglePieceSkin(): JunglePieceSkin {
  const value = queryParam('junglePieces');
  return isJunglePieceSkin(value) ? value : DEFAULT_JUNGLE_PIECE_SKIN;
}
