# CLAUDE.md

Public agent guidance for Mistboard.

Mistboard is an open-source site for **Fog of War chess**. Keep public-facing work focused on implementation, correctness, and contributor experience.

## Product Rule

Before adding any feature, ask:

> Does this help two people play, finish, review, or understand Fog of War from a link?

If no, defer it. Draft960 is a pregame feature inside Fog of War, not a separate product surface.

## Architecture Rules

- Server owns canonical game state.
- Clients render `PlayerView`, never canonical truth.
- Fog of War must never send hidden pieces or hidden opponent moves to the wrong client.
- Event history should become the replay and reconnect source of truth.
- Keep v1 anonymous and link-based.

## Documentation Rules

- Public docs are for users and collaborators.
- Private strategy, outreach, funding, entity planning, and operational notes belong outside the public repo.
- Follow `docs/documentation-policy.md` before adding or expanding docs.

## Hard Deferrals

Do not build in v1:

- ratings
- public matchmaking
- tournaments
- chat
- moderation tooling
- OAuth
- billing
- engine analysis
- full lichess/lila fork
- standalone non-Fog game modes as primary product surface

## Package Ownership

- `packages/game`: pure game types, variants, rules, visibility, tests.
- `apps/server`: WebSocket rooms, sessions, clocks, event append.
- `apps/web`: board UI, game screens, client WebSocket handling.
- `research/python-fow-lab/`: offline Python sidecar for visibility/bot/inference experiments. Not part of the product.

## References

- Fog of War rule notes: `docs/fog-of-war/rulesets.md`
- Fog of War edge-case risks: `docs/fog-of-war/rules-edge-cases.md`
- Fog of War research questions: `docs/fog-of-war/research-questions.md`
- Project policy: `docs/repository-policy.md`
