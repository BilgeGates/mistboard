// Compatibility facade for player-only consumers. New subject-agnostic work
// belongs in profile-summary-card.ts.
export {
  attachUserCard,
  buildUserCard,
  type UserCardLiveness,
  type UserCardProfile,
} from './profile-summary-card.js';
