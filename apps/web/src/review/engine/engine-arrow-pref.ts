// Persisted "show engine arrows" preference for the review surfaces.
//
// Separate from the xiangqi appearance prefs (piece set / board layout): this is
// an analysis-behaviour toggle, not a look, and it applies to every review
// tenant rather than the xiangqi board alone. Defaults ON so a first-time
// analyst sees the arrows without hunting for the setting.

const STORAGE_KEY = 'mistboard.review.engineArrows';

/** Read the stored preference. Missing, malformed, or unreadable storage (Safari
 *  private mode throws on access) all fall back to ON. */
export function readEngineArrowsEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Persist the preference. A storage failure is not worth breaking the toggle
 *  over: the in-memory flag still drives the current session. */
export function writeEngineArrowsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore
  }
}
