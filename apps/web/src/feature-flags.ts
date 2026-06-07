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

// Perfect-information Dual Chess play surface. Always on in dev for convenience;
// in prod/staging it is hidden unless the build opts in.
export function dualChessEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DUAL_CHESS_ENABLED === 'true';
}
