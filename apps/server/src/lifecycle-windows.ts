// Pregame-abort and disconnect-forfeit windows, shared by both live-room
// stacks: the legacy chess `room-manager` and the generic `variant-tenant`
// runtime. Kept in a neutral leaf so the reusable tenant layer does not have to
// import a game-lifecycle constant from the legacy chess stack (the only edge
// that coupled the two) — and so the eventual room-manager removal can't take
// the constant with it.

// How long the side to move has to play their first move before the game is
// auto-aborted. One window for white's move 1, then a fresh one for black's.
export const ABORT_WINDOW_MS = 30_000;

// How long a disconnected player has to return before forfeiting an
// in-progress game (post-move-1). Reconnecting within the window cancels it.
export const FORFEIT_WINDOW_MS = 30_000;
