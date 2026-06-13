import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import {
  formatWatchScope,
  renderWatchReplaySkeleton,
  resultLabel,
  watchFeedIsDark,
  watchQueueMatchupLabel,
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

    expect(watchQueueMatchupLabel(game)).toBe('Red Human vs Misty (Dark Mini Xiangqi)');
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
