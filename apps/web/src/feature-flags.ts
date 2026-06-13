// Client build-time gates for hidden or prelaunch surfaces. Defaults are off;
// production or staging must opt in explicitly at build time.

export function darkXiangqiEnabled(): boolean {
  return import.meta.env.VITE_DARK_XIANGQI_ENABLED === 'true';
}

export function darkMiniXiangqiEnabled(): boolean {
  return import.meta.env.VITE_DARK_MINI_XIANGQI_ENABLED === 'true';
}

export function darkMiniXiangqiPublicEntryEnabled(): boolean {
  return (
    darkMiniXiangqiEnabled() &&
    import.meta.env.VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED === 'true'
  );
}

// Dark-chess correspondence (days-per-move) entry points. The server gates the
// create route independently (MISTBOARD_CORRESPONDENCE_ENABLED); this only
// hides the landing picker, so an off web flag never strands a live room.
export function correspondenceEnabled(): boolean {
  return import.meta.env.VITE_CORRESPONDENCE_ENABLED === 'true';
}

// Perfect-information Crossroads Chess play surface. Always on in dev for
// convenience; in prod/staging it is hidden unless the build opts in.
export function crossroadsChessEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_CROSSROADS_CHESS_ENABLED === 'true';
}
