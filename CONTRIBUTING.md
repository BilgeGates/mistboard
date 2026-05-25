# Contributing

Thanks for considering a contribution to Mistboard.

Mistboard is an open-source platform foundation for hidden-information games,
starting with dark chess. "Fog of War chess" is useful secondary wording for SEO
and rules explanation. Before opening a pull request, check whether the change
helps the product rule:

> Does this make Mistboard a more trustworthy, serious place to play, study,
> rank, or build engines for dark chess and future hidden-information
> games?

If the answer is no, open an issue or discussion first.

For project direction, licensing, branding, reference, roadmap, and monetization
boundaries, see [`docs/project-direction.md`](docs/project-direction.md).

## Scope

Good contributions:

- Fog of War rules correctness
- hidden-information safety
- `PlayerView` tests
- replay and postgame reveal improvements
- board interaction polish
- engine research tooling in `research/python-fow-lab`
- documentation for rules, protocols, tournaments, and engine integration

Usually out of scope for v1 unless explicitly gate-cleared:

- ungated ratings
- broad public matchmaking
- chat
- moderation tooling
- OAuth
- billing
- non-Fog variants as primary product surfaces
- broad general chess-platform features

## Development

```bash
npm install
npm run agent:scan        # live dirty-state, worktree, hotspot, and test map
npm run verify -- --changed
npm run check:drift       # public-doc links, SQL enum drift, fog payload guards
npm run ci:quick
npm run dev              # in-memory server, fastest for UI work
npm run dev:persistent   # Postgres-backed server (required for reconnect/replay testing)
npm test                 # unit and integration tests, in-memory
npm run test:persistent  # integration tests against local Postgres
```

For local Postgres:

```bash
npm run db:up      # start Docker Postgres on port 5435
npm run db:migrate # apply migrations
```

Good entry points for dark chess testing:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=dark-chess
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=dark-chess&dev=engine
```

For mobile/article layout iteration after the dev server is running:

```bash
npm run test:mobile:shots
```

For manual launch gates, write a public-safe evidence entry:

```bash
npm run gate:evidence -- --gate mobile-gameplay --result pass
```

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's currently being worked on.

## Pull Requests

Keep PRs focused. A small bug fix with a regression test is better than a broad refactor plus product change.

For hidden-information code, include tests that prove forbidden payloads are absent. In Mistboard, a green UI is not enough; the server must not send hidden truth to the wrong client.

Before opening a PR:

- run the relevant tests
- update docs when behavior changes
- follow `docs/documentation-policy.md` for public vs private documentation
- avoid committing generated corpora, large tournament logs, or local artifacts unless they are explicitly part of a reviewed benchmark/release artifact
- do not include secrets, production URLs, API keys, or private credentials

## Contribution Rights

Mistboard uses a Developer Certificate of Origin style contribution policy.

By contributing, you certify that you have the right to submit the contribution and that it may be distributed under the project's license, AGPL-3.0-or-later.

For nontrivial commits, include a sign-off line:

```text
Signed-off-by: Your Name <you@example.com>
```

This project does not currently require a separate Contributor License Agreement. If that changes, it will be documented here before being required.

## Governance

See `GOVERNANCE.md`. Contributions are welcome, but Mistboard remains founder-led. Merging a contribution does not grant commit access, release authority, financial control, or ownership of the official project identity.
