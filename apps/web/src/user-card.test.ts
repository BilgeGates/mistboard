import { describe, expect, it } from 'vitest';
import { buildUserCard, type UserCardProfile } from './user-card.js';
import { profileRatingVariants } from './variants.js';

// A variant guaranteed to be on the profile surface (dark chess leads the list),
// so the rating tile renders with a mini-board icon.
const ratedVariant = profileRatingVariants[0].id;

function profile(overrides: Partial<UserCardProfile> = {}): UserCardProfile {
  return {
    isViewer: false,
    relation: { following: false, blocked: false },
    user: {
      handle: 'conan',
      displayName: 'Conan_The_Barbarian8',
      accountRole: 'player',
      createdAt: '2025-08-01T00:00:00.000Z',
    },
    ratings: [
      {
        variant: ratedVariant,
        timeClass: 'blitz',
        eloRating: 2903,
        ratedGamesPlayed: 120,
        totalGamesPlayed: 200,
        provisional: false,
      },
    ],
    gamesTotal: 587,
    ...overrides,
  };
}

describe('buildUserCard', () => {
  it('renders the name as a profile link', () => {
    const card = buildUserCard(profile());
    const name = card.querySelector('.user-card-name') as HTMLAnchorElement;
    expect(name.textContent).toBe('Conan_The_Barbarian8');
    expect(name.getAttribute('href')).toBe('/@/conan');
  });

  it('shows a rated variant tile with its Elo', () => {
    const card = buildUserCard(profile());
    const value = card.querySelector('.user-card-rating-value');
    expect(value?.textContent).toBe('2903');
    expect(card.querySelector('.user-card-rating-icon .variant-marker')).not.toBeNull();
  });

  it('marks a provisional rating with a "?"', () => {
    const card = buildUserCard(
      profile({
        ratings: [
          {
            variant: ratedVariant,
            timeClass: 'blitz',
            eloRating: 1500,
            ratedGamesPlayed: 3,
            totalGamesPlayed: 3,
            provisional: true,
          },
        ],
      }),
    );
    expect(card.querySelector('.user-card-rating-value')?.textContent).toBe('1500?');
  });

  it('omits the rating grid when the player has no rated variant', () => {
    const card = buildUserCard(profile({ ratings: [] }));
    expect(card.querySelector('.user-card-ratings')).toBeNull();
  });

  it('renders Follow + Message actions for a non-viewer', () => {
    const card = buildUserCard(profile());
    const actions = [...card.querySelectorAll('.user-card-action')].map((el) => el.textContent);
    expect(actions).toContain('Follow');
    expect(actions).toContain('Message');
  });

  it('shows Unfollow when already following', () => {
    const card = buildUserCard(profile({ relation: { following: true, blocked: false } }));
    const actions = [...card.querySelectorAll('.user-card-action')].map((el) => el.textContent);
    expect(actions).toContain('Unfollow');
  });

  it('hides actions on the viewer’s own card', () => {
    const card = buildUserCard(profile({ isViewer: true, relation: null }));
    expect(card.querySelector('.user-card-actions')).toBeNull();
  });

  it('renders a presence dot only when online', () => {
    expect(
      buildUserCard(profile(), { online: true }).querySelector('.user-card-dot'),
    ).not.toBeNull();
    expect(buildUserCard(profile(), { online: false }).querySelector('.user-card-dot')).toBeNull();
  });

  it('shows the game count in the footer', () => {
    const card = buildUserCard(profile());
    expect(card.querySelector('.user-card-footer')?.textContent).toContain('587');
  });
});
