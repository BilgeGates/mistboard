// Client mirror of the server's rated on-switch (MISTBOARD_RATED_ENABLED),
// fetched via /api/server-status. Lives in its own tiny module so main.ts can
// set it without eagerly importing the large landing chunk (preserving the
// code-split). Defaults off: the rated toggle stays "coming soon" until the
// server confirms rated is live.

let ratedModeEnabled = false;

export function setRatedModeEnabled(value: boolean): void {
  ratedModeEnabled = value;
}

export function isRatedModeEnabled(): boolean {
  return ratedModeEnabled;
}
