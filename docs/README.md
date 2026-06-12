# Documentation Map

This directory holds public, contributor-safe documentation for Mistboard. Keep
private tactics, provider-specific runbooks, credentials, and unpublished
planning details out of public docs. See
[documentation-policy.md](documentation-policy.md) before adding or moving
documents.

## Start Here

| Document | Use it for |
|---|---|
| [../README.md](../README.md) | Product overview, quick start, and top-level links. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor scope, local development, tests, and pull request expectations. |
| [STATUS.md](STATUS.md) | Current project state, active work, open gates, and risk. |
| [ROADMAP.md](ROADMAP.md) | Milestones, launch gates, and deferred work. |
| [project-direction.md](project-direction.md) | Product focus, licensing posture, brand boundaries, and contribution fit. |

## Product And Rules

| Document | Use it for |
|---|---|
| [rules.md](rules.md) | Current dark chess / Fog of War rules baseline. |
| [fog-of-war/INDEX.md](fog-of-war/INDEX.md) | Index of Fog of War rules, variants, research, engine, and learning notes. |
| [replay-review-product-model.md](replay-review-product-model.md) | Replay and review product model. |
| [identity-and-profiles.md](identity-and-profiles.md) | Account, profile, and identity model. |
| [watch-track.md](watch-track.md) | Public watch and game-viewing surfaces. |

## Architecture And Implementation

| Document | Use it for |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Server/client/package layout, state model, and hidden-information boundary. |
| [persistence.md](persistence.md) | Event log, game aggregates, Postgres setup, and restart behavior. |
| [engine-protocol.md](engine-protocol.md) | Redacted engine request/response contract. |
| [specs/incremental-snapshot-protocol.md](specs/incremental-snapshot-protocol.md) | Snapshot delta protocol design and measurements. |
| [server-restart-pause-resume.md](server-restart-pause-resume.md) | Graceful restart, pause/resume, and reconnect behavior. |
| [qa-checklist.md](qa-checklist.md) | Manual QA checklist for gameplay and launch gates. |

## Policy And Operations Boundaries

| Document | Use it for |
|---|---|
| [documentation-policy.md](documentation-policy.md) | Public/private documentation rules. |
| [repository-policy.md](repository-policy.md) | Repository hygiene and publication boundaries. |
| [legal-and-fiscal.md](legal-and-fiscal.md) | Legal, fiscal, and sponsorship boundaries. |
| [community-and-publishing.md](community-and-publishing.md) | Public communication and publishing guidance. |
| [product-stage-definition.md](product-stage-definition.md) | What current product stages mean. |

## Evidence And History

| Document | Use it for |
|---|---|
| [gate-evidence/README.md](gate-evidence/README.md) | Public-safe launch gate evidence entries. |
| [incidents/INDEX.md](incidents/INDEX.md) | Incident records and operational learnings. |
| [learnings/INDEX.md](learnings/INDEX.md) | Transferable engineering lessons. |
| [build-log/README.md](build-log/README.md) | Historical build-log entries. |

## Maintenance Notes

- Prefer updating an existing doc over starting a parallel roadmap or status
  file.
- Keep exact provider setup, tokens, private runbooks, and internal strategy out
  of public docs.
- When code behavior changes, update the closest public contract doc in the
  same pull request.
