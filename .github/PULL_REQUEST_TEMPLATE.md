<!-- Thanks for contributing to Mistboard. Keep PRs focused — a small bug fix with a regression test is better than a broad refactor plus product change. -->

## Summary

What does this change and why?

## Product-rule check

> Does this help two people play, finish, review, or understand Fog of War from a link?

If not, link the issue or discussion where direction was agreed.

## Hidden-information safety

If you touched any code that produces a WebSocket payload, an HTTP response, or a replay export:

- [ ] No code path can send hidden pieces or hidden opponent moves to the wrong client
- [ ] Pre-terminal `/api/games/:roomId/events` responses are still seat-scoped or rejected
- [ ] If you added or changed a `PlayerView` field, you added a test that proves forbidden payloads are absent

If this PR is purely a non-payload change (docs, build, CSS), say so and skip the checklist.

## Tests

- [ ] `npm test` passes
- [ ] If the change can fail in a way the in-memory harness can't catch (DB constraints, real Postgres behavior), `npm run test:persistent` passes locally

## Checklist

- [ ] Followed `docs/documentation-policy.md` for any public/private documentation changes
- [ ] No secrets, production URLs, or seat tokens in the diff
- [ ] No large generated corpora or local artifacts checked in
- [ ] DCO sign-off (`Signed-off-by: ...`) on nontrivial commits — see [`CONTRIBUTING.md`](../CONTRIBUTING.md)
