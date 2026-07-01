# Documentation Map

Public, contributor-safe docs for Mistboard: architecture and rules. Kept small
and evergreen. Day-to-day status and detailed planning aren't tracked here (live
state is the site plus
[GitHub issues](https://github.com/brianhliou/mistboard/issues)); keep provider
setup, tokens, and internal strategy in the git-ignored `docs-private/`.

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
| [specs/incremental-snapshot-protocol.md](specs/incremental-snapshot-protocol.md) | Snapshot delta protocol design. |

## Rules

| Document | Use it for |
|---|---|
| [rules.md](rules.md) | Fog of War chess and Draft960 baselines. |
| [fog-of-war/rulesets.md](fog-of-war/rulesets.md) | The Fog of War ruleset contract. |
| [fog-of-war/rules-edge-cases.md](fog-of-war/rules-edge-cases.md) | Edge-case regression targets. |
| [fog-of-war/dark-mini-xiangqi-rules.md](fog-of-war/dark-mini-xiangqi-rules.md) | Dark Mini Xiangqi rules. |

Full player-facing rules for every live variant are at
[mistboard.com/rules](https://mistboard.com/rules).
