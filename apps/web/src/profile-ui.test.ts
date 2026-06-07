import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow } from './profile-ui.js';

function game(overrides: Partial<FeaturedGame> = {}): FeaturedGame {
  return {
    roomId: 'room_1',
    variant: 'dark-chess',
    mode: 'pvp',
    rated: false,
    result: 'white-wins',
    termination: 'resignation',
    plyCount: 12,
    whiteName: null,
    blackName: null,
    corpusId: null,
    endedAt: '2026-06-07T12:00:00.000Z',
    participants: [
      {
        color: 'white',
        displayName: 'Alice',
        subjectType: 'user',
        subjectId: 'u_alice',
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Bob',
        subjectType: 'user',
        subjectId: 'u_bob',
        visibility: 'public',
      },
    ],
    playerColor: 'white',
    ...overrides,
  };
}

describe('profile game rows', () => {
  it('renders Dark Mini Xiangqi rows with red/black outcome and review route', () => {
    const row = buildProfileGameRow(
      game({
        roomId: 'dmxq_profile',
        variant: 'dark-mini-xiangqi',
        result: 'red-wins',
        participants: [
          {
            color: 'red',
            displayName: 'Red Player',
            subjectType: 'user',
            subjectId: 'red-user',
            visibility: 'private',
          },
          {
            color: 'black',
            displayName: 'Misty (Dark Mini Xiangqi)',
            subjectType: 'engine-version',
            subjectId: 'python-dmx-v1.0',
            visibility: 'private',
          },
        ],
        playerColor: 'red',
      }),
    );

    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/dark-mini-xiangqi/game/dmxq_profile');
    expect(row.textContent).toContain('Win');
    expect(row.textContent).toContain('vs Misty (Dark Mini Xiangqi)');
    expect(row.textContent).toContain('Dark Mini Xiangqi');
    expect(row.textContent).toContain('Red');
  });

  it('keeps chess profile rows on the chess game route', () => {
    const row = buildProfileGameRow(game());
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/game/room_1');
    expect(row.textContent).toContain('Dark Chess');
    expect(row.textContent).toContain('White');
  });
});
