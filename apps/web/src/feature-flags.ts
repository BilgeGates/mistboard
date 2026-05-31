// Client build-time gates for hidden or prelaunch surfaces. Defaults are off;
// production or staging must opt in explicitly at build time.

export function darkXiangqiEnabled(): boolean {
  return import.meta.env.VITE_DARK_XIANGQI_ENABLED === 'true';
}

export function darkMiniXiangqiEnabled(): boolean {
  return import.meta.env.VITE_DARK_MINI_XIANGQI_ENABLED === 'true';
}
