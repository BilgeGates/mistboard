# CLAUDE.md

Public agent guidance for Mistboard.

Mistboard is an open-source platform foundation for hidden-information games,
starting with **dark chess**. "Fog of War chess" is useful secondary wording for
SEO and rules explanation. Keep public-facing work focused on
implementation, correctness, and contributor experience.

## Product Rule

Before adding any feature, ask:

> Does this make Mistboard a more trustworthy, serious place to play, study,
> rank, or build engines for dark chess and future hidden-information
> games?

If no, defer it. Link-based play is a low-friction UX promise, not the whole
project thesis. Draft960 is a pregame feature inside Fog of War, not a separate
product surface.

## Architecture Rules

- Server owns canonical game state.
- Clients render `PlayerView`, never canonical truth.
- Fog of War must never send hidden pieces or hidden opponent moves to the wrong client.
- Event history should become the replay and reconnect source of truth.
- Keep v1 low-friction and account-optional.

## Documentation Rules

- Public docs are for users and collaborators.
- Private strategy, outreach, funding, entity planning, and operational notes belong outside the public repo.
- Follow `docs/documentation-policy.md` before adding or expanding docs.

## Announcements

When the user says "card this" (or equivalent) after a user-facing change ships, append a one-line entry to `apps/web/src/announcements.ts` with today's date. Skip for internal-only changes (engine internals, infra, CI, refactors). When in doubt, ask.

## Hard Deferrals

Do not build or surface in v1 unless explicitly gate-cleared:

- ungated ratings
- broad public matchmaking
- tournaments
- chat
- moderation tooling
- OAuth
- billing
- engine analysis
- full lichess/lila fork
- standalone non-Fog game modes as primary product surface

The ranked ladder and engine protocol / first-party engine track are core to
the public vision, but they should ship deliberately behind integrity,
calibration, and quality gates.

## Package Ownership

- `packages/game`: pure game types, variants, rules, visibility, tests.
- `apps/server`: WebSocket rooms, sessions, clocks, event append.
- `apps/web`: board UI, game screens, client WebSocket handling.
- engine code (KLUSS, PCFR+, GT-CFR, PEnumerator, Stockfish wrapping, Tier-1 snapshots, the live-play worker scripts) lives in the **private `mistboard-engine` sibling repo**, cloned at build time via a Railway deploy key. The public Mistboard server talks to it only through the redacted `EngineTurnRequest` / `EngineTurnResponse` protocol (see `packages/game/src/engine-protocol.ts` and `apps/server/src/engine-paths.ts`). Do not reach for engine internals from `apps/` or `packages/`.

## References

- Fog of War rule notes: `docs/fog-of-war/rulesets.md`
- Fog of War edge-case risks: `docs/fog-of-war/rules-edge-cases.md`
- Fog of War research questions: `docs/fog-of-war/research-questions.md`
- Project policy: `docs/repository-policy.md`
