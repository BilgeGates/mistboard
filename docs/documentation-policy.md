# Documentation Policy

Mistboard keeps public documentation useful to users, contributors, researchers, and sponsors.

The public repo should be collaborator-facing.

## Public Documentation

Good public docs:

- explain what Mistboard is
- define rules
- document architecture
- help contributors work safely
- describe governance and sponsorship boundaries
- publish benchmark methods and results
- disclose limitations honestly
- avoid private tactics

Examples:

- `README.md`
- `GOVERNANCE.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `TRADEMARK.md`
- `SPONSORSHIP.md`
- `docs/fog-of-war/rulesets.md`
- engine benchmark reports intended for publication

## Project Identity

Active public docs should use Mistboard as the project, repository, and hosted
service name.

Legacy names should appear only when they are necessary historical context, such
as archived build logs, migration notes, artifact paths, or redirect
documentation. Do not introduce legacy names in current roadmaps, policy docs,
examples, app copy, contributor instructions, or public positioning.

## Private Documentation

Keep these out of the public repo:

- internal strategy and operating plans
- private funding, legal, or entity planning
- private relationship, event, or partnership planning
- internal critiques or sensitive market analysis
- private handoff notes
- credentials, account details, private provider configuration, deploy runbooks, or operational secrets

Public docs may describe architecture and environment variables when contributors need that information to run or review the code. They may name providers as examples when explaining portable architecture, but should avoid account-specific production topology, private provider setup, deploy triggers, private networking, incident processes, hidden admin capabilities, and exact operational checklists.

Local private notes may live in `docs-private/`, which is ignored by git.

Do not link from public docs to specific private files. Public docs may mention the `docs-private/` folder as a local convention, but the private file inventory and private planning details should stay local.

## Documentation Workflow

Before committing documentation changes:

1. Decide whether the document is public explanation or private planning.
2. Put public explanation under `docs/` or a root policy file.
3. Put private planning under `docs-private/`.
4. Run a quick sensitive-language search before committing.
5. If a public doc needs to mention funding, sponsorship, or governance, keep it to policy boundaries and avoid tactical details.
6. If a public doc mentions deployment or operations, keep it to reproducible architecture and contributor needs.

Keep exact private review checklists in ignored private notes, not public docs.

## Review Rule

Before committing a document, ask:

> Would I be comfortable with a contributor, sponsor, streamer, competitor, or chess-platform employee reading this without additional context?

If no, move it to private notes or rewrite it into a public-safe version.
