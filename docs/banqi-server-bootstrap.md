# Banqi server-side — session bootstrap

**START HERE if you're implementing Banqi (Chinese Dark Chess) on the platform.**
This is the build plan + integration map. The *rules* are locked separately; this
doc is the *how/where to wire it in*.

## 0. Read first (the lock)

1. **Canonical ruleset (source of truth, do not re-derive):**
   `docs-private/fog-of-war/library/variants/banqi.md` — board, pieces, capture
   ladder, cannon, win/draw, and the **§7 canonical constants** the server kernel
   MUST match the engine on. Locked 2026-06-14 (Taiwanese Banqi + TCGA draw rules).
2. **Engine = golden reference for move-gen.** The Python/Rust engine at
   `~/projects/mistboard-engine` (`src/fow_chess/banqi/board.py`,
   `banqi_rust/src/lib.rs`) is the authoritative move generator. The TS kernel must
   produce the same legal moves / terminal verdicts (golden parity, the way
   mini-xiangqi parity-tests against its engine). Engine reconciliation + two pending
   rule deltas: `mistboard-engine/docs-private/engine/banqi-ruleset-reconciliation-2026-06-14.md`.

## 1. The one thing that makes Banqi the SIMPLEST variant: symmetric information

Every other variant on the platform (chess FoW, dark-mini-xiangqi fog, jieqi
capturer-only-reveal) has **per-seat hidden information** → per-player view masking,
event redaction, spectator-empty-view, per-seat golden-wire payloads.

**Banqi has none of that.** Both players (and spectators) see the **identical masked
board** — face-down squares look the same to everyone; revealed pieces are public.
The *only* hidden state is **the deal** (which face-down square holds which piece),
hidden from **both** players equally and held server-side, revealed incrementally as
flips resolve. Captures only ever remove already-revealed pieces, so there's no
hidden-on-capture wrinkle either.

**Consequences — do NOT copy DMX's fog redaction wholesale:**
- **Client view = the masked board, the same for both seats and spectators.** The
  tenant's `view` / event-redaction functions are **passthrough** (no per-seat
  masking, no `lastMove` stripping, no empty spectator view).
- The **only** redaction boundary is the **engine request**: strip the deal + room
  seed + opponent clock; the engine sees the masked board + public bag + clock and
  samples the bag in search (it never sees the deal). This mirrors how the engine
  already works in `mistboard-engine` (`protocol_adapter.py`).
- So the Banqi **tenant is much thinner** than `dark-mini-xiangqi-tenant.ts` — same
  scaffold, trivial redaction.

> Banqi is **8 files × 4 ranks = 32 squares** (NOT 8×8), 16 pieces/side, all
> face-down at start. Square index = `file + (rank-1)*8`, a1=0 … h4=31. (An earlier
> scouting pass mis-described it as 8×8 fog — it is not.)

## 2. Template = dark-mini-xiangqi (DMX). Mirror it, thin the redaction.

DMX is the verified, end-to-end dark-variant template. For each layer, **read the
DMX file, copy its shape, swap in Banqi rules, and collapse the per-seat redaction
to passthrough** per §1.

### Game kernel (`packages/game/`)
- **Create `variants-banqi.ts`** ← mirror `variants-mini-xiangqi.ts`. Export: state +
  move + view types, `createInitialBanqiState`, `getBanqiLegalMoves[From]`,
  `isBanqiLegalMove`, `applyBanqiMove` (resolves a flip by revealing from the deal),
  the `BanqiGameEndReason` union (`stalemate` / `no-progress` / `repetition`), and
  `oppositeBanqiColor`. Because info is symmetric, `getBanqiPlayerView` is
  effectively identity over the masked board (still export it for interface parity).
  Implement the **§7 constants**: 40-ply no-progress clock (reset on capture **or**
  flip), threefold-repetition draw (`positionKey` = board+side-to-move, counted since
  last capture/flip), win = no-legal-move.
- **Create `variants-banqi.test.ts`** ← mirror `variants-mini-xiangqi.test.ts`:
  setup, per-piece legal moves, cannon screen-capture, flip/reveal, the two draw
  rules, terminal detection. Add a **parity fixture** vs the engine if feasible.
- **Register the spec** in `game-specs.ts` (a `GameSpec` entry; `visibility: 'dark'`,
  the 8×4 board, Banqi movement/objective ids) and export from `index.ts`. Decide the
  spec id (see §5 open decisions).

### Engine protocol / redaction (`apps/server/src/engine-protocol/`)
- **Create `build-banqi.ts` (+ `.test.ts`)** ← mirror `build-mini-xiangqi.ts`. Map
  Banqi roles → piece letters (G/A/E/R/H/C/S per the engine's `_ROLE_TO_LETTER`),
  8×4 square indexing, and emit the redacted `EngineTurnRequest` (masked board + bag
  + clock). `build.ts` is the generic builder; `visibility-parity.test.ts` is the
  parity harness. **Redaction test must assert the engine never receives the deal,
  the room seed, or the opponent clock** (the board itself is public, so unlike DMX
  there's no "hide opponent pieces" assertion).

### Server runtime (`apps/server/src/`) — mirror the DMX file set, thinned
Create the Banqi analogues of (all exist for DMX as `*-dark-mini-xiangqi-*`):
`banqi-tenant.ts`, `banqi-runtime.ts`, `banqi-registration.ts`,
`server-banqi-{engine,events,lifecycle,rematch,room-factory,seat-session}.ts`,
`server-ws-banqi.ts`, `routes/banqi-{rooms,games}.ts`, `banqi-export.ts`,
`banqi-golden-wire.test.ts` (+ a `fixtures/banqi-wire-golden.json`). Then **add the
side-effect import to `variant-tenant/register-tenants.ts`**. The generic
`variant-tenant/` infra (tenant/runtime/registry/lifecycle/rematch/room-factory/ws)
is game-agnostic — you only supply the Banqi rules + the (trivial) redaction.
- The PvE engine loop (`server-banqi-engine.ts`) builds the request via
  `build-banqi.ts`, calls the engine worker over HTTP, applies the returned move.
- **Migrations:** add the Banqi rating-bucket + publish SQL (mirror
  `migrations/038_allow_dark_mini_xiangqi_rating_bucket.sql` and
  `039_publish_dark_mini_xiangqi_pve.sql`).

### Engine registry (`apps/server/src/engines/registry.ts`)
- Add a `python-banqi-v1.0` entry tagged `gameSpecId: <banqi spec id>`, pointing at a
  `mistboard-engine` pin. (NOTE: this file is currently dirty with local A/B gadget
  entries — leave those; add the Banqi entry alongside.) The worker routes by
  `gameSpecId`; no pool-machinery change needed.

### Web (`apps/web/src/`)
- Feature flag (`banqiEnabled`), web variant-tenant registry entry (landing
  capabilities: red/black, time presets, optional PvE engine), the rules article
  `articles/content/banqi.ts`, postgame mount, and a live renderer — mirror
  `dark-mini-xiangqi-postgame.ts` / `live-mini-xiangqi-render.ts`. The picker
  (`landing-play.ts`) wires up automatically once the tenant is registered + flagged.
  **User-facing copy: no em dashes** (repo convention).

## 3. Build order (each step independently testable)

1. **Kernel + kernel tests** (`variants-banqi.ts` + test) — pure rules, no server.
   Parity-check legal moves vs the engine on a few positions. ← do this first.
2. **game-specs registration** + `index.ts` export.
3. **Engine-protocol builder + redaction tests** (`build-banqi.ts` + test).
4. **Server tenant + runtime + registration + routes** (thinned redaction) + golden-wire.
5. **Engine registry entry** + a smoke PvE game end-to-end.
6. **Web flag + tenant + article + renderer.**
7. **Migrations**, then flip the flag in dev.

## 4. Conventions / commands (from `CLAUDE.md`)

- Targeted while iterating: `npm run test:unit --workspace @mistboard/<game|server|web>`;
  `npm run typecheck`; `npm run lint` (Biome). `npm run test:persistent` for
  Postgres-backed server tests. Run the broad gate matching blast radius before handoff.
- Hidden-info regression rule still applies to the **engine boundary**: any change to
  the engine request/replay must keep the deal/seed out (add/keep a test).
- Don't push or commit unless asked; never `--no-verify`.

## 5. Open decisions for the implementing session

- **Spec id / naming:** `banqi` vs `dark-banqi`. Banqi is *inherently* dark, so the
  `dark-` prefix (used for DMX to distinguish from perfect-info mini-xiangqi) may be
  redundant — there is no "light Banqi." Recommend plain **`banqi`**. Confirm against
  the `dark-chess-naming.md` convention.
- **PvE at launch?** The engine is mid-build (rung-4 AlphaZero). v1 server can ship
  PvP-only and add the engine seat when a strong net exists (build-before-serve).
- **Rating pool / time presets** — mirror DMX unless there's a reason to differ.
- **Engine rule-delta coordination:** the engine's 40-ply clock + repetition-draw
  deltas are not yet applied. Land them in the engine **and** implement them here so
  server adjudication and engine search agree (§7 of the spec). Until both are done,
  pin the SAME values in both.

## Cross-refs

- Rules lock: `docs-private/fog-of-war/library/variants/banqi.md`
- Engine reconciliation: `mistboard-engine/docs-private/engine/banqi-ruleset-reconciliation-2026-06-14.md`
- Template suite: everything matching `*dark-mini-xiangqi*` / `variants-mini-xiangqi*`
- Generic tenant infra: `apps/server/src/variant-tenant/`

**Created:** 2026-06-14.
