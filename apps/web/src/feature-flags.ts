// Client build-time gates for hidden or prelaunch surfaces. Defaults are off;
// production or staging must opt in explicitly at build time.

export function darkXiangqiEnabled(): boolean {
  return import.meta.env.VITE_DARK_XIANGQI_ENABLED === 'true';
}

// Dark Mini Xiangqi (7x7) play surface. Always on in dev for convenience (like
// Crossroads below); in prod/staging it is hidden unless the build opts in.
export function darkMiniXiangqiEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DARK_MINI_XIANGQI_ENABLED === 'true';
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
// Hidden in prod/staging unless the build opts in; mirrors the jieqi gate.
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

// Perfect-information Crossroads Chess play surface. Always on in dev for
// convenience; in prod/staging it is hidden unless the build opts in.
export function crossroadsChessEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_CROSSROADS_CHESS_ENABLED === 'true';
}
