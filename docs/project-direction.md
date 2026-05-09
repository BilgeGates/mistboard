# Project Direction

Bichess is an open-source Fog of War chess project.

The project goal is narrow:

> Help people play, finish, review, and understand Fog of War chess from a link.

This document defines the public product, licensing, branding, and reference
boundaries for contributors.

## Product Focus

Bichess is not a general chess platform.

The primary work is:

- server-authoritative hidden information
- link-based Fog of War games
- clear player views
- postgame reveal and replay
- Fog-specific learning and review tools
- engine and research work for hidden-information play

Other chess features are useful only when they strengthen the Fog of War
experience.

## License And Source

The project is licensed as GPL-3.0-or-later.

GPL-compatible chess libraries and engines may be used when they fit the
project. Third-party licenses and notices should remain clear.

Do not add code, assets, data, or dependencies with unclear rights. Do not add
AGPL components or copy code from AGPL projects unless the maintainer has
explicitly accepted the license and architecture impact.

Open source does not transfer control of the official hosted service, domains,
trademarks, package publishing, roadmap, production infrastructure, events, or
sponsorships. Those remain controlled project assets.

## Brand And Identity

The current repository name, official domains, logos, and hosted service
identity are controlled project assets.

Forks are allowed under the GPL, but forks must use distinct branding and must
not imply that they are the official service.

The repository may keep its current working name during development. For any
broader public launch, commercial launch, paid event, or major user-acquisition
effort, the hosted service will use a distinct public brand that avoids
confusing similarity with other chess services.

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

The v1 product is link-based Fog of War play and review.

Usually deferred until the Fog product is stable:

- ratings
- public matchmaking
- tournaments
- chat
- broad social profiles
- billing
- non-Fog variants as primary product surfaces

These features are not permanently forbidden. They should be added only when
they serve the Fog of War product and when the project is ready for the trust,
integrity, moderation, and support obligations they create.

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

1. Does this improve Fog of War play, review, learning, research, or integrity?
2. Is the implementation original or clearly license-compatible?
3. Does it avoid confusing affiliation with another chess platform?
4. Does it avoid adding social, rating, matchmaking, billing, or moderation
   obligations before the project is ready?

If the answer is uncertain, open an issue or discussion before implementing.
