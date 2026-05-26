# Watch Track

This document defines the product path for `/watch` and related public presence
surfaces. The goal is to make Mistboard feel live and social without weakening
Fog of War's hidden-information boundary.

Mistboard should not copy a normal chess broadcast room too early. Live dark
chess is different: a true spectator view can leak one or both players'
information unless the server sends a deliberately neutral view.

## Product Goal

Make games feel less isolated from outside the room while preserving the rule
that live players receive only their own `PlayerView`.

The watch track should answer:

- What can a visitor safely see before a game is finished?
- What can a logged-in user safely say or do around live games?
- How does `/watch` point people into finished games, replay, learning, or play?
- Which social signals make the site feel alive without creating a moderation
  platform before Mistboard is ready?

## Non-Negotiable Boundaries

- Server-owned canonical `GameState` remains private during live play.
- Clients render `PlayerView`, not canonical truth.
- Live PvP room pages remain for seated players. Do not add a spectator sidebar
  or global chat module to room pages as a workaround.
- Live PvP spectators must not receive board truth, hidden pieces, hidden moves,
  or a move stream that lets them reconstruct private information.
- Finished games may expose replay and truth reveal according to the replay
  policy.
- Social features stay deferred until identity, rate limits, reporting,
  deletion, and moderation responsibilities are explicitly accepted.

## Surface Shape

### Homepage

The homepage should stay action-first: play, learn, review. It may show a small
proof-of-life module when there is enough public-safe data, but it should not
host the full global chat room.

Appropriate homepage signals:

- live/finished game counts
- a small link to `/watch`
- a compact "Live now" or "Recent games" module using public-safe metadata

Not appropriate for the homepage:

- full chat composer
- activity feed as a second homepage
- broad lobby dashboard

### Watch Page

`/watch` is the primary public presence surface.

Near-term `/watch` should stay narrow:

- one excellent default channel: Dark chess
- finished public games
- engine games where the observation boundary is intentionally public
- public-safe live game metadata, if available
- links into finished-game review and learning surfaces

It should not become a generic lobby with open challenges, broad activity feed,
or room-page spectator access by default.

The implementation should still be channel-native. A watch channel is a public
surface over one or more `GameSpec` ids, with Dark chess as the only production
channel until another hidden-information family is ready. Future channels such
as Dark Xiangqi, Dark Shogi, or Dark Go should plug into the same finished-replay
and public-safe-live-metadata contract instead of getting bespoke watch pages.

### Room Page

Room pages remain seated-player surfaces during live PvP. The watch track should
not add global chat to `/room/:id`, because doing so creates product pressure to
turn a protected live room into a social viewing surface.

## Global Chat Candidate

A global chat room can be reconsidered as part of the watch track, but it should
be attached to `/watch`, not the homepage or live room pages.

Candidate contract:

- publicly readable from `/watch`
- posting requires a logged-in account
- messages expire after 24 hours
- no images and no rich embeds at first
- links are either disabled or tightly constrained
- users can delete their own messages
- users can locally mute other users
- admins can delete messages and ban or restrict abusive accounts
- basic rate limits and report flow exist before launch

This is a support surface for watch/replay presence, not the main social object.
If there are not enough live or recent games to give chat context, defer chat
instead of shipping an empty standalone room.

## Staging

### W0: Current Safe Watch

- `/watch` centers finished games and replay.
- Live PvP room pages do not support real spectators.
- Social chat remains deferred.

### W1: Public-Safe Live Presence

- Add or improve public-safe live game metadata.
- Keep metadata independent from hidden board state and hidden move history.
- Use the homepage only for compact proof-of-life links into `/watch`.

### W2: Contextual Global Chat

- Add the global 24-hour chat only after account identity, rate limiting,
  reporting, deletion, and admin moderation paths are in place.
- Keep the full chat surface on `/watch`.
- Do not embed it in live PvP room pages.

### W3: Richer Watch, If Safe

- Revisit deliberately designed spectator modes only if there is a clear,
  tested information-boundary contract.
- Keep any future live observation mode separate from seated player authority
  and from canonical truth.

## Deferred

- live PvP board spectators
- per-room chat
- homepage chat
- open-challenge/activity-feed lobby
- tournament-style public watch rooms
- streamer/broadcast features
