/**
 * Web-side VariantTenant registry — the routing/config mirror of
 * apps/server/src/variant-tenant/registry.ts. Each tenant registers its page
 * routing (postgame route, optional self-contained live client), review-URL
 * base, watch-replay mount, and landing configuration, so main.ts /
 * live-room-bootstrap / landing / game-meta / watch-route dispatch without
 * per-variant branches. Chess is deliberately NOT registered: a registry miss
 * is the chess fallback until the P2 chess migration.
 *
 * Bundle discipline: this module is imported by the entry chunk, so it may
 * hold only config and dynamic-import closures. Static hooks for tenants that
 * ride the chess live shell live in ./live-shell.ts (imported only by the
 * live-room chunk).
 */

import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_CRAZYHOUSE_SPEC_ID,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DUAL_CHESS_SPEC_ID,
  type GameSpecId,
  JIEQI_SPEC_ID,
  KRIEGSPIEL_SPEC_ID,
  REVEAL_CHESS_SPEC_ID,
  type TimeControlId,
} from '@mistboard/game';
import {
  banqiEnabled,
  correspondenceEnabled,
  crossroadsChessEnabled,
  darkCrazyhouseEnabled,
  darkCrossroadsChessEnabled,
  darkMiniXiangqiEnabled,
  darkMiniXiangqiPublicEntryEnabled,
  darkShogiEnabled,
  darkXiangqiEnabled,
  jieqiEnabled,
  kriegspielEnabled,
  revealChessEnabled,
} from '../feature-flags.js';
import type { GameMeta, ReplayHandle } from '../replay.js';

export type WebTenantEngineOption = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

// Landing play-menu configuration. Mirrors the per-variant rows of the old
// LANDING_GAME_SPEC_CAPABILITIES table plus the picker/menu gates around it.
export type WebTenantLandingConfig = {
  capabilities: {
    firstColor: 'white' | 'red';
    firstGlyph: string;
    firstLabel: 'White' | 'Red';
    glyphClass?: string;
    secondColor: 'red' | 'black';
    secondGlyph: string;
    secondLabel: 'Black' | 'Red';
    supportsRated: boolean;
    supportsStartFormat: boolean;
    supportsTimeControl: boolean;
  };
  // Casual time-control presets the picker offers (rated is globally 3+2).
  timePresetIds: readonly TimeControlId[];
  // Whether the variant appears in normal play-menu entry points.
  offerInMenu(): boolean;
  // Whether a ?play deep link may select the variant (soft-launch links can be
  // live while the menu entry is still hidden).
  acceptsDeepLink(): boolean;
  // PvE engine picker entries; omit when the variant has no PvE surface wired
  // into the landing engine section.
  engineOptions?: readonly WebTenantEngineOption[];
  defaultEngineId?: string;
  // Suppress the create-game color/side picker. For Banqi there is no side to
  // choose: the ink (red/black) is bound by the first mover's opening flip, so a
  // Red/Black picker is meaningless — the seat is randomized instead.
  hideColorPicker?: boolean;
};

export type WebVariantTenant = {
  gameSpecId: GameSpecId;
  // Pre-rename aliases still seen in persisted game records and deep links.
  legacyGameSpecIds?: readonly string[];
  roomIdPrefix: string;
  enabled(): boolean;
  pageTitle: string;
  // Post-game review route base ('/dark-xiangqi/game'); also the route main.ts
  // matches for the postgame mount. Tenants without their own postgame surface
  // (dark-chess correspondence reviews at the legacy /game/:id) omit both.
  gameRouteBase?: string;
  mountPostgame?(root: HTMLElement, roomId: string): Promise<unknown>;
  // Review-link base for finished-game cards (game-meta). Only tenants whose
  // games are linked from shared surfaces set it; others keep the legacy
  // /game/:id link those surfaces always produced.
  reviewRouteBase?: string;
  // Self-contained live-room client (Crossroads). Resolves to the bootstrap
  // function so callers can preload the chunk before swapping the URL/DOM.
  // Tenants without one ride the chess live shell (live.ts) and register
  // hooks in ./live-shell.ts instead.
  loadLiveRoomClient?(): Promise<() => unknown>;
  watch?: {
    family: string;
    mountReplay(
      root: HTMLElement,
      roomId: string,
      options: {
        autoplay: boolean;
        metadataByRoomId: Record<string, GameMeta>;
      },
    ): Promise<ReplayHandle>;
  };
  landing?: WebTenantLandingConfig;
};

const XIANGQI_CAPABILITIES_BASE = {
  firstColor: 'red',
  firstGlyph: '帥',
  firstLabel: 'Red',
  glyphClass: 'xiangqi',
  secondColor: 'black',
  secondGlyph: '將',
  secondLabel: 'Black',
} as const;

const WEB_VARIANT_TENANTS: readonly WebVariantTenant[] = [
  {
    // Dark-chess correspondence rooms (server registration: correspondence
    // create flow). Deliberately capability-free: no loadLiveRoomClient (rooms
    // ride the chess live shell, which speaks the tenant wire since P2), no
    // postgame route (finished games review at the legacy /game/:id like every
    // dark-chess game), no landing config (the correspondence picker is its own
    // flag-gated surface, not a variant-picker row). enabled() only matters to
    // routing branches that never fire without those capabilities, so a stale
    // flag cannot strand a live room.
    gameSpecId: DARK_CHESS_SPEC_ID,
    roomIdPrefix: 'dchx_',
    enabled: correspondenceEnabled,
    pageTitle: 'Dark Chess',
  },
  {
    gameSpecId: DARK_XIANGQI_SPEC_ID,
    roomIdPrefix: 'dxq_',
    enabled: darkXiangqiEnabled,
    pageTitle: 'Dark Xiangqi',
    gameRouteBase: '/dark-xiangqi/game',
    mountPostgame: (root, roomId) =>
      import('../dark-xiangqi-postgame.js').then(({ mountDarkXiangqiPostgame }) =>
        mountDarkXiangqiPostgame(root, roomId),
      ),
    // Self-contained live client (flag-gated) on the socket-client + chrome
    // stack — the P2 rehearsal shape.
    loadLiveRoomClient: () =>
      import('../live-dark-xiangqi.js').then(
        ({ bootstrapDarkXiangqiLiveRoom }) =>
          () =>
            bootstrapDarkXiangqiLiveRoom(),
      ),
    // Mistboard TV channel. Renders in the 'xiangqi' family (intersection board)
    // like the other xiangqi tenants; watch-route dispatch keys on the channel's
    // spec id, not the family, so they never collide on the same renderer.
    watch: {
      family: 'xiangqi',
      mountReplay: (root, roomId, options) =>
        import('../watch-dark-xiangqi-replay.js').then(({ mountDarkXiangqiWatchReplay }) =>
          mountDarkXiangqiWatchReplay(root, roomId, options),
        ),
    },
    // PvP-first launch, gated on the flag (like Banqi's PvP-only launch). The
    // live client (live-dark-xiangqi.ts) runs on the socket-client + chrome
    // stack, so a menu-created dxq_ room is fully playable. No PvE: Fairy-
    // Stockfish is perfect-info and can't play fog xiangqi, so a belief bot is a
    // separate research track.
    landing: {
      capabilities: {
        ...XIANGQI_CAPABILITIES_BASE,
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: darkXiangqiEnabled,
      acceptsDeepLink: darkXiangqiEnabled,
    },
  },
  {
    // Identity-hidden jieqi (9x10). A self-contained live client on the
    // socket-client + chrome stack (no fog: positions are public, only piece
    // identities are hidden). Flag-gated like Dark Xiangqi; the picker
    // capabilities stay defined for stored setup preferences even while the
    // menu and deep-link gates are off.
    gameSpecId: JIEQI_SPEC_ID,
    roomIdPrefix: 'jq_',
    enabled: jieqiEnabled,
    pageTitle: 'Jieqi',
    gameRouteBase: '/jieqi/game',
    mountPostgame: (root, roomId) =>
      import('../live-jieqi-postgame.js').then(({ mountJieqiPostgame }) =>
        mountJieqiPostgame(root, roomId),
      ),
    reviewRouteBase: '/jieqi/game',
    loadLiveRoomClient: () =>
      import('../live-jieqi.js').then(
        ({ bootstrapJieqiLiveRoom }) =>
          () =>
            bootstrapJieqiLiveRoom(),
      ),
    // Renders in the 'xiangqi' family (intersection board) like Dark Mini
    // Xiangqi, but watch-route dispatch keys on the channel's spec id, not the
    // family, so the two never collide on the same renderer.
    watch: {
      family: 'xiangqi',
      mountReplay: (root, roomId, options) =>
        import('../watch-jieqi-replay.js').then(({ mountJieqiWatchReplay }) =>
          mountJieqiWatchReplay(root, roomId, options),
        ),
    },
    landing: {
      capabilities: {
        ...XIANGQI_CAPABILITIES_BASE,
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: jieqiEnabled,
      acceptsDeepLink: jieqiEnabled,
      // Ordered strongest-first so the toughest opponent sits at the top of the picker.
      engineOptions: [
        {
          id: 'pikafish-jieqi-strongest',
          name: 'PikaJieQi - Strongest',
          familyName: 'PikaJieQi',
          kind: 'container',
        },
        {
          id: 'pikafish-jieqi-strong',
          name: 'PikaJieQi - Strong',
          familyName: 'PikaJieQi',
          kind: 'container',
        },
        {
          id: 'pikafish-jieqi-amateur',
          name: 'PikaJieQi - Amateur',
          familyName: 'PikaJieQi',
          kind: 'container',
        },
      ],
      defaultEngineId: 'pikafish-jieqi-strong',
    },
  },
  {
    // Banqi (8x4 Chinese Dark Chess). Symmetric-information: a face-down tile
    // carries no colour or identity to anyone (the deal is the only hidden
    // state, hidden from both seats equally). A self-contained live client on
    // the socket-client + chrome stack, with no fog. Flag-gated like jieqi; the
    // picker capabilities stay defined for stored setup preferences even while
    // the menu gate is off. No watch channel yet.
    gameSpecId: BANQI_SPEC_ID,
    roomIdPrefix: 'bq_',
    enabled: banqiEnabled,
    pageTitle: 'Banqi',
    gameRouteBase: '/banqi/game',
    mountPostgame: (root, roomId) =>
      import('../live-banqi-postgame.js').then(({ mountBanqiPostgame }) =>
        mountBanqiPostgame(root, roomId),
      ),
    reviewRouteBase: '/banqi/game',
    loadLiveRoomClient: () =>
      import('../live-banqi.js').then(
        ({ bootstrapBanqiLiveRoom }) =>
          () =>
            bootstrapBanqiLiveRoom(),
      ),
    // Banqi renders its own 8×4 SVG board; the watch-route dispatch keys on the
    // channel's spec id (not family), so this never collides with the other
    // 'xiangqi'-family SVG tenants on the same renderer.
    watch: {
      family: 'xiangqi',
      mountReplay: (root, roomId, options) =>
        import('../watch-banqi-replay.js').then(({ mountBanqiWatchReplay }) =>
          mountBanqiWatchReplay(root, roomId, options),
        ),
    },
    landing: {
      capabilities: {
        firstColor: 'red',
        firstGlyph: '帥',
        firstLabel: 'Red',
        glyphClass: 'xiangqi',
        secondColor: 'black',
        secondGlyph: '將',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: banqiEnabled,
      acceptsDeepLink: banqiEnabled,
      // One versioned bot (was 3 difficulty tiers; consolidated 2026-06-18 with the v0.2.0
      // cheap-strength eval). Single full-strength MistyBanqi.
      engineOptions: [
        {
          id: 'misty-banqi',
          name: 'MistyBanqi',
          familyName: 'MistyBanqi',
          kind: 'container',
        },
      ],
      defaultEngineId: 'misty-banqi',
      hideColorPicker: true,
    },
  },
  {
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    roomIdPrefix: 'dmxq_',
    enabled: darkMiniXiangqiEnabled,
    pageTitle: 'Dark Mini Xiangqi',
    gameRouteBase: '/dark-mini-xiangqi/game',
    mountPostgame: (root, roomId) =>
      import('../dark-mini-xiangqi-postgame.js').then(({ mountDarkMiniXiangqiPostgame }) =>
        mountDarkMiniXiangqiPostgame(root, roomId),
      ),
    watch: {
      family: 'xiangqi',
      mountReplay: (root, roomId, options) =>
        import('../watch-mini-xiangqi-replay.js').then(({ mountMiniXiangqiWatchReplay }) =>
          mountMiniXiangqiWatchReplay(root, roomId, options),
        ),
    },
    landing: {
      capabilities: {
        ...XIANGQI_CAPABILITIES_BASE,
        supportsRated: true,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2'],
      offerInMenu: darkMiniXiangqiPublicEntryEnabled,
      acceptsDeepLink: darkMiniXiangqiEnabled,
    },
  },
  {
    // Reveal Chess (chess-jieqi): standard 8x8 chess with hidden piece
    // IDENTITIES. Identity-hidden like jieqi (positions are public; only a
    // face-down piece's role is hidden), but on a chess board with chess colors,
    // so it renders in the 'chess' family with the cburnett pieces + a face-down
    // disc token. A self-contained live client on the socket-client + chrome
    // stack, with no fog. Flag-gated and PvP-only at launch (no PvE engine), so
    // the picker capabilities stay defined for stored setup preferences while the
    // menu and deep-link gates are off.
    gameSpecId: REVEAL_CHESS_SPEC_ID,
    roomIdPrefix: 'rc_',
    enabled: revealChessEnabled,
    pageTitle: 'Reveal Chess',
    gameRouteBase: '/reveal-chess/game',
    mountPostgame: (root, roomId) =>
      import('../reveal-chess-postgame.js').then(({ mountRevealChessPostgame }) =>
        mountRevealChessPostgame(root, roomId),
      ),
    reviewRouteBase: '/reveal-chess/game',
    loadLiveRoomClient: () =>
      import('../live-reveal-chess.js').then(
        ({ bootstrapRevealChessLiveRoom }) =>
          () =>
            bootstrapRevealChessLiveRoom(),
      ),
    watch: {
      family: 'chess',
      mountReplay: (root, roomId, options) =>
        import('../watch-reveal-chess-replay.js').then(({ mountRevealChessWatchReplay }) =>
          mountRevealChessWatchReplay(root, roomId, options),
        ),
    },
    landing: {
      capabilities: {
        firstColor: 'white',
        firstGlyph: '♚',
        firstLabel: 'White',
        secondColor: 'black',
        secondGlyph: '♚',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: revealChessEnabled,
      acceptsDeepLink: revealChessEnabled,
    },
  },
  // Perfect-information Crossroads is intentionally ranked last in the lobby
  // play-menu: it is the platform's one perfect-info surface (everything else
  // is hidden-info), kept playable but de-emphasized.
  {
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    legacyGameSpecIds: [DUAL_CHESS_SPEC_ID],
    roomIdPrefix: 'dchess_',
    enabled: crossroadsChessEnabled,
    pageTitle: 'Crossroads Chess',
    gameRouteBase: '/crossroads-chess/game',
    mountPostgame: (root, roomId) =>
      import('../crossroads-chess-postgame.js').then(({ mountCrossroadsChessPostgame }) =>
        mountCrossroadsChessPostgame(root, roomId),
      ),
    reviewRouteBase: '/crossroads-chess/game',
    // Routed to its own isolated client before the shared live-room shell so
    // it never touches the fog-critical live.ts monolith.
    loadLiveRoomClient: () =>
      import('../live-crossroads-chess.js').then(
        ({ bootstrapCrossroadsChessLiveRoom }) =>
          () =>
            bootstrapCrossroadsChessLiveRoom(),
      ),
    watch: {
      family: 'crossroads-chess',
      mountReplay: (root, roomId, options) =>
        import('../watch-crossroads-chess-replay.js').then(({ mountCrossroadsChessWatchReplay }) =>
          mountCrossroadsChessWatchReplay(root, roomId, options),
        ),
    },
    landing: {
      capabilities: {
        firstColor: 'white',
        firstGlyph: '♚',
        firstLabel: 'White',
        secondColor: 'black',
        secondGlyph: '♚',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: crossroadsChessEnabled,
      acceptsDeepLink: crossroadsChessEnabled,
      // Ordered strongest-first so the toughest opponent sits at the top of the picker.
      engineOptions: [
        {
          id: 'fairy-stockfish-crossroads-very-strong',
          name: 'Fairy Stockfish - Strongest',
          familyName: 'Fairy Stockfish',
          kind: 'container',
        },
        {
          id: 'fairy-stockfish-crossroads-strong',
          name: 'Fairy Stockfish - Strong',
          familyName: 'Fairy Stockfish',
          kind: 'container',
        },
        {
          id: 'fairy-stockfish-crossroads-amateur',
          name: 'Fairy Stockfish - Amateur',
          familyName: 'Fairy Stockfish',
          kind: 'container',
        },
      ],
      defaultEngineId: 'fairy-stockfish-crossroads-strong',
    },
  },
  {
    // Dark Crossroads Chess (fog 6x8): the FOG sibling of perfect-info
    // Crossroads. A self-contained live client on the socket-client + chrome
    // stack with the fog-safe replay-CAPTURE model (live-dark-crossroads-chess.ts,
    // NOT the open client's reconstruct-from-state path, which would leak under
    // fog); the board renderer is shared with the open variant (already
    // fog-aware). PvP-only — Fairy-Stockfish is perfect-info and can't play fog
    // crossroads, so there is no PvE. Flag-gated; the picker capabilities stay
    // defined while the menu/deep-link gates are off. Postgame review is wired
    // (the white/truth/red fog triptych); the watch channel is still a parity
    // fast-follow (as it was for Dark Xiangqi).
    gameSpecId: DARK_CROSSROADS_CHESS_SPEC_ID,
    roomIdPrefix: 'ddchess_',
    enabled: darkCrossroadsChessEnabled,
    pageTitle: 'Dark Crossroads Chess',
    gameRouteBase: '/dark-crossroads-chess/game',
    mountPostgame: (root, roomId) =>
      import('../dark-crossroads-chess-postgame.js').then(({ mountDarkCrossroadsChessPostgame }) =>
        mountDarkCrossroadsChessPostgame(root, roomId),
      ),
    reviewRouteBase: '/dark-crossroads-chess/game',
    loadLiveRoomClient: () =>
      import('../live-dark-crossroads-chess.js').then(
        ({ bootstrapDarkCrossroadsChessLiveRoom }) =>
          () =>
            bootstrapDarkCrossroadsChessLiveRoom(),
      ),
    landing: {
      // White vs Red (the variant's actual colors), so the picker's
      // preferredColor maps straight onto the room route's parser.
      capabilities: {
        firstColor: 'white',
        firstGlyph: '♚',
        firstLabel: 'White',
        secondColor: 'red',
        secondGlyph: '♚',
        secondLabel: 'Red',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: darkCrossroadsChessEnabled,
      acceptsDeepLink: darkCrossroadsChessEnabled,
    },
  },
  {
    // Dark Shogi (fog 9x9): a fog tenant on the socket-client + chrome stack with
    // the fog-safe replay-CAPTURE model (live-dark-shogi.ts). Net-new surface vs
    // the other fog tenants — a koma board (shogi-render.ts), reserve (hand)
    // strips, drop + promotion interaction — and PRIVATE hands (the view carries
    // only your own reserve). PvP-only (no bot yet). Flag-gated; postgame review
    // is the black/truth/white fog triptych. Color choice is deferred for v1:
    // hideColorPicker randomizes the seat (Banqi precedent), so the placeholder
    // capability colors below never render.
    gameSpecId: DARK_SHOGI_SPEC_ID,
    roomIdPrefix: 'dsg_',
    enabled: darkShogiEnabled,
    pageTitle: 'Dark Shogi',
    gameRouteBase: '/dark-shogi/game',
    mountPostgame: (root, roomId) =>
      import('../dark-shogi-postgame.js').then(({ mountDarkShogiPostgame }) =>
        mountDarkShogiPostgame(root, roomId),
      ),
    reviewRouteBase: '/dark-shogi/game',
    loadLiveRoomClient: () =>
      import('../live-dark-shogi.js').then(
        ({ bootstrapDarkShogiLiveRoom }) =>
          () =>
            bootstrapDarkShogiLiveRoom(),
      ),
    landing: {
      capabilities: {
        // Placeholders — the color section is hidden (hideColorPicker), so the
        // seat is randomized and these never reach the UI. Shogi is sente
        // (black) vs gote (white); a real picker waits on widening the picker's
        // white/red/black color model.
        firstColor: 'white',
        firstGlyph: '☗',
        firstLabel: 'White',
        secondColor: 'black',
        secondGlyph: '☖',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: darkShogiEnabled,
      acceptsDeepLink: darkShogiEnabled,
      hideColorPicker: true,
    },
  },
  {
    // Dark Crazyhouse (fog 8x8 chess + drops): a fog tenant on the socket-client +
    // chrome stack with the fog-safe replay-CAPTURE model (live-dark-crazyhouse.ts).
    // Reuses the existing 8x8 chess board + chess fog; new surface is the reserve
    // (hand) strips + drop UI + 4-way promotion + the PARACHUTE BOUNCE (a fog drop
    // onto a hidden piece comes back as 'drop-rejected'). PRIVATE hands. PvP-only,
    // no bot. Standard white-first, so it gets a real White/Black color picker.
    gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
    roomIdPrefix: 'dczh_',
    enabled: darkCrazyhouseEnabled,
    pageTitle: 'Dark Crazyhouse',
    gameRouteBase: '/dark-crazyhouse/game',
    mountPostgame: (root, roomId) =>
      import('../dark-crazyhouse-postgame.js').then(({ mountDarkCrazyhousePostgame }) =>
        mountDarkCrazyhousePostgame(root, roomId),
      ),
    reviewRouteBase: '/dark-crazyhouse/game',
    loadLiveRoomClient: () =>
      import('../live-dark-crazyhouse.js').then(
        ({ bootstrapDarkCrazyhouseLiveRoom }) =>
          () =>
            bootstrapDarkCrazyhouseLiveRoom(),
      ),
    landing: {
      capabilities: {
        firstColor: 'white',
        firstGlyph: '♚',
        firstLabel: 'White',
        secondColor: 'black',
        secondGlyph: '♚',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: darkCrazyhouseEnabled,
      acceptsDeepLink: darkCrazyhouseEnabled,
    },
  },
  {
    // Kriegspiel (standard chess played blind): a hidden-info tenant on the
    // socket-client + chrome stack with the fog-safe replay-CAPTURE model
    // (live-kriegspiel.ts). The board shows only the viewer's own army; the
    // opponent's move never arrives — only the UMPIRE ANNOUNCEMENT does (capture
    // square + pawn/piece, check category), with the move coordinates redacted.
    // The try-loop bounce surfaces as 'kriegspiel-illegal'. Real checkmate.
    // PvP-only, no bot. Standard white-first, so it gets a White/Black picker.
    gameSpecId: KRIEGSPIEL_SPEC_ID,
    roomIdPrefix: 'kr_',
    enabled: kriegspielEnabled,
    pageTitle: 'Kriegspiel',
    gameRouteBase: '/kriegspiel/game',
    mountPostgame: (root, roomId) =>
      import('../kriegspiel-postgame.js').then(({ mountKriegspielPostgame }) =>
        mountKriegspielPostgame(root, roomId),
      ),
    reviewRouteBase: '/kriegspiel/game',
    loadLiveRoomClient: () =>
      import('../live-kriegspiel.js').then(
        ({ bootstrapKriegspielLiveRoom }) =>
          () =>
            bootstrapKriegspielLiveRoom(),
      ),
    landing: {
      capabilities: {
        firstColor: 'white',
        firstGlyph: '♚',
        firstLabel: 'White',
        secondColor: 'black',
        secondGlyph: '♚',
        secondLabel: 'Black',
        supportsRated: false,
        supportsStartFormat: false,
        supportsTimeControl: true,
      },
      timePresetIds: ['1m1', '3m2', '5m5'],
      offerInMenu: kriegspielEnabled,
      acceptsDeepLink: kriegspielEnabled,
    },
  },
];

export function webVariantTenants(): readonly WebVariantTenant[] {
  return WEB_VARIANT_TENANTS;
}

export function webVariantTenantForRoomId(roomId: string): WebVariantTenant | null {
  return WEB_VARIANT_TENANTS.find((tenant) => roomId.startsWith(tenant.roomIdPrefix)) ?? null;
}

// Spec-id lookup, accepting legacy aliases (persisted records and deep links
// can still carry 'dual-chess').
export function webVariantTenantForSpecId(value: string | null): WebVariantTenant | null {
  if (!value) return null;
  return (
    WEB_VARIANT_TENANTS.find(
      (tenant) => tenant.gameSpecId === value || tenant.legacyGameSpecIds?.includes(value),
    ) ?? null
  );
}
