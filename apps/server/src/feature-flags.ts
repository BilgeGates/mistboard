// Runtime feature flags, read once at process start from the environment.
// Single source of truth so server gating and the client toggle (exposed via
// /api/server-status) can't drift apart.

// The rated on-switch. Off by default — flipping MISTBOARD_RATED_ENABLED=true in
// the deploy environment is the launch decision that makes rated games both
// creatable (lobby) and selectable (client toggle). Even when on, rated still
// requires a signed-in requester and is account-gated at game end.
export const ratedEnabled = process.env.MISTBOARD_RATED_ENABLED === 'true';
