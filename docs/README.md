# Documentation Map

Public, contributor-safe docs for Mistboard: architecture, rules, and
contribution boundaries. Kept small and slow-changing. Day-to-day status and
detailed planning are not tracked here (see [STATUS.md](STATUS.md)); read
[documentation-policy.md](documentation-policy.md) before adding or moving a doc.

## Start Here

| Document | Use it for |
|---|---|
| [../README.md](../README.md) | Product overview and quick start. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor scope, local dev, tests, and PRs. |
| [project-direction.md](project-direction.md) | Product focus, licensing, brand, and contribution fit. |

## Architecture

| Document | Use it for |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package layout, state model, and the hidden-information boundary. |
| [persistence.md](persistence.md) | Event log, game aggregates, and Postgres setup. |
| [engine-protocol.md](engine-protocol.md) | Redacted engine request/response contract. |
| [specs/incremental-snapshot-protocol.md](specs/incremental-snapshot-protocol.md) | Snapshot delta protocol and measurements. |

## Rules

| Document | Use it for |
|---|---|
| [rules.md](rules.md) | Fog of War chess and Draft960 baselines. |
| [fog-of-war/INDEX.md](fog-of-war/INDEX.md) | Fog of War rules reference files. |

Full player-facing rules for every live variant are at
[mistboard.com/rules](https://mistboard.com/rules).

## Policy

| Document | Use it for |
|---|---|
| [documentation-policy.md](documentation-policy.md) | Public vs private docs. |
| [repository-policy.md](repository-policy.md) | Repository hygiene and publication boundaries. |
| [STATUS.md](STATUS.md) / [ROADMAP.md](ROADMAP.md) | High-level pointers only; live state is the site plus GitHub issues. |

Keep this directory minimal and evergreen. Keep provider setup, tokens, and
internal strategy in the git-ignored `docs-private/`.
