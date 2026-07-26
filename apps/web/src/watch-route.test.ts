import { describe, expect, it } from 'vitest';
// Side-effect import: populates the server tenant registry exactly like
// apps/server/src/index.ts does (same pattern as variant-registry-sync.test.ts),
// so the expected watch-channel list below derives from the server's source of
// truth instead of a hand-maintained literal that drifts as channels launch.
import '../../server/src/variant-tenant/register-tenants.js';
import { registeredVariantTenants } from '../../server/src/variant-tenant/registry.js';
import { listWatchChannels } from '../../server/src/watch-channels.js';
import type { FeaturedGame } from './game-display.js';
import { createGameTable } from './game-table.js';
import {
  buildWatchScrubber,
  formatWatchScope,
  loadWatchMainBeforePreviews,
  renderWatchChannelList,
  renderWatchMainReviewLink,
  renderWatchQueue,
  renderWatchReplaySkeleton,
  resultLabel,
  shouldPlayWatchMoveSound,
  watchFeedIsDark,
  watchPovToggleApplies,
  watchQueueMatchupLabel,
  watchQueueResultLabel,
} from './watch-route.js';

describe('watch move sounds', () => {
  it('sounds only a single forward ply, not initial paint, jumps, or loop resets', () => {
    expect(shouldPlayWatchMoveSound(null, 0)).toBe(false);
    expect(shouldPlayWatchMoveSound(0, 1)).toBe(true);
    expect(shouldPlayWatchMoveSound(1, 2)).toBe(true);
    expect(shouldPlayWatchMoveSound(2, 2)).toBe(false);
    expect(shouldPlayWatchMoveSound(2, 8)).toBe(false);
    expect(shouldPlayWatchMoveSound(8, 0)).toBe(false);
  });
});

describe('watch replay load priority', () => {
  it('does not start queue previews until the center board is ready', async () => {
    const order: string[] = [];
    let finishMain: (() => void) | undefined;
    const mainReady = new Promise<void>((resolve) => {
      finishMain = resolve;
    });

    const loading = loadWatchMainBeforePreviews(
      async () => {
        order.push('main-start');
        await mainReady;
        order.push('main-ready');
      },
      () => order.push('previews-start'),
    );

    await Promise.resolve();
    expect(order).toEqual(['main-start']);
    finishMain?.();
    await loading;
    expect(order).toEqual(['main-start', 'main-ready', 'previews-start']);
  });
});

describe('watch route copy helpers', () => {
  it('scopes sealed watch copy to dark channels', () => {
    const darkFeed = {
      activeChannel: 'dark-mini-xiangqi',
      channels: [
        {
          family: 'xiangqi',
          gameSpecIds: ['dark-mini-xiangqi'],
          id: 'dark-mini-xiangqi',
          label: 'Dark Mini Xiangqi',
          sealedCount: 1,
          unlockedCount: 2,
        },
      ],
      unlockLimit: 64,
    };
    const visibleFeed = {
      activeChannel: 'rapid',
      channels: [
        {
          family: 'chess',
          gameSpecIds: ['chess'],
          id: 'rapid',
          label: 'Rapid',
          sealedCount: 1,
          unlockedCount: 2,
        },
      ],
      unlockLimit: 32,
    };

    expect(watchFeedIsDark(darkFeed)).toBe(true);
    expect(formatWatchScope(darkFeed)).toBe('dark variants · latest 64');
    expect(watchFeedIsDark(visibleFeed)).toBe(false);
    expect(formatWatchScope(visibleFeed)).toBe('latest 32');
  });

  it('renders red/black Dark Mini Xiangqi queue labels', () => {
    const game: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pve',
      participants: [
        {
          color: 'red',
          displayName: 'Red Human',
          subjectId: null,
          subjectType: 'guest',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Misty',
          subjectId: 'python-dmx-v1.0',
          subjectType: 'engine-version',
          visibility: 'public',
        },
      ],
      plyCount: 12,
      result: 'red-wins',
      roomId: 'dmxq_watch',
      termination: 'general-captured',
      variant: 'dark-mini-xiangqi',
      whiteName: null,
    };

    expect(watchQueueMatchupLabel(game)).toBe('Red Human vs Misty DMX 1.0');
    expect(resultLabel(game.result)).toBe('Red wins');
  });

  it('renders white/red Crossroads Chess queue labels', () => {
    const game: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pve',
      participants: [
        {
          color: 'white',
          displayName: 'White Human',
          subjectId: null,
          subjectType: 'guest',
          visibility: 'public',
        },
        {
          color: 'red',
          displayName: 'Misty',
          subjectId: 'fairy-stockfish-crossroads-strong',
          subjectType: 'engine-version',
          visibility: 'public',
        },
      ],
      plyCount: 16,
      result: 'red-wins',
      roomId: 'dchess_watch',
      termination: 'resignation',
      variant: 'crossroads-chess',
      whiteName: null,
    };

    expect(watchQueueMatchupLabel(game)).toBe('White Human vs Misty');
    expect(resultLabel(game.result)).toBe('Red wins');
  });

  it('labels a banqi queue result by bound ink, not the seat token', () => {
    const base: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pvp',
      plyCount: 40,
      result: 'red-wins',
      roomId: 'bq_watch',
      termination: 'stalemate',
      variant: 'banqi',
      whiteName: null,
    };
    // First-mover ('red') seat won, but it flipped BLACK on the opening move, so
    // the surviving pieces are black ink: the queue must read "Black wins".
    expect(watchQueueResultLabel({ ...base, firstColor: 'black' })).toBe('Black wins');
    // Same seat result, red ink (the seat == ink case) stays "Red wins".
    expect(watchQueueResultLabel({ ...base, firstColor: 'red' })).toBe('Red wins');
    // No firstColor (unreplayable/legacy) falls back to move order, never a wrong ink.
    expect(watchQueueResultLabel(base)).toBe('First wins');
    // Non-banqi variants are untouched by the ink translation.
    expect(watchQueueResultLabel({ ...base, variant: 'crossroads-chess' })).toBe('Red wins');
  });
});

describe('watchPovToggleApplies', () => {
  it('shows the fog-perspective toggle only for asymmetric fog (dark) variants', () => {
    // Asymmetric fog: distinct per-side views, so the toggle is meaningful.
    expect(watchPovToggleApplies('dark-chess')).toBe(true);
    expect(watchPovToggleApplies('dark-xiangqi')).toBe(true);
    expect(watchPovToggleApplies('dark-crossroads-chess')).toBe(true);
    // Symmetric-mask hidden identity (one view) — no toggle.
    expect(watchPovToggleApplies('jieqi')).toBe(false);
    expect(watchPovToggleApplies('banqi')).toBe(false);
    // Open information (one shared board) — no toggle.
    expect(watchPovToggleApplies('xiangqi')).toBe(false);
    expect(watchPovToggleApplies('crossroads-chess')).toBe(false);
    // Unknown variant resolves to no spec — no toggle, never throws.
    expect(watchPovToggleApplies('not-a-variant')).toBe(false);
  });
});

describe('renderWatchReplaySkeleton', () => {
  it('fills the slot with the board placeholder the CSS targets', () => {
    const root = document.createElement('div');
    root.append(document.createElement('span'));
    renderWatchReplaySkeleton(root);
    expect(root.querySelector('.watch-replay-skeleton-board')).not.toBeNull();
    // It replaces prior content rather than appending to it.
    expect(root.querySelector('span')).toBeNull();
    expect(root.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('buildWatchScrubber', () => {
  const button = (el: HTMLElement, label: string) =>
    el.querySelector<HTMLButtonElement>(`.review-scrubber__button[aria-label="${label}"]`);

  it('jumps to the right ply, reading the live ply at click time', () => {
    const ply = 3;
    const jumps: number[] = [];
    const scrubber = buildWatchScrubber(
      (p) => jumps.push(p),
      () => ply,
      () => 10,
    );
    button(scrubber.el, 'First move')?.click();
    button(scrubber.el, 'Previous move')?.click();
    button(scrubber.el, 'Next move')?.click();
    button(scrubber.el, 'Last move')?.click();
    // prev/next resolve against getPly() (3), not a stale captured value.
    expect(jumps).toEqual([0, 2, 4, 10]);
  });

  it('disables the end buttons at the bounds', () => {
    const scrubber = buildWatchScrubber(
      () => {},
      () => 0,
      () => 8,
    );
    scrubber.setBounds(0, 8);
    expect(button(scrubber.el, 'First move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Previous move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Next move')?.disabled).toBe(false);
    expect(button(scrubber.el, 'Last move')?.disabled).toBe(false);

    scrubber.setBounds(8, 8);
    expect(button(scrubber.el, 'First move')?.disabled).toBe(false);
    expect(button(scrubber.el, 'Next move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Last move')?.disabled).toBe(true);
  });

  it('binds the same controls used by live room game tables', () => {
    const table = createGameTable();
    const jumps: number[] = [];
    const scrubber = buildWatchScrubber(
      (ply) => jumps.push(ply),
      () => 4,
      () => 12,
      table.refs.replayControlsRoot,
    );

    table.refs.replayControlsRoot.querySelector<HTMLButtonElement>('[data-replay="prev"]')?.click();
    table.refs.replayControlsRoot
      .querySelector<HTMLButtonElement>('[data-replay="latest"]')
      ?.click();

    expect(scrubber.el).toBe(table.refs.replayControlsRoot);
    expect(jumps).toEqual([3, 12]);
  });
});

describe('renderWatchChannelList', () => {
  function channel(id: string, label: string) {
    return { family: 'xiangqi', gameSpecIds: [id], id, label, sealedCount: 0, unlockedCount: 1 };
  }

  // Regression: every launchable channel needs either a variant marker mapping
  // (CHANNEL_MINI_BY_ID) or a dedicated cross-variant marker, or its rail slot
  // renders empty. The expected list derives from the server's own channel
  // sources (apps/server/src/watch-channels.ts): every channel enabled in this
  // env via listWatchChannels() — which contributes the hardcoded dark-chess and
  // engines channels — plus every registered tenant that declares a watch
  // surface, INCLUDING tenants whose launch flag is off here. The marker must
  // exist before the flag flips, so launching a new channel without one fails
  // this test instead of shipping an empty rail slot.
  it('renders a marker for every launched or launchable watch channel', () => {
    const channelsById = new Map<string, ReturnType<typeof channel>>();
    for (const serverChannel of listWatchChannels()) {
      channelsById.set(serverChannel.id, channel(serverChannel.id, serverChannel.label));
    }
    for (const registration of registeredVariantTenants()) {
      const watch = registration.watch;
      if (!watch) continue;
      channelsById.set(watch.channelId, channel(watch.channelId, watch.label));
    }
    const channels = [...channelsById.values()];
    // Sanity: the registry side-effect import actually populated the sources
    // (dark-chess + engines + at least one tenant channel).
    expect(channels.length).toBeGreaterThanOrEqual(3);

    const feed = {
      activeChannel: 'dark-chess',
      channels,
      now: '2026-06-17T00:00:00.000Z',
      unlockLimit: 64,
      sealedCount: 0,
      unlocked: [],
    };
    const root = document.createElement('nav');
    renderWatchChannelList(root, feed);

    const links = root.querySelectorAll('a.watch-channel-link');
    expect(links).toHaveLength(channels.length);
    for (const link of links) {
      const thumb = link.querySelector('.watch-channel-thumb');
      expect(
        thumb?.querySelector('svg, .variant-marker'),
        `${link.textContent} marker`,
      ).not.toBeNull();
    }
  });

  it('uses the rounded house crown for the Top Rated channel', () => {
    const root = document.createElement('nav');
    renderWatchChannelList(root, {
      activeChannel: 'top',
      channels: [channel('top', 'Top Rated'), channel('xiangqi', 'Xiangqi')],
      now: '2026-07-23T00:00:00.000Z',
      unlockLimit: 64,
      sealedCount: 0,
      unlocked: [],
    });

    const crown = root.querySelector<SVGElement>('a[aria-label="Top Rated"] .watch-channel-crown');
    expect(crown?.classList.contains('ui-icon-featured-channel')).toBe(true);
    expect(crown?.getAttribute('fill')).toBe('none');
    expect(crown?.getAttribute('stroke-linecap')).toBe('round');
    expect(crown?.getAttribute('stroke-linejoin')).toBe('round');
  });
});

describe('renderWatchQueue', () => {
  it('fills its two slots from the games that are NOT on the main board', () => {
    const game = (roomId: string): FeaturedGame => ({
      blackName: 'Black',
      corpusId: null,
      mode: 'pvp',
      plyCount: 24,
      result: 'white-wins',
      roomId,
      termination: 'resignation',
      variant: 'dark-chess',
      whiteName: 'White',
    });
    const root = document.createElement('section');
    const previews = renderWatchQueue(
      root,
      {
        activeChannel: 'dark-chess',
        channels: [
          {
            family: 'chess',
            gameSpecIds: ['dark-chess'],
            id: 'dark-chess',
            label: 'Fog Chess',
            sealedCount: 0,
            unlockedCount: 3,
          },
        ],
        now: '2026-07-13T00:00:00.000Z',
        sealedCount: 0,
        unlockLimit: 64,
        unlocked: [game('newest'), game('previous'), game('older')],
      },
      'newest',
    );

    // 'newest' is on the main board, so the rail skips it and takes the next two:
    // "Previously on" offers what ELSE to watch, never a duplicate of the feature.
    expect(previews.map(({ game: previewGame }) => previewGame.roomId)).toEqual([
      'previous',
      'older',
    ]);
    expect(root.querySelectorAll('.watch-queue-preview')).toHaveLength(2);
    expect(root.querySelector('[data-room-id="newest"]')).toBeNull();
    expect(root.querySelector('[data-room-id="previous"] a')?.getAttribute('href')).toBe(
      '/game/previous',
    );
  });

  it('links tenant previews to their native review pages', () => {
    const banqi: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pve',
      plyCount: 160,
      result: 'draw',
      roomId: 'bq_review',
      termination: 'progress-clock',
      variant: 'banqi',
      whiteName: null,
    };
    const root = document.createElement('section');

    renderWatchQueue(
      root,
      {
        activeChannel: 'banqi',
        channels: [
          {
            family: 'xiangqi',
            gameSpecIds: ['banqi'],
            id: 'banqi',
            label: 'Flip Xiangqi',
            sealedCount: 0,
            unlockedCount: 2,
          },
        ],
        now: '2026-07-17T00:00:00.000Z',
        sealedCount: 0,
        unlockLimit: 64,
        unlocked: [banqi, { ...banqi, roomId: 'bq_active' }],
      },
      'bq_active',
    );

    const reviewLink = root.querySelector('[data-room-id="bq_review"] a');
    expect(reviewLink?.getAttribute('href')).toBe('/banqi/game/bq_review');
    expect(reviewLink?.getAttribute('aria-label')).toContain('Review');
  });

  it('empties rather than mirroring the board when it is the channel’s only game', () => {
    const only: FeaturedGame = {
      blackName: 'Black',
      corpusId: null,
      mode: 'pvp',
      plyCount: 24,
      result: 'white-wins',
      roomId: 'only',
      termination: 'resignation',
      variant: 'dark-chess',
      whiteName: 'White',
    };
    const root = document.createElement('section');
    const previews = renderWatchQueue(
      root,
      {
        activeChannel: 'dark-chess',
        channels: [
          {
            family: 'chess',
            gameSpecIds: ['dark-chess'],
            id: 'dark-chess',
            label: 'Fog Chess',
            sealedCount: 0,
            unlockedCount: 1,
          },
        ],
        now: '2026-07-13T00:00:00.000Z',
        sealedCount: 0,
        unlockLimit: 64,
        unlocked: [only],
      },
      'only',
    );

    expect(previews).toEqual([]);
    expect(root.querySelector('[data-room-id="only"]')).toBeNull();
    expect(root.querySelector('.watch-previously-empty')?.textContent).toContain('No other');
  });
});

describe('renderWatchMainReviewLink', () => {
  const finishedGame: FeaturedGame = {
    blackName: 'Black',
    corpusId: null,
    mode: 'pvp',
    plyCount: 24,
    result: 'white-wins',
    roomId: 'focused',
    termination: 'resignation',
    variant: 'dark-chess',
    whiteName: 'White',
  };

  it('links the focused finished board to its variant-aware review page', () => {
    const link = document.createElement('a');

    renderWatchMainReviewLink(link, finishedGame);

    expect(link.hidden).toBe(false);
    expect(link.getAttribute('href')).toBe('/game/focused');
    expect(link.getAttribute('aria-label')).toBe('Review White vs Black');

    renderWatchMainReviewLink(link, { ...finishedGame, roomId: 'bq_focused', variant: 'banqi' });
    expect(link.getAttribute('href')).toBe('/banqi/game/bq_focused');
  });

  it('removes the link for live games and samples without review pages', () => {
    const link = document.createElement('a');
    renderWatchMainReviewLink(link, finishedGame);

    renderWatchMainReviewLink(link, null);
    expect(link.hidden).toBe(true);
    expect(link.hasAttribute('href')).toBe(false);

    renderWatchMainReviewLink(link, { ...finishedGame, corpusId: 'replay-samples' });
    expect(link.hidden).toBe(true);
    expect(link.hasAttribute('href')).toBe(false);
  });
});
