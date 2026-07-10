// Curated video library data for /videos. Every entry was verified against
// YouTube's oembed endpoint (https://www.youtube.com/oembed?url=...) on the
// date in `addedAt`; `title` and `author` are the exact oembed values, so they
// stay verbatim even where they break house copy style. English-language
// xiangqi first: this list is the seed for a lichess.org/video-style library
// and the future home for Mistboard's own videos.

export type VideoTag = 'basics' | 'openings' | 'tactics' | 'endgames' | 'games' | 'culture';

export const VIDEO_TAGS: readonly VideoTag[] = [
  'basics',
  'openings',
  'tactics',
  'endgames',
  'games',
  'culture',
];

export interface VideoEntry {
  /** YouTube video id (the `v` query parameter). */
  id: string;
  /** Exact title reported by YouTube oembed. */
  title: string;
  /** Exact channel name reported by YouTube oembed. */
  author: string;
  durationMinutes?: number;
  tags: readonly VideoTag[];
  language: 'en';
  /** ISO date the entry was curated and verified. */
  addedAt: string;
}

export const VIDEOS: readonly VideoEntry[] = [
  {
    id: 'kSL7JErRMx8',
    title: 'Introduction to Chinese Chess (Xiangqi) How to Play - Rick Knowlton - AncientChess.com',
    author: 'AncientChess',
    tags: ['basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'fxqnvOj7Zdk',
    title: 'How To Play Chinese Chess (Xiangqi)',
    author: 'Gather Together Games',
    tags: ['basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: '_UTswVyBJSs',
    title: 'Learn to play CHINESE CHESS (XIANGQI) in 18 minutes!',
    author: 'Chess with Mustreader',
    durationMinutes: 18,
    tags: ['basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'Ggown7YN_qs',
    title: 'Xiangqi (Chinese Chess) for Absolute Beginners — Step-by-Step in English (Lesson 1)',
    author: 'Chinese Chess Out Loud',
    tags: ['basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'BdICTRAn-z8',
    title: 'My Favourite Way of Studying Xiangqi | Chinese Chess Tutorial',
    author: 'Xiangqi Chinese Chess',
    tags: ['basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'JVEZtlgiKDs',
    title: 'How Westerners Can Start Xiangqi (Best English Resources) w/ Foolish Commander',
    author: 'Chinese Chess Out Loud',
    tags: ['culture', 'basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: '-JcDYKAH26Q',
    title:
      'Xiangqi (Chinese Chess) Introduction: Part 1 Basic Introduction, Simple History, the Xiangqi Board',
    author: 'www.xqinenglish.com',
    tags: ['culture', 'basics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'qlslbnMZgIs',
    title: 'Offensive Xiangqi opening: Central Cannon opening',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: '5beHPTEFZtU',
    title: 'Xiangqi opening: Best response against Central Cannon opening',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'HOGPpwMyjoU',
    title: 'Xiangqi opening: How to utilize the Cannons?',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'fUa2AcXKAWc',
    title: 'Xiangqi opening: Why not capture the Soldiers immediately?',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: '950nyyjOirU',
    title: 'Basic Xiangqi Checkmate Strategies | Chinese Chess game tips for beginners',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'ZFy-Elwscbo',
    title: 'Advanced Xiangqi Checkmate Strategies | Chinese Chess game tips for beginners',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'vfVak5NY-3A',
    title: 'Xiangqi Cannon pin pattern: Rapid Central Soldier Attack',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'HNEvmd6MVy4',
    title: 'Win by Stalemate in Xiangqi (71)',
    author: 'Xiangqi for Chess Players',
    tags: ['endgames'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'dmSDt1VQNfs',
    title: 'Xiangqi (Chinese Chess) Basic Introduction to Endgame Compositions',
    author: 'www.xqinenglish.com',
    tags: ['endgames'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'uF3-KrlXprE',
    title: "2023 Xiangqi World Championship Men's Individual Final | Chinese Chess Game Commentary",
    author: 'Xiangqi Chinese Chess',
    tags: ['games'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'z0RsC-zr1qQ',
    title:
      '1997 Chinese National Xiangqi Championship Individual Final | Chinese Chess Game Commentary',
    author: 'Xiangqi Chinese Chess',
    tags: ['games'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'yyCFmc83rLs',
    title: 'WANG TIAN YI vs LIU DA HUA - Xiangqi Match - Learning Chinese Chess',
    author: 'Learning Chinese Chess',
    tags: ['games'],
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    id: 'VMvry99QA-I',
    title: 'Hu Rong Hua Best Xiangqi Match #1 - Learning Chinese Chess',
    author: 'Learning Chinese Chess',
    tags: ['games'],
    language: 'en',
    addedAt: '2026-07-10',
  },
];
