# Community And Publishing

Mistboard should build public knowledge and research surfaces before building a
native forum. Articles, rules explainers, and research notes help players,
contributors, engine authors, and search discovery without immediately creating
a full moderation platform.

## Product Posture

Near term:

- publish useful articles and explainers
- keep rules and edge cases easy to find
- publish engine/research notes when methods are ready
- make `/articles` the primary publishing route
- use existing external channels for contributor discussion
- defer native forums, comments, chat, and social feeds

Decision rule:

> Prefer durable public knowledge over interactive community features until the
> play, review, identity, and moderation obligations are better understood.

## Surface 1: Articles And SEO

Purpose:

- explain Fog of War chess
- help players find rules and examples
- make Mistboard discoverable for long-tail searches
- link public replays and examples
- support contributor onboarding

Primary route:

- `/articles`

Article categories:

- Learn
- Rules
- Replays
- Engines
- Research
- Updates

Good early article types:

- What is Fog of War chess?
- Fog of War chess rules
- How visibility works in Fog of War chess
- Why server-enforced Fog matters
- How perspective replay works
- Common Fog of War tactics and mistakes
- How to play a friend in Mistboard
- How to read a Fog replay

Publishing shape:

- `/articles` is the durable public index for posts, explainers, updates, engine
  notes, and research summaries
- `/articles/<slug>` should be the stable route for individual posts
- `/learn` remains the evergreen education hub, not the main publishing feed
- research content should start as an article category, not as the only publishing surface
- a dedicated `/research` landing page can come later if there is enough serious
  research material to justify it
- Lab may link to relevant articles and reports, but should not be the
  only home for research content
- static pages are enough at first
- articles should link to rules, replay examples, and relevant source docs
- avoid thin marketing content
- prefer factual, evergreen pages that answer real player questions

## Surface 2: Research And Engine Publications

Purpose:

- make Mistboard credible to engine authors and researchers
- make benchmark claims auditable
- create citeable project artifacts
- explain engine progress without requiring private context

Publication types:

- benchmark reports
- engine bake-off summaries
- corpus/manifest pages
- annotation methodology
- research notes
- reproducible experiment summaries
- engine version notes
- known limitations

Requirements:

- include enough metadata to understand the claim
- link to representative games, corpora, or manifests when public
- distinguish result, engine failure, and infrastructure failure
- avoid leaderboard-like claims until benchmark methodology is stable
- keep provider topology, private runbooks, and account-specific operations out
  of public writeups

## Surface 3: Community Discussion

Native forum, comments, chat, and social feeds are deferred.

Why:

- moderation burden
- spam prevention
- account requirements
- abuse/report workflows
- notification preferences
- privacy and content-policy obligations
- search/index quality problems

Near-term alternatives:

- GitHub issues for bugs and focused technical discussion
- GitHub discussions if contributor volume justifies it
- external chat only if there is clear moderation capacity
- public articles with no comments
- contact/report paths for security and rules issues

Future forum categories, if Mistboard later owns this surface:

- rules questions
- game help
- engine development
- research and corpora
- bug reports
- feature ideas
- events or tournaments, if those ever become active

## Stage Guidance

Stage 0: Public Preview

- publish clear Fog basics
- keep About/Learn useful
- keep the homepage action-first, with article links as supporting discovery
- ensure rules pages are discoverable
- link to public replays where they clarify concepts

Stage 1: Private Alpha

- publish private-alpha-safe known limitations when needed
- publish replay examples that explain what testers should expect
- keep community discussion off-platform unless moderation is ready

Stage 2: Public Alpha

- add an article index or learn hub
- publish public-alpha rules, safety, and replay explanations
- route bugs/security issues to appropriate existing channels
- keep native forums deferred unless there is explicit moderation capacity

Stage 3: Research / Engine Alpha

- publish benchmark reports
- publish corpora/manifests
- publish engine and annotation methodology
- make research notes citeable and linked from Lab surfaces

Stage 4: Early Platform

- revisit native forum/comments only if product usage and moderation capacity
  justify owning the discussion surface
- consider profile-linked publishing for engine authors and researchers

## SEO Principles

- write for real user questions first
- use stable URLs
- avoid duplicate thin pages
- link articles to playable/replayable examples
- keep rules pages canonical
- update content when rules or product behavior changes
- prefer diagrams, replay links, and concrete positions over vague claims

## Open Questions

- What belongs in `/learn` versus `/articles` once there is more content?
- When, if ever, is a dedicated `/research` landing page justified?
- Which public replays are best as evergreen examples?
- What external community channel, if any, is worth linking before native forums?
- What moderation capacity would be required before owning comments or forums?
