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
