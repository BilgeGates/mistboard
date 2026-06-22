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
export type {
  BotDirectoryEntry,
  BotModeRecord,
  BotOwnerType,
  BotPlayProfile,
  BotProfile,
  BotProfilePage,
  BotRatingSnapshot,
  BotRatingSource,
} from './persistence-bots.js';
export { getPublicBotForPlay, getPublicBotProfile, listPublicBots } from './persistence-bots.js';
export type {
  CorrespondenceSeekListing,
  CorrespondenceSeekRecord,
  SeekColorPreference,
} from './persistence-correspondence-seeks.js';
export {
  countOpenSeeksForUser,
  createCorrespondenceSeek,
  deleteCorrespondenceSeek,
  getCorrespondenceSeek,
  listOpenCorrespondenceSeeks,
} from './persistence-correspondence-seeks.js';
export { close, init, isInitialized, probeDb } from './persistence-db.js';
export type { FeedbackSubmissionInput } from './persistence-feedback.js';
export {
  countAnonFeedbackSubmissionsSince,
  insertFeedbackSubmission,
} from './persistence-feedback.js';
export type {
  AddForumPostResult,
  CreateForumTopicResult,
  ForumAuthor,
  ForumCategory,
  ForumPost,
  ForumTopicDetail,
  ForumTopicModerationAction,
  ForumTopicSummary,
  ForumTopicWritePolicy,
  HideForumPostResult,
  ModerateForumTopicResult,
} from './persistence-forum.js';
export {
  addForumPost,
  countRecentForumPostsByUser,
  countRecentForumTopicsByUser,
  createForumTopic,
  getForumTopic,
  hideForumPost,
  listForumCategories,
  listForumTopics,
  moderateForumTopic,
  searchForumTopics,
  updateForumPost,
} from './persistence-forum.js';
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
  EngineModeRecord,
  EngineProfile,
  EngineVersionStats,
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
  getEngineProfile,
  getGameSummary,
  listCompletedGames,
  listCorpusGames,
  listEngineVersionStats,
  listRecentEveGames,
  listRecentPublicGames,
  listShowcaseGames,
  listWatchUnlockedGames,
  queryGames,
  recordGameEnd,
} from './persistence-games.js';
export type {
  CorrespondenceGameSummary,
  DeadlineWarningCandidate,
  DueRoomDeadline,
  RoomDeadlineRecord,
} from './persistence-room-deadlines.js';
export {
  deleteRoomDeadline,
  listCorrespondenceGamesForUser,
  listDeadlineWarningCandidates,
  listDueRoomDeadlines,
  markRoomDeadlineWarned,
  upsertRoomDeadline,
} from './persistence-room-deadlines.js';
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
