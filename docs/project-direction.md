# Project Direction

Mistboard is an open-source platform foundation for hidden-information games,
starting with dark chess.

Use **dark chess** as the primary public name. Use **Fog of War chess** as
secondary SEO and explainer language because many players know the mainstream
site branding first.

The project goal is focused:

> Build the trustworthy open-source place to play, study, rank, and build
> engines for hidden-information games, starting with dark chess.

This document defines the public product, licensing, branding, and reference
boundaries for contributors.

## Product Focus

Mistboard is not a general chess platform. It starts with dark chess
because it is the clearest hidden-information chess format and a strong first
test of the platform.

The primary work is:

- server-authoritative hidden information
- low-friction dark chess games
- clear player views
- postgame reveal and replay
- ranked ladder integrity and calibration
- dark-chess learning and review tools
- a public engine protocol, public baselines, and a serious first-party engine
  track for dark chess and related hidden-information games

Other chess features are useful only when they strengthen the Fog of War
experience.

The intended product loop is simple: people can play a serious first-party
dark-chess engine through a public information boundary, learn why hidden
information is compelling, and then climb a serious ranked ladder against other
players.

## License And Source

The project is licensed as AGPL-3.0-or-later.

AGPL-compatible chess libraries and engines may be used when they fit the
project, including GPL-3.0 libraries (which are explicitly AGPL-3.0-compatible).
Third-party licenses and notices should remain clear.

Do not add code, assets, data, or dependencies with unclear rights. Avoid
permissively-licensed dependencies (MIT, Apache-2.0, BSD) only where the
dependency would force a license incompatibility — most permissive licenses
are AGPL-compatible.

Open source does not transfer control of the official hosted service, domains,
trademarks, package publishing, roadmap, production infrastructure, events, or
sponsorships. Those remain controlled project assets.

## Brand And Identity

The Mistboard repository name, official domains, logos, and hosted service
identity are controlled project assets.

Forks are allowed under the GPL, but forks must use distinct branding and must
not imply that they are the official service.

Mistboard is the durable public brand for the hosted service and repository.
Public copy, package names, docs, and infrastructure should avoid legacy project
names except where needed for historical records or short-lived redirects.

## Reference Policy

Contributors may use:

- common chess interface conventions
- compatible open-source libraries
- public standards and protocols
- high-level product research
- original implementation and original copy

Contributors must not copy from other chess platforms:

- private or incompatible source code
- CSS, templates, icons, illustrations, screenshots, or page layouts
- product copy, documentation, lessons, puzzles, studies, or community content
- databases or user-generated content without clear permission
- names, branding, or presentation that implies affiliation

Studying mature products is allowed. Reproducing their protected expression or
confusing users about affiliation is not.

## Roadmap Boundaries

The v1 product is server-enforced dark chess play, review, engine challenge, and
a gated ranked ladder.

Usually deferred until the dark-chess product is stable:

- ungated ratings
- broad public matchmaking
- tournaments
- chat
- broad social profiles
- billing
- non-Fog variants as primary product surfaces

These features are not permanently forbidden. The ranked ladder and engine track
are part of the core vision, but they should be surfaced only when the project is
ready for the trust, integrity, calibration, moderation, and support obligations
they create.

## Monetization

The project may monetize the official hosted service and original project work.

Appropriate public funding surfaces may include:

- sponsorships
- supporter accounts
- hosted events
- managed rooms or tournaments
- infrastructure support
- research, benchmark, or engine-report work

Sponsors and paying users do not receive roadmap control, private data access,
benchmark control, event-result control, trademark ownership, or release
authority.

## Contributor Checklist

Before proposing a change, ask:

1. Does this improve dark chess play, review, learning, research, or integrity?
2. Is the implementation original or clearly license-compatible?
3. Does it avoid confusing affiliation with another chess platform?
4. Does it avoid adding social, rating, matchmaking, billing, or moderation
   obligations before the project is ready?

If the answer is uncertain, open an issue or discussion before implementing.
