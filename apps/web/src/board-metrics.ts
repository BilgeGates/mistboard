// Canonical piece-to-cell proportion for token boards: discs and tiles that
// sit on a grid, whether anchored to intersections (xiangqi family) or cell
// centers (banqi, jungle). Unified 2026-07-02 from a per-renderer spread of
// 75-90%; the placement convention only moves the anchor point, never the
// proportion. Out of scope: chess-family sprite boards (inset is baked into
// the sprite assets and chessground CSS) and shogi koma (traditional near-fill
// at 90%).
export const TOKEN_PIECE_RATIO = 0.83;

export function tokenPieceSize(cell: number): number {
  return Math.round(cell * TOKEN_PIECE_RATIO);
}
