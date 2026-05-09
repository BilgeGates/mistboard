# Contributing

Thanks for considering a contribution to Bichess.

Bichess is a focused Fog of War chess project. Before opening a pull request, check whether the change helps the product rule:

> Does this help two people play, finish, review, or understand Fog of War from a link?

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

Usually out of scope for v1:

- ratings
- public matchmaking
- chat
- moderation tooling
- OAuth
- billing
- non-Fog variants as primary product surfaces
- broad general chess-platform features

## Development

```bash
npm install
npm run build
npm test
```

For local Postgres-backed persistence:

```bash
docker compose up -d postgres
TEST_DATABASE_URL=postgres://bichess:bichess@localhost:5435/bichess npm test
```

## Pull Requests

Keep PRs focused. A small bug fix with a regression test is better than a broad refactor plus product change.

For hidden-information code, include tests that prove forbidden payloads are absent. In Bichess, a green UI is not enough; the server must not send hidden truth to the wrong client.

Before opening a PR:

- run the relevant tests
- update docs when behavior changes
- follow `docs/documentation-policy.md` for public vs private documentation
- avoid committing generated corpora, large tournament logs, or local artifacts unless they are explicitly part of a reviewed benchmark/release artifact
- do not include secrets, production URLs, API keys, or private credentials

## Contribution Rights

Bichess uses a Developer Certificate of Origin style contribution policy.

By contributing, you certify that you have the right to submit the contribution and that it may be distributed under the project's license, GPL-3.0-or-later.

For nontrivial commits, include a sign-off line:

```text
Signed-off-by: Your Name <you@example.com>
```

This project does not currently require a separate Contributor License Agreement. If that changes, it will be documented here before being required.

## Governance

See `GOVERNANCE.md`. Contributions are welcome, but Bichess remains founder-led. Merging a contribution does not grant commit access, release authority, financial control, or ownership of the official project identity.
