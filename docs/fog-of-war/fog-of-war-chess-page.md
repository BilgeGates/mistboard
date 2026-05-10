# Initial Fog of War Article Drafts

Draft status: content plan and first-pass copy for Mistboard's first two
evergreen public pages.

## Initial Article Set

1. `/fog-of-war-chess` - a player-facing guide to Fog of War chess rules,
   visibility, history, and replay.
2. `/fog-of-war-engine-play` - a technical guide to engine play under hidden
   information, framed around input boundaries, belief, evaluation, and fair
   benchmarking.

These should be stable reference pages, not dated launch posts. They can be
linked from a future `/articles` index, but their URLs should remain canonical.

## Page 1: Fog Of War Chess

Suggested route: `/fog-of-war-chess`

### Page Goal

Create one durable page that answers the core user question: what is Fog of War
chess, how does it work, and why does Mistboard treat hidden information as a
rules and replay problem instead of a visual overlay.

The page should be useful even if the reader never plays on Mistboard.

### Audience

- Chess players who have heard of Fog of War chess and want the rules.
- Variant players comparing Fog of War with Dark Chess, Kriegspiel, and standard chess.
- New Mistboard users who need to understand why hidden information changes play.
- Contributors who need a public-facing explanation of the rules contract.

### Search And Sharing Metadata

Title:

> Fog of War Chess: Rules, Visibility, History, and How to Play

Meta description:

> Fog of War chess is a hidden-information chess variant where players see only
> their own pieces and reachable squares. Learn the rules, visibility model,
> king-capture ending, history, and how Mistboard handles replay.

Open Graph title:

> Fog of War Chess

Open Graph description:

> A timeless guide to Fog of War chess: rules, visibility, king capture, history,
> strategy basics, and Mistboard's server-enforced hidden-information model.

Canonical route:

> `https://mistboard.com/fog-of-war-chess`

### Recommended Structure

1. Hero / summary
2. What is Fog of War chess?
3. How visibility works
4. Rules that differ from standard chess
5. Strategy basics
6. History and related variants
7. How Mistboard handles hidden information
8. FAQ
9. References / further reading

### Source Notes

- Chess.com describes Fog of War as a variant originally proposed by Jens Bæk
  Nielsen and Torben Osted in 1989 under the name Dark Chess, with visibility
  limited to squares where a player's pieces can legally move.
- Chess.com's help center describes the two core rule differences as limited
  visibility and king capture instead of checkmate, and notes castling and en
  passant behavior for its implementation.
- PyChess gives the same broad origin and rule summary.
- Dark Chess / Fog of War is related to Kriegspiel, an older imperfect-information
  chess variant from 1899 where players need an umpire because each side cannot
  see the opponent's pieces.
- "Fog of war" is a broader military and wargame term for uncertainty about the
  opponent's position, capability, and intent. The exact phrase has a complicated
  history; for this page, it is enough to say the chess variant borrows the
  familiar game-design meaning of hidden or uncertain battlefield information.

Public sources to cite from the implemented page:

- Chess.com Fog of War terms page:
  https://www.chess.com/terms/fog-of-war-chess
- Chess.com Fog of War help page:
  https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess
- PyChess Fog of War variant page:
  https://www.pychess.org/variants/fogofwar
- Dark Chess overview:
  https://en.wikipedia.org/wiki/Dark_chess
- Kriegspiel overview:
  https://en.wikipedia.org/wiki/Kriegspiel_%28chess%29

### Draft Copy

# Fog of War Chess

Fog of War chess is chess with hidden information. You still move rooks, bishops,
queens, knights, pawns, and kings on the same 8x8 board, but you do not see the
whole position. You see your own pieces and the squares your pieces can reach.
Everything else is covered by fog.

That one change makes the game feel different from standard chess. You are not
only calculating tactics. You are scouting, inferring, hiding threats, protecting
your king from pieces you may not see, and deciding when a risky capture is worth
the information it reveals.

Mistboard is built around this idea: hidden information should be enforced by
the server, preserved during live play, and explained after the game through
replay and reveal.

## What Is Fog of War Chess?

Fog of War chess, also known as Dark Chess, is an imperfect-information chess
variant. Each player has a different view of the same true board.

In standard chess, both players know the full position at all times. In Fog of
War chess, your view is local:

- You can see your own pieces.
- You can see squares your pieces can legally move to.
- You can see opponent pieces only when they occupy squares you can see.
- You cannot see hidden opponent pieces or whether most hidden squares are empty.

The result is still recognizably chess, but the decisions change. A move can be
good because it wins material, because it discovers information, because it hides
your king, or because it makes the opponent guess.

## How Visibility Works

Visibility is based on your pieces and their legal destinations from the true
position. If one of your pieces could move to a square, that square is visible to
you. If an opponent piece is on a visible square, you see it. If a square is not
visible, you do not know whether it is empty or occupied.

Pawns are the easiest place to misunderstand this. A pawn sees forward movement
and legal captures differently:

- Empty forward pawn moves can become visible because the pawn can move there.
- Empty diagonal pawn attack squares stay hidden.
- A diagonal enemy piece is visible when the pawn can capture it.
- A piece directly in front of a pawn may remain hidden if no other piece sees it.

This matters because Fog of War is not just a darker board theme. Hidden
occupancy is part of the game. If the interface shows too much, the variant
breaks.

## Rules That Differ From Standard Chess

Most piece movement is familiar, but the end condition is different.

There is no check or checkmate in Mistboard Fog of War. A king may move into,
through, or remain on an attacked square. The game ends when a king is captured.

That changes several familiar habits:

- You are not warned that your king is in check.
- You can accidentally leave your king capturable.
- A winning attack may be invisible until the final capture.
- Castling is allowed through, into, or out of attacked squares when the normal
  occupancy and castling-rights requirements are met.
- En passant is legal, with special visibility for the capturing player.
- Promotion works normally, but the opponent sees the promoted piece only if they
  can see the promotion square.

Mistboard also keeps automatic draw rules: the 50-move rule and threefold
repetition are enforced as draws unless the same move captures a king.

## Strategy Basics

Fog of War chess rewards a different mix of habits than standard chess.

Protect the king before you feel danger. In standard chess, check gives you a
warning. In Fog of War, the warning may never come.

Use pieces as scouts. Knights, bishops, rooks, and queens do not only attack;
they reveal lanes, targets, and empty space.

Do not overtrust missing information. A hidden square is not an empty square. It
is an unanswered question.

Value forcing captures differently. Captures can win material, but they can also
reveal where a defender is, where a line is blocked, or whether an attack is
safe.

Expect strange-looking moves. In Fog of War, a move that looks quiet on a full
board might be a scouting move, a trap, or a way to deny the opponent vision.

## History And Related Variants

Fog of War chess is commonly traced to Dark Chess, a variant proposed by Jens
Bæk Nielsen and Torben Osted in 1989. Modern sites often use "Fog of War" for
the same family of rules because the board behaves like a strategy-game map:
known squares are visible, unknown squares are covered.

The idea belongs to a larger family of imperfect-information chess variants.
Kriegspiel, invented in 1899, is the older reference point: each player sees
their own pieces but not the opponent's, and an umpire or computer manages the
hidden truth.

Fog of War chess is more directly visual than Kriegspiel. Instead of repeatedly
asking an umpire whether a move is legal, the player sees a limited board and
makes a move from that partial view. Online play makes the variant practical
because the server can maintain the full position while showing each player only
what they are allowed to know.

Different platforms may make different rules choices around castling, en
passant, pawn visibility, check, and reveal. Treat the ruleset as part of the
game, not an incidental display detail.

## How Mistboard Handles Hidden Information

Mistboard's core rule is that the server owns the full board. Live players do
not receive the full position with a fog overlay on top. They receive a
player-specific view.

That distinction matters. If a browser receives hidden pieces and merely covers
them with CSS, the hidden information is not really hidden. A curious player,
browser extension, or bug could inspect the state. Mistboard instead treats
hidden information as a payload boundary: the client only gets the position it
is allowed to render.

After the game ends, replay can explain what happened. The full truth can be
revealed at terminal state, while earlier replay positions can still preserve
what each player knew at the time. The goal is not only to play Fog of War, but
to understand it after the fog lifts.

## FAQ

### Is Fog of War chess the same as Dark Chess?

They are closely related names for the same family of hidden-information chess
variants. Some sites use "Dark Chess"; Chess.com popularized "Fog of War" for
its variant implementation.

### Is there checkmate in Fog of War chess?

Not in Mistboard's ruleset. Check and checkmate are removed. The game is won by
capturing the opponent's king.

### Can I move my king into check?

Yes. In Mistboard Fog of War, kings may move into attacked squares because check
constraints do not exist. If the opponent can capture your king on a later move,
the game ends.

### Can hidden pieces block movement?

Yes. The server knows the true board. If a hidden piece blocks a rook, bishop,
queen, king, or pawn move, that movement is blocked even if you cannot see the
blocker.

### Does Fog of War chess require a server?

For online play, it effectively requires a trusted server or engine that owns
the full board and sends each player only their legal view. Over the board, the
variant needs separate boards or an arbiter-like setup, similar in spirit to
other imperfect-information chess variants.

### Why not just hide pieces visually?

Because hidden information must not be sent to the player during live play. A
visual overlay can make the board look fogged, but it does not enforce privacy if
the full position is still available in the browser.

## References

- Chess.com, "Fog Of War Chess":
  https://www.chess.com/terms/fog-of-war-chess
- Chess.com Help Center, "What is Fog Of War chess?":
  https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess
- PyChess, "Fog of War":
  https://www.pychess.org/variants/fogofwar
- Dark Chess overview:
  https://en.wikipedia.org/wiki/Dark_chess
- Kriegspiel overview:
  https://en.wikipedia.org/wiki/Kriegspiel_%28chess%29

### Implementation Notes

- Add the page as a stable route, not a dated article.
- Link to it from the homepage, `/learn`, and any future `/articles` index.
- Link rule-specific claims to `docs/rules.md` or a generated public rules page
  once the site has one.
- Include at least one real board diagram or replay embed before publication.
- Keep platform-comparison language neutral: explain Mistboard's rules without
  implying every Fog of War implementation is identical.

## Page 2: Fog Of War Engine Play

Suggested route: `/fog-of-war-engine-play`

### Page Goal

Create a durable technical explainer for engine authors, researchers, and
curious players: how should a chess engine play fairly when it is not allowed to
see the full board?

The page should define the information boundary and evaluation problem. It
should not describe Mistboard's current engine as if that engine is the final
answer.

### Audience

- Engine authors who want to build Fog of War bots.
- Researchers interested in imperfect-information chess.
- Contributors working on Mistboard engine, replay, or benchmark code.
- Players who want to understand why Fog engine play is different from Stockfish-style analysis.

### Search And Sharing Metadata

Title:

> Fog of War Chess Engine Play: Rules, Information, and Evaluation

Meta description:

> Fog of War chess engines cannot see the full board. Learn the information
> boundary, PlayerView contract, belief-state problem, evaluation differences,
> and fair benchmark rules for hidden-information engine play.

Open Graph title:

> Fog of War Chess Engine Play

Open Graph description:

> A technical guide to building and evaluating Fog of War chess engines without
> giving them hidden board truth.

Canonical route:

> `https://mistboard.com/fog-of-war-engine-play`

### Recommended Structure

1. Hero / summary
2. Why Fog engine play is different
3. The information boundary
4. PlayerView as the contract
5. Legal moves and intended inference
6. Belief, not certainty
7. Evaluation under uncertainty
8. Fair engine matches and benchmarks
9. Replay, audit, and full-truth records
10. Common failure modes
11. Reference interface
12. References / further reading

### Source Notes

- Mistboard's public engine invariant is already documented in
  `docs/fog-of-war/engine-roadmap.md`: a Fog of War engine must consume only the
  same legal `PlayerView` available to the side it plays.
- Mistboard's rules docs define live player views, hidden-information payload
  boundaries, pseudo-legal move generation, king capture, and postgame reveal.
- The belief-particle and architecture docs can provide internal technical
  vocabulary, but the public page should stay general and avoid temporary engine
  version claims.
- Useful external context can come from imperfect-information games, Kriegspiel,
  and hidden-information AI research, but the first draft can stand mostly on
  Mistboard's own rules and architecture.

### Draft Copy

# Fog of War Chess Engine Play

Standard chess engines analyze a known board. Fog of War chess engines do not
get that luxury. They must choose moves from a partial view: their own pieces,
visible squares, visible opponent pieces, legal moves, clocks, and the history
of what they have observed.

That makes Fog of War engine play a different problem from ordinary chess
analysis. The engine is not only asking, "What is the best move in this
position?" It is also asking, "What positions could this be, what does my
opponent probably know, and which move works across uncertainty?"

Mistboard's engine rule is simple: an engine may play from the same kind of view
a human player receives. Full board truth can exist for the server, replay, and
audit, but it must not become live decision input.

## Why Fog Engine Play Is Different

Perfect-information chess engines evaluate one position. Fog engines evaluate an
information state.

In normal chess, if a queen is on d5, both sides know it. In Fog of War chess,
one side may see the queen, the other may not, and a third perspective - the
server's full truth - exists only to enforce the game.

This changes the engine's job:

- It must act without knowing the whole board.
- It must preserve multiple possible hidden positions.
- It must value scouting and information denial.
- It must protect its king without expecting check warnings.
- It must avoid using hidden truth during live play.

The last point is the most important. A Fog engine that sees the full board is
not a stronger Fog engine. It is playing a different game.

## The Information Boundary

A fair Fog engine should receive only information available to its side.

That usually includes:

- its color;
- its own visible board;
- visible opponent pieces;
- legal moves supplied by the server;
- clock state and public game metadata;
- its own observation history.

It should not receive:

- hidden opponent pieces;
- full-board FEN during live play;
- opponent private views;
- debug traces that expose hidden truth;
- rejected-move errors that reveal more than the rules allow;
- benchmark labels or annotations unavailable during the game.

Mistboard treats this as a payload boundary, not only a convention. The engine
input should be shaped like the player's view, not like a full board with a
promise to ignore some squares.

## PlayerView As The Contract

`PlayerView` is the central idea. It is the position as one side is allowed to
know it.

A `PlayerView` can include visible pieces, visible squares, legal moves, status,
clocks, and public metadata. It should not include hidden truth.

That contract gives humans, engines, replay tools, and tests a shared language:

- Humans see a player view on the board.
- Engines choose moves from a player view.
- Tests assert that player views omit hidden information.
- Replay can compare player views with full truth after the game.

This is what makes Fog of War chess implementable as a serious online game. The
rules are not merely visual. They define who may possess which information at
which time.

## Legal Moves And Intended Inference

Legal moves are subtle in Fog of War chess. The server may generate legal moves
from the true board, because the true board determines what is actually possible.
That can reveal limited information.

For example, if a sliding piece has fewer legal destinations than expected, the
player may infer that something blocks the line. If a pawn cannot move forward,
the player may infer that the forward square is occupied, even if the blocker is
not directly visible.

Those inferences are part of the rules when they come from the intended legal
move payload. They are different from accidental leaks. Timing differences,
debug logs, rejected probe moves, or full-board traces should not become extra
ways to inspect hidden squares.

## Belief, Not Certainty

A Fog engine needs a belief state: a set of possible worlds consistent with what
it has seen.

The belief state may track:

- possible hidden piece locations;
- likely captures and disappearances;
- possible king locations;
- castling and en-passant facts;
- observation history;
- confidence over candidate positions.

Good belief tracking is not the same as guessing one board and playing normal
chess. The engine should understand that several positions may remain possible,
and a move can be good because it performs well across many of them.

## Evaluation Under Uncertainty

A normal chess evaluator asks how good one board is. A Fog evaluator asks how
good a move is across uncertainty.

Useful signals include:

- visible material;
- likely hidden material;
- king-capture risk;
- scouting value;
- information denial;
- capture safety;
- robustness across possible worlds;
- whether a move exposes or hides the engine's own king.

This creates moves that can look strange in a full-truth replay. A move may be
reasonable because it reduced uncertainty, covered a hidden king-capture threat,
or avoided a line that was dangerous in several plausible worlds.

## Fair Engine Matches And Benchmarks

Fog engine benchmarks need stricter reporting than ordinary chess engine games.
It is not enough to say which bot won.

A useful benchmark should identify:

- the ruleset;
- the engine versions;
- the input contract;
- the time control;
- seeds and starting positions where relevant;
- corpus or game selection;
- whether engines received identical information boundaries;
- which data was available only after the game for audit.

Claims about strength should be reproducible or at least inspectable. If one
engine received hidden board truth, private labels, or richer debug state, the
result does not measure fair Fog of War play.

## Replay, Audit, And Full-Truth Records

The server needs full truth to run the game. Researchers may need full truth
after the game to audit results. The important line is live decision-making.

Full-truth records are valid for:

- postgame reveal;
- replay analysis;
- benchmark audits;
- bug reproduction;
- training labels, when clearly separated from live input.

They are not valid as live engine input.

This distinction lets a system be both fair during the game and explainable
afterward. During play, the engine lives in fog. After play, the audit trail can
show what really happened.

## Common Failure Modes

Fog engine systems often fail by leaking truth accidentally.

Common problems include:

- passing full-board FEN to the engine;
- using standard check legality where the rules require king capture;
- treating visible material as total material;
- letting debug panels or logs expose hidden pieces;
- using rejected move attempts as hidden-square probes;
- comparing engines that received different input shapes;
- training on full truth and then evaluating as if the policy used only player
  view;
- forgetting that legal-move availability can carry intended inference.

These are not cosmetic issues. They change the game being measured.

## Reference Interface

A minimal Fog engine input can be described without committing to one programming
language:

```ts
type FogEngineInput = {
  color: 'white' | 'black';
  playerView: PlayerView;
  legalMoves: Move[];
  clock?: ClockState;
  observationHistory?: Observation[];
};
```

The exact field names can vary. The principle should not: live engine input must
be reconstructable from the side's allowed information.

## References

- Mistboard Fog of War rules:
  `docs/rules.md`
- Mistboard Fog of War rulesets:
  `docs/fog-of-war/rulesets.md`
- Mistboard Fog of War engine notes:
  `docs/fog-of-war/engine-roadmap.md`
- Mistboard belief particle engine notes:
  `docs/fog-of-war/belief-particle-engine.md`
- Mistboard replay/review model:
  `docs/replay-review-product-model.md`

### Implementation Notes

- Add the page as a stable route, not a dated engine update.
- Link it from the first Fog of War chess page, future engine reports, and any
  public benchmark pages.
- Avoid naming temporary engine versions in the main copy.
- Use current engine work only as examples if the examples can stay true after
  the implementation changes.
- Include a simple diagram showing server truth, player view, engine input, and
  postgame audit truth.
