// Client build-time gates for hidden or prelaunch surfaces. Most dev defaults
// stay on for local parity with launched variants; parked surfaces use explicit
// opt-in only so they do not reappear in active product UI by accident.

export function darkXiangqiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DARK_XIANGQI_ENABLED === 'true';
}

// Dark Mini Xiangqi (7x7) play surface. Always on in dev for convenience (like
// Crossroads below); in prod/staging it is hidden unless the build opts in.
export function darkMiniXiangqiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DARK_MINI_XIANGQI_ENABLED === 'true';
}

// Drop Mini Xiangqi (7x7 mini xiangqi with crazyhouse-style reserves). Public
// by default; keep this helper so the tenant registry matches gated variants.
export function dropMiniXiangqiEnabled(): boolean {
  return true;
}

// Identity-hidden jieqi (揭棋) play surface. Always on in dev for convenience
// (like DMX/Crossroads/correspondence); in prod/staging it is hidden unless the
// build opts in.
export function jieqiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_JIEQI_ENABLED === 'true';
}

// Banqi (8x4 Chinese Dark Chess, symmetric hidden-identity) play surface. Always
// on in dev for convenience; in prod/staging it is hidden unless the build opts
// in; mirrors the jieqi gate.
export function banqiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_BANQI_ENABLED === 'true';
}

// Reveal Chess (chess-jieqi, hidden identities on an 8x8 board) play surface.
// Explicit build-time opt-in only.
export function revealChessEnabled(): boolean {
  return import.meta.env.VITE_REVEAL_CHESS_ENABLED === 'true';
}

export function darkMiniXiangqiPublicEntryEnabled(): boolean {
  return (
    darkMiniXiangqiEnabled() &&
    (import.meta.env.DEV || import.meta.env.VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED === 'true')
  );
}

// Dark-chess correspondence (days-per-move) entry points. Always on in dev for
// convenience (matching Crossroads/DMX); in prod/staging it is hidden unless the
// build opts in. The server gates the create route independently
// (MISTBOARD_CORRESPONDENCE_ENABLED); this only hides the landing picker, so an
// off web flag never strands a live room.
export function correspondenceEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_CORRESPONDENCE_ENABLED === 'true';
}

// Perfect-information Crossroads Chess play surface. Explicit build-time opt-in
// only; keep it disabled by default even in dev so it does not keep reappearing
// after being removed from the active product surface.
export function crossroadsChessEnabled(): boolean {
  return import.meta.env.VITE_CROSSROADS_CHESS_ENABLED === 'true';
}

// Dark Crossroads Chess (the fog 6x8 variant) play surface. Server-side opt-in
// is MISTBOARD_DARK_CROSSROADS_CHESS_ENABLED; this gates the landing picker and
// deep links. Explicit build-time opt-in only.
export function darkCrossroadsChessEnabled(): boolean {
  return import.meta.env.VITE_DARK_CROSSROADS_CHESS_ENABLED === 'true';
}

// Dark Shogi (the fog 9x9 variant) play surface. Server-side opt-in is
// MISTBOARD_DARK_SHOGI_ENABLED; this gates the landing picker and deep links.
// Always on in dev for local parity with production launch flags.
export function darkShogiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DARK_SHOGI_ENABLED === 'true';
}

// Dark Crazyhouse (the fog 8x8 chess + drops variant) play surface. Server-side
// opt-in is MISTBOARD_DARK_CRAZYHOUSE_ENABLED; this gates the landing picker and
// deep links. Always on in dev for local parity with production launch flags.
export function darkCrazyhouseEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DARK_CRAZYHOUSE_ENABLED === 'true';
}

// Kriegspiel (standard chess played blind) play surface. Server-side opt-in is
// MISTBOARD_KRIEGSPIEL_ENABLED; this gates play entry, watch, profile, and
// leaderboard surfaces.
export function kriegspielEnabled(): boolean {
  return import.meta.env.VITE_KRIEGSPIEL_ENABLED === 'true';
}
