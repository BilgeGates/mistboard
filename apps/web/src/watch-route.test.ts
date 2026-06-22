import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import {
  formatWatchScope,
  renderWatchChannelList,
  renderWatchReplaySkeleton,
  resultLabel,
  watchFeedIsDark,
  watchQueueMatchupLabel,
  watchQueueResultLabel,
} from './watch-route.js';

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

describe('renderWatchChannelList', () => {
  function channel(id: string, label: string) {
    return { family: 'xiangqi', gameSpecIds: [id], id, label, sealedCount: 0, unlockedCount: 1 };
  }

  // Regression: every launchable channel needs a CHANNEL_MINI_BY_ID entry, or
  // its rail marker renders as an empty slot. dark-xiangqi shipped without one.
  it('renders a board marker for every launched watch channel', () => {
    const feed = {
      activeChannel: 'dark-chess',
      channels: [
        channel('dark-chess', 'Dark Chess'),
        channel('mini-xiangqi', 'Mini Xiangqi'),
        channel('dark-mini-xiangqi', 'Dark Mini Xiangqi'),
        channel('dark-xiangqi', 'Dark Xiangqi'),
        channel('jieqi', 'Jieqi'),
        channel('banqi', 'Banqi'),
        channel('reveal-chess', 'Reveal Chess'),
        channel('crossroads-chess', 'Crossroads Chess'),
        channel('dark-crossroads-chess', 'Dark Crossroads Chess'),
        channel('dark-shogi', 'Dark Shogi'),
        channel('dark-crazyhouse', 'Dark Crazyhouse'),
        channel('kriegspiel', 'Kriegspiel'),
      ],
      now: '2026-06-17T00:00:00.000Z',
      unlockLimit: 64,
      sealedCount: 0,
      unlocked: [],
    };
    const root = document.createElement('nav');
    renderWatchChannelList(root, feed);

    const links = root.querySelectorAll('a.watch-channel-link');
    expect(links).toHaveLength(12);
    for (const link of links) {
      const thumb = link.querySelector('.watch-channel-thumb');
      expect(thumb?.querySelector('svg'), `${link.textContent} marker`).not.toBeNull();
    }
  });
});
