export type {
  AccountRole,
  AccountSession,
  EmailLoginChallenge,
  LeaderboardEntry,
  LeaderboardQuery,
  ProfileBucketRating,
  PublicProfileUser,
  UpdateUserProfileResult,
  UserAccount,
  UserProfile,
} from './persistence-accounts.js';
export {
  consumeEmailLoginChallenge,
  createAccountSession,
  createEmailLoginChallenge,
  createUser,
  deleteEmailLoginChallenge,
  findUserByEmail,
  getLeaderboard,
  getUserByAccountSession,
  getUserProfileByHandle,
  markUserEmailVerified,
  revokeAccountSession,
  updateUserProfile,
} from './persistence-accounts.js';
export { close, init, isInitialized, probeDb } from './persistence-db.js';
export type { FeedbackSubmissionInput } from './persistence-feedback.js';
export {
  countAnonFeedbackSubmissionsSince,
  insertFeedbackSubmission,
} from './persistence-feedback.js';
export type {
  GameDebugArtifactInput,
  GameDebugArtifactPayload,
  GameDebugArtifactSummary,
  GameMode,
  GameReviewStatus,
  GameTermination,
  GameVisibility,
  RunningGameSummary,
  StalePausedFinalizeRecord,
} from './persistence-game-lifecycle.js';
export {
  abortRunningGame,
  abortStaleGuestPrestartGames,
  appendEvent,
  finalizeStalePausedRooms,
  getGameLifecycleStatus,
  listActiveRoomIds,
  listGameDebugArtifactPayloads,
  listGameDebugArtifactSummaries,
  loadRoom,
  recordGameDebugArtifact,
  recordGameStart,
} from './persistence-game-lifecycle.js';
export type {
  CompletedGameFilters,
  GameParticipant,
  GameParticipantSubjectType,
  GameRecord,
  GameResult,
  GameSummary,
  ProfileGameRecord,
  RecentEveGameRecord,
  WatchUnlockedGameOptions,
} from './persistence-games.js';
export {
  countWatchSealedGames,
  getGameSummary,
  listCompletedGames,
  listCorpusGames,
  listRecentEveGames,
  listRecentPublicGames,
  listWatchUnlockedGames,
  recordGameEnd,
} from './persistence-games.js';
export type { RoomSeatTokenRecord } from './persistence-seat-tokens.js';
export {
  loadRoomSeatTokens,
  replaceRoomSeatTokens,
  touchRoomSeatToken,
  upsertRoomSeatToken,
  verifyRoomSeatToken,
} from './persistence-seat-tokens.js';
export type { SiteStats } from './persistence-site-stats.js';
export { getSiteStats } from './persistence-site-stats.js';
