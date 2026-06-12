# Login Track

> Status: planned account-hardening track, not an M1 gameplay gate.
> Canonical source: [ROADMAP.md](ROADMAP.md) for launch sequencing and rated
> flip prerequisites.
> Last reviewed: 2026-06-12.

_Last updated: 2026-05-27_

## Purpose

Make Mistboard accounts trustworthy enough for public profiles, rated play, and
future contribution workflows while preserving low-friction casual dark chess.

This track is account and login hardening, not a social-product expansion. It
should support the human ladder and engine ecosystem without pulling OAuth,
chat, friends, teams, or broad moderation into the near-term surface.

## Principles

- Casual play should remain possible without an account unless a specific
  surface has a clear abuse, cost, or integrity reason to require sign-in.
- Email-code login is the durable account credential. Mistboard should not add
  password auth or OAuth just for parity with other chess sites.
- Public identity must be deliberate. Do not publish an email-derived handle or
  display name before the user has chosen or confirmed it.
- Account identity is not live-game authority. Room seat tokens remain the live
  move authority boundary.
- Rated play needs a durable human identity and an explicit fair-play
  acknowledgement before the first rated game.
- Guest games remain guest games. Do not retroactively claim anonymous history
  into an account.

## Current Delta

Already present:

- Passwordless email-code auth.
- Account sessions backed by `account_sessions`.
- Public handles, display names, profiles, and account-attributed games.
- Account-bound live seats for signed-in play.
- Rated-game write path gated by signed-in account seats.

Missing or too implicit:

- Signup and login are the same flow with different copy.
- New users currently get a public handle and display name derived from email.
- There is no profile-completion state for fresh accounts.
- There is no first-rated fair-play acknowledgement.
- Email-code start and confirm flows need abuse controls: rate limits, resend
  cooldowns, attempt caps, and cleanup.
- The anonymous vs signed-in feature matrix is not written down as a product
  rule.

## Milestones

### L0: Flow Spec And State Machine

Goal: make the intended account states explicit before changing code.

Work:

- Define the account states: signed out, email challenge pending,
  authenticated-but-profile-incomplete, active account, and rated-ready account.
- Decide the persistence shape for profile completion, such as
  `profile_completed_at` or an equivalent account-state field.
- Define the copy model for sign-in vs account creation. Recommended:
  `Continue with email` for the shared credential step, then
  `Choose your Mistboard handle` for new accounts.
- Write the anonymous/signed-in feature matrix that L5 will enforce.

Exit criteria:

- A contributor can read the state machine and know where new users, returning
  users, incomplete profiles, and first-rated users are routed.
- The design preserves account-optional casual play.

### L1: Signup Identity Safety

Goal: prevent accidental publication of email-derived identity.

Work:

- Mark fresh accounts as profile-incomplete until the user chooses or confirms a
  handle and display name.
- Use a non-identifying temporary handle if the database needs a handle before
  setup is complete.
- Hide incomplete accounts from public profile and leaderboard surfaces.
- Route incomplete signed-in users to profile setup before profile, settings,
  rated, or account-attributed surfaces.

Exit criteria:

- Creating an account with `first.last@example.com` does not publish
  `first-last` unless the user explicitly chooses it.
- Existing completed accounts keep working.
- Incomplete accounts cannot appear as public player profiles.

Tests:

- New email-code confirmation produces an incomplete account state.
- Returning users bypass setup.
- Public profile lookup omits incomplete accounts.
- Account identity still does not authorize private live-room access by itself.

### L2: Handle Setup UX

Goal: make account creation feel deliberate and familiar.

Work:

- Add the post-code setup screen for handle and display name.
- Validate handle syntax and availability.
- Show clear errors for invalid, reserved, taken, or temporarily reserved
  handles.
- Complete the account only after the user submits the setup form.
- Update nav and account-page copy so `Sign in`, `Create account`, and
  `Continue with email` are not misleading.

Exit criteria:

- A new user can verify email, choose public identity, and land signed in.
- A returning user can sign in without seeing signup setup.
- The user understands which fields are public and which are private.

Tests:

- Setup succeeds with a valid available handle.
- Setup rejects invalid, reserved, taken, and recently reserved handles.
- Refreshing during setup keeps the user in the correct state.

### L3: Email Auth Abuse Controls

Goal: make email-code auth safe enough for broader traffic.

Work:

- Add per-email and per-IP throttles for challenge creation.
- Add resend cooldowns.
- Cap failed confirm attempts per challenge.
- Delete or expire old challenges.
- Prune expired or revoked account sessions.
- Keep logs and analytics free of raw email addresses, codes, tokens, and
  secret-bearing values.

Exit criteria:

- One actor cannot cheaply spam email sends or brute-force a code.
- Expired auth rows do not grow without bound.
- Error messages do not reveal whether an email already has an account.

Tests:

- Challenge start throttles by email and IP.
- Confirm locks or expires after too many failed attempts.
- Expired challenges and sessions are ignored and cleaned up.
- Delivery failures delete unusable challenges.

Backlog (optional, not scheduled):

- Chess-puzzle captcha at signup, lichess/playstrategy-style (mate-in-1: render
  a position, accept a move, verify against the solution set). This is a
  thematic delight/parity flourish, not a real security control. A chess engine
  solves mate-in-1 trivially, so it deters naive spam bots only. If actual
  bot-defense at signup is the goal, prefer Cloudflare Turnstile (stronger,
  invisible); the two can coexist (Turnstile as the gate, puzzle as the charm).
- Implementation is cheap: chessops already gives checkmate detection (the
  draft960 path uses `position.outcome()` in `packages/game/src/variants.ts`)
  and `packages/board-render` draws the static FEN. Roughly a half-day with a
  small curated mate-in-1 set; skip DB-mining a generator for a first cut.
- Must use standard full-information chess, never fog. Dark chess wins by
  king-capture and has no checkmate concept, and a fogged position is not
  reliably human-solvable or deterministically verifiable. Build it on the
  plain chessops position, separate from the fog kernel.
- Do not retrofit onto the feedback/contact form: it is already honeypot +
  rate-limited (1 anon submission / 24h), and a puzzle there adds friction to
  the one flow that should stay frictionless. Signup is the only surface where a
  delight gate reads as normal.

### L4: First-Rated Fair-Play Gate

Goal: set the competitive contract at the point where it matters.

Work:

- Add a `fair_play_accepted_at`-style account field.
- Before first rated lobby or rated room creation, show a concise acknowledgement.
- Gate rated APIs on signed-in, profile-complete, fair-play-accepted accounts.
- Keep ordinary account creation light; do not make casual users accept a rated
  policy before they need it.

Recommended acknowledgement:

- Rated games are human-only.
- Do not use engines, databases, another person, or outside assistance.
- Do not use multiple accounts to affect the ladder.
- Completed rated games are part of the public integrity record.
- Ratings or accounts may be removed for abuse.

Exit criteria:

- A user cannot enter rated play without accepting the fair-play terms.
- Anonymous and incomplete-profile users receive actionable rated-gate errors.
- Casual play is unaffected.

Tests:

- Rated lobby rejects anonymous users.
- Rated lobby rejects signed-in users with incomplete profiles.
- Rated lobby rejects users who have not accepted fair play.
- Acceptance allows rated entry and is persisted.

### L5: Feature Gate Matrix

Goal: make anonymous and signed-in access deliberate.

Recommended first policy:

| Surface | Anonymous | Signed in | Profile complete | Fair-play accepted |
| --- | --- | --- | --- | --- |
| Read pages, articles, rules | yes | yes | yes | yes |
| Learn/tutorial | yes | yes | yes | yes |
| Friend challenge, casual | yes | yes | yes | yes |
| Casual lobby | yes, unless abuse forces a gate | yes | yes | yes |
| Engine play | limited or fallback-only | yes | yes | yes |
| Account profile/history | no | setup if incomplete | yes | yes |
| Rated lobby/game | no | no | no | yes |
| Engine-author/contributor tools | no | permissioned | permissioned | permissioned |

Engine-play decision:

- Preserve the empty-lobby fallback unless there is a clear cost or abuse reason
  to gate it.
- If engine play needs protection, prefer anonymous limits over a hard sign-in
  wall: limited anonymous fallback, stronger or higher-quota signed-in engine
  play, and persistent history only for accounts.

Exit criteria:

- Product copy, client behavior, and server gates agree on what requires an
  account.
- Rated requirements are enforced server-side, not only in the client.

Tests:

- Anonymous users can still complete the intended casual flow.
- Signed-in incomplete users are routed to setup for account-owned surfaces.
- Server routes enforce the same gates the UI describes.

### L6: Observability And Support

Goal: understand account flow health without collecting unnecessary data.

Work:

- Track non-secret funnel events: challenge started, code verified, signup setup
  completed, returning login completed, rated fair-play accepted.
- Track auth error categories without logging codes, raw tokens, or secret
  values.
- Add a small account-flow smoke to the release checklist once L1-L4 land.

Exit criteria:

- We can tell where users drop out of signup.
- We can verify production email-code auth without exposing secrets.
- Account-flow regressions are visible before rated launch.

## Sequencing

Near-term march:

1. L0: write the state machine and feature matrix decisions.
2. L1: stop accidental public email-derived identity.
3. L2: ship handle/display-name setup.
4. L3: add abuse controls before broader traffic.
5. L4: add the rated fair-play gate before the standard rated flip.
6. L5: encode the final anonymous/signed-in feature policy as gates.
7. L6: add production-safe account-flow observability.

Relationship to the main roadmap:

- L1-L3 are account hardening and should land before broad public distribution
  if accounts are promoted in the nav.
- L4 is a hard prerequisite for M3 standard rated flip.
- L5 can be staged, but any engine-play gate must be reconciled with the M1
  empty-lobby fallback promise.

## Non-Goals

- Password auth.
- OAuth provider work.
- Friends, followers, teams, forums, or chat.
- Broad moderation tooling.
- Guest-game claiming.
- Historical import of anonymous games into accounts.
- Per-game hide/unpublish controls in the first login hardening pass.
