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
  getUserGamesPage,
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
  PersistedRoomEvent,
  RoomLifecycleAuditInput,
  RoomLifecycleAuditRecord,
  RoomLifecycleTimeline,
  RoomLifecycleTimelineEvent,
  RunningGameSummary,
  StalePausedFinalizeRecord,
} from './persistence-game-lifecycle.js';
export {
  abortRunningGame,
  abortStaleGuestPrestartGames,
  appendEvent,
  appendRoomEvent,
  finalizeStalePausedRooms,
  getGameLifecycleStatus,
  getRoomLifecycleTimeline,
  listActiveRoomIds,
  listGameDebugArtifactPayloads,
  listGameDebugArtifactSummaries,
  listRoomLifecycleAudit,
  loadRoom,
  loadRoomEvents,
  recordGameDebugArtifact,
  recordGameStart,
  recordRoomLifecycleAudit,
} from './persistence-game-lifecycle.js';
export type {
  CompletedGameFilters,
  GameAggregates,
  GameFacets,
  GameParticipant,
  GameParticipantColor,
  GameParticipantSubjectType,
  GameQueryFilters,
  GameQueryPage,
  GameRecord,
  GameResult,
  GameSummary,
  ProfileGameRecord,
  RecentEveGameRecord,
  WatchSealedGameOptions,
  WatchUnlockedGameOptions,
} from './persistence-games.js';
export {
  countWatchSealedGames,
  gameAggregates,
  gameFacets,
  getGameSummary,
  listCompletedGames,
  listCorpusGames,
  listRecentEveGames,
  listRecentPublicGames,
  listWatchUnlockedGames,
  queryGames,
  recordGameEnd,
} from './persistence-games.js';
export type { RoomSeatTokenRecord, RoomSeatTokenSeat } from './persistence-seat-tokens.js';
export {
  loadRoomSeatTokens,
  replaceRoomSeatTokens,
  touchRoomSeatToken,
  upsertRoomSeatToken,
  verifyRoomSeatToken,
} from './persistence-seat-tokens.js';
export type {
  PublicSiteStats,
  PublicStatsDay,
  PublicStatsMode,
  SiteStats,
} from './persistence-site-stats.js';
export { getPublicSiteStats, getSiteStats } from './persistence-site-stats.js';
