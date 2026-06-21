// Runtime feature flags, read from the environment. Single source of truth so
// server gating and the client toggle (exposed via /api/server-status) can't
// drift apart.

// The rated on-switch. Off by default — setting MISTBOARD_RATED_ENABLED=true in
// the deploy environment is the launch decision that makes rated games both
// creatable (lobby) and selectable (client toggle). Even when on, rated still
// requires a signed-in requester and is account-gated at game end.
//
// Read at call time (not a module-load const) so tests can toggle it before
// booting the server, the same way DATABASE_URL is handled.
export function ratedEnabled(): boolean {
  return process.env.MISTBOARD_RATED_ENABLED === 'true';
}

// Dark Xiangqi is a rules spike, not a public/live mode. Keep every future
// server-side entry point behind this explicit opt-in so adding integration
// code cannot accidentally expose rooms in production.
export function darkXiangqiEnabled(): boolean {
  return process.env.MISTBOARD_DARK_XIANGQI_ENABLED === 'true';
}

// Dark Mini Xiangqi is a separate 7x7 rules spike. Keep it independently
// gateable from full Dark Xiangqi so runtime experiments cannot expose both
// families at once by accident.
export function darkMiniXiangqiEnabled(): boolean {
  return process.env.MISTBOARD_DARK_MINI_XIANGQI_ENABLED === 'true';
}

// Jieqi (full-board xiangqi with hidden identities) live rooms. Server-side
// opt-in, default off — the tenant exists but is not launched.
export function jieqiEnabled(): boolean {
  return process.env.MISTBOARD_JIEQI_ENABLED === 'true';
}

// Banqi (8x4 Chinese Dark Chess, symmetric hidden-identity) live rooms.
// Server-side opt-in, default off — the tenant exists but is not launched. PvP
// only at first (PvE is gated on an engine, like jieqi).
export function banqiEnabled(): boolean {
  return process.env.MISTBOARD_BANQI_ENABLED === 'true';
}

// Reveal Chess (standard 8x8 chess with hidden piece identities) live rooms.
// Server-side opt-in, default off — the tenant exists but is not launched.
// PvP-only (no engine/bot at first).
export function revealChessEnabled(): boolean {
  return process.env.MISTBOARD_REVEAL_CHESS_ENABLED === 'true';
}

// Perfect-information Crossroads Chess live rooms. Server-side opt-in, separate
// from the client VITE_CROSSROADS_CHESS_ENABLED page flag, so live PvP cannot be
// exposed in production by accident while the local play surface is enabled.
export function crossroadsChessEnabled(): boolean {
  return process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED === 'true';
}

// Dark Crossroads Chess (the fog 6x8 variant) live rooms. Server-side opt-in,
// default off — the tenant exists but is not launched. PvP-only (Fairy-
// Stockfish is perfect-info and cannot play fog crossroads, so there is no
// engine/bot). Independently gateable from the perfect-info Crossroads flag.
export function darkCrossroadsChessEnabled(): boolean {
  return process.env.MISTBOARD_DARK_CROSSROADS_CHESS_ENABLED === 'true';
}

// Dark Shogi (the fog 9x9 variant, with drops + private hands) live rooms.
// Server-side opt-in, default off — the tenant exists but is not launched.
// PvP-only at first (no bot).
export function darkShogiEnabled(): boolean {
  return process.env.MISTBOARD_DARK_SHOGI_ENABLED === 'true';
}

// Dark Crazyhouse (chess + drops, under fog) live rooms. Server-side opt-in,
// default off — the tenant exists but is not launched. PvP-only (no bot: drops
// explode the belief search). Rides the dark-chess fog kernel + the Dark Shogi
// hands/drops pattern.
export function darkCrazyhouseEnabled(): boolean {
  return process.env.MISTBOARD_DARK_CRAZYHOUSE_ENABLED === 'true';
}

// Kriegspiel (standard chess played blind, ICC wild-16) live rooms. Server-side
// opt-in, default off. PvP-only (no bot yet), with watch/profile/leaderboard
// surfaces when the flag is enabled. Real check/checkmate; the umpire announces
// captures + check categories.
export function kriegspielEnabled(): boolean {
  return process.env.MISTBOARD_KRIEGSPIEL_ENABLED === 'true';
}

// Correspondence (days-per-move) dark chess on the variant-tenant stack.
// Server-side opt-in: gates room creation; existing dchx_ rooms keep routing
// if the flag flips off. Correspondence is account-gated and invite-link
// only at C1.
export function correspondenceEnabled(): boolean {
  return process.env.MISTBOARD_CORRESPONDENCE_ENABLED === 'true';
}
