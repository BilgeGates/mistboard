// Curated video library data for /videos. Every YouTube entry was verified
// against YouTube's oembed endpoint (https://www.youtube.com/oembed?url=...) on
// the date in `addedAt`; `title` and `author` are the exact oembed values, so
// they stay verbatim even where they break house copy style. English-language
// xiangqi first: this list is the seed for a lichess.org/video-style library
// and the future home for Mistboard's own videos.
//
// The library catalogs on three axes: topic (`tags`), difficulty (`level`), and
// game (`variant`). Each entry declares its `source` — an external YouTube video
// or a first-party Mistboard-hosted one — as a discriminated union, so the render
// layer derives the watch URL and thumbnail per source rather than assuming
// YouTube everywhere. Add Mistboard how-tos and deep dives to MISTBOARD_VIDEOS.

export type VideoTag =
  | 'basics'
  | 'openings'
  | 'tactics'
  | 'endgames'
  | 'strategy'
  | 'games'
  | 'culture';

export const VIDEO_TAGS: readonly VideoTag[] = [
  'basics',
  'openings',
  'tactics',
  'endgames',
  'strategy',
  'games',
  'culture',
];

// Difficulty axis, ordered easiest to hardest (the order drives the facet row).
export type VideoLevel = 'intro' | 'intermediate' | 'advanced';

export const VIDEO_LEVELS: readonly VideoLevel[] = ['intro', 'intermediate', 'advanced'];

// Which game the video is about. Everything is xiangqi today; `fog` is reserved
// for the Fog of War content lane so those videos have somewhere to land without
// a schema change. The variant facet only renders when more than one is present.
export type VideoVariant = 'xiangqi' | 'fog';

export type VideoSource = 'youtube' | 'mistboard';

interface VideoBase {
  /** Exact title (YouTube oembed value, or Mistboard's own title). */
  title: string;
  /** Channel / author name. */
  author: string;
  durationMinutes?: number;
  tags: readonly VideoTag[];
  level: VideoLevel;
  variant: VideoVariant;
  language: 'en';
  /** ISO date the entry was curated (and, for YouTube, oembed-verified). */
  addedAt: string;
}

/** An external YouTube video. Watch URL + thumbnail derive from `id`. */
export interface YoutubeVideo extends VideoBase {
  source: 'youtube';
  /** YouTube video id (the `v` query parameter). */
  id: string;
}

/** A first-party Mistboard-hosted video. Watch URL + thumbnail are explicit. */
export interface MistboardVideo extends VideoBase {
  source: 'mistboard';
  /** Stable slug: the entry key and (by convention) the /video/<slug> route. */
  slug: string;
  /** Where the card links (site-relative like `/video/<slug>`, or absolute). */
  url: string;
  /** 16:9 thumbnail image URL. */
  thumbnailUrl: string;
}

export type VideoEntry = YoutubeVideo | MistboardVideo;

/** Stable, source-namespaced key for dedupe and list rendering. */
export function videoKey(video: VideoEntry): string {
  return video.source === 'youtube' ? `yt:${video.id}` : `mb:${video.slug}`;
}

const YOUTUBE_VIDEOS: readonly YoutubeVideo[] = [
  {
    source: 'youtube',
    id: 'kSL7JErRMx8',
    title: 'Introduction to Chinese Chess (Xiangqi) How to Play - Rick Knowlton - AncientChess.com',
    author: 'AncientChess',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'fxqnvOj7Zdk',
    title: 'How To Play Chinese Chess (Xiangqi)',
    author: 'Gather Together Games',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: '_UTswVyBJSs',
    title: 'Learn to play CHINESE CHESS (XIANGQI) in 18 minutes!',
    author: 'Chess with Mustreader',
    durationMinutes: 18,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'Ggown7YN_qs',
    title: 'Xiangqi (Chinese Chess) for Absolute Beginners — Step-by-Step in English (Lesson 1)',
    author: 'Chinese Chess Out Loud',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'BdICTRAn-z8',
    title: 'My Favourite Way of Studying Xiangqi | Chinese Chess Tutorial',
    author: 'Xiangqi Chinese Chess',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'JVEZtlgiKDs',
    title: 'How Westerners Can Start Xiangqi (Best English Resources) w/ Foolish Commander',
    author: 'Chinese Chess Out Loud',
    tags: ['culture', 'basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: '-JcDYKAH26Q',
    title:
      'Xiangqi (Chinese Chess) Introduction: Part 1 Basic Introduction, Simple History, the Xiangqi Board',
    author: 'www.xqinenglish.com',
    tags: ['culture', 'basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'qlslbnMZgIs',
    title: 'Offensive Xiangqi opening: Central Cannon opening',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: '5beHPTEFZtU',
    title: 'Xiangqi opening: Best response against Central Cannon opening',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'HOGPpwMyjoU',
    title: 'Xiangqi opening: How to utilize the Cannons?',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'fUa2AcXKAWc',
    title: 'Xiangqi opening: Why not capture the Soldiers immediately?',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: '950nyyjOirU',
    title: 'Basic Xiangqi Checkmate Strategies | Chinese Chess game tips for beginners',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'ZFy-Elwscbo',
    title: 'Advanced Xiangqi Checkmate Strategies | Chinese Chess game tips for beginners',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'vfVak5NY-3A',
    title: 'Xiangqi Cannon pin pattern: Rapid Central Soldier Attack',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'HNEvmd6MVy4',
    title: 'Win by Stalemate in Xiangqi (71)',
    author: 'Xiangqi for Chess Players',
    tags: ['endgames'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'dmSDt1VQNfs',
    title: 'Xiangqi (Chinese Chess) Basic Introduction to Endgame Compositions',
    author: 'www.xqinenglish.com',
    tags: ['endgames'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'uF3-KrlXprE',
    title: "2023 Xiangqi World Championship Men's Individual Final | Chinese Chess Game Commentary",
    author: 'Xiangqi Chinese Chess',
    tags: ['games'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'z0RsC-zr1qQ',
    title:
      '1997 Chinese National Xiangqi Championship Individual Final | Chinese Chess Game Commentary',
    author: 'Xiangqi Chinese Chess',
    tags: ['games'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  {
    source: 'youtube',
    id: 'y-zY-16mlpM',
    title: 'Hu Rong Hua Best Xiangqi Match #2 - Learning Chinese Chess',
    author: 'Learning Chinese Chess',
    tags: ['games'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'VMvry99QA-I',
    // Double space after the dash is verbatim from oembed (re-checked 2026-07-22).
    title: 'Hu Rong Hua Best Xiangqi Match #1 -  Learning Chinese Chess',
    author: 'Learning Chinese Chess',
    tags: ['games'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-10',
  },
  // Batch 2 (2026-07-21): broader spread across strategy / intermediate /
  // advanced; each id re-verified against oembed, titles + authors verbatim.
  {
    source: 'youtube',
    id: 'JPtQY8YZIro',
    title: 'Xiangqi Lesson 1 -  Rules and Strategy for Chinese Chess',
    author: 'Xiangqi for Chess Players',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'vklqOLf6mtU',
    title: 'A Chess Player’s Guide to Xiangqi | How to Play Chinese Chess',
    author: 'Xiangqi Chinese Chess',
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'qbbFuWyx0XI',
    title: 'How To Play Chinese Chess (Xiangqi) In 60 Seconds!',
    author: 'Sam Copeland',
    durationMinutes: 1,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'MfwS9w0U47M',
    title: 'How to Play Xiangqi 象棋 (Chinese Chess) - in One Minute! - AncientChess.com',
    author: 'AncientChess',
    durationMinutes: 1,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'MyLXgkL4C5A',
    title: 'The Most Popular Openings in Xiangqi | An Intro to the Chinese Chess Opening',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'VpnbZU1z3Lg',
    title: 'Xiangqi Openings: Central Cannon',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: '_OTmXKa6JJ0',
    title: 'Central Cannon vs Screening Horses 101 | Chinese Chess Opening Strategies',
    author: 'Xiangqi Chinese Chess',
    tags: ['openings', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'oU-QtZ4pcGI',
    title: 'Looking for a Better Move | Chinese Chess Tutorial',
    author: 'Xiangqi Chinese Chess',
    tags: ['strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'ltn57_UWwgg',
    title: 'Xiangqi (Chinese Chess) Basic Midgame Tactics 100106 Checkmate and Kill',
    author: 'www.xqinenglish.com',
    tags: ['tactics', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'IlPoqOnM02c',
    title: 'Xiangqi Checkmate Strategies: Double Chariot',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics', 'endgames'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'pji0WSzB1Qw',
    title: 'Xiangqi Checkmate Strategies: Discovered Horse',
    author: 'Xiangqi Chinese Chess',
    tags: ['tactics'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'RzGPLnQgsIE',
    title: 'xiangqi(chinese chess) lesson-discard knight to 13 moves checkmate',
    author: 'chengdi shen',
    tags: ['tactics'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'coleAbKpFIg',
    title: '[Chinese Chess + Xiangqi] Endgame: Two Pawns Checkmate the General',
    author: 'Gà Cờ Tướng',
    tags: ['endgames'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'yZaxsHf2iaM',
    title: 'Legendary 1974 Xiangqi Match Xu vs Yang | Chinese Chess Game Commentary',
    author: 'Xiangqi Chinese Chess',
    tags: ['games', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: '3nX_4GoSwLo',
    title:
      "1990 Chinese National Individual Xiangqi Championship Men's Final | Chinese Chess Game Commentary",
    author: 'Xiangqi Chinese Chess',
    tags: ['games', 'strategy'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'RMGw9pKNvLM',
    title: 'Xiangqi (Chinese Chess) 2001 BGN Finals Game 1 Xu Yinchuan W Tao Hanming',
    author: 'www.xqinenglish.com',
    tags: ['games', 'strategy'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: '7cX3IPO3lQk',
    title: "2023 Asian Games Xiangqi Men's Individual Final | Chinese Chess Game Commentary",
    author: 'Xiangqi Chinese Chess',
    tags: ['games', 'strategy'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'MtyZ_qUNA0g',
    title: 'Xiangqi (Chinese Chess) Commentary 2003 A League Xu Yinchuan W Jiang Chuan',
    author: 'www.xqinenglish.com',
    tags: ['games', 'strategy'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
  {
    source: 'youtube',
    id: 'gkD29aQW3Vw',
    title: 'The Four Types of Chinese Chess Players | Xiang Qi 101',
    author: 'Foolish Commander',
    tags: ['culture'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-07-21',
  },
];

// First-party Mistboard videos (how-tos, game deep dives). Empty until the first
// one is produced; the render path is source-dispatched and unit-tested, so a new
// entry here shows up on /videos immediately with an internal link + its own
// thumbnail + a "Made by Mistboard" badge. Shape, for reference:
//   {
//     source: 'mistboard',
//     slug: 'fog-of-war-first-game',
//     url: '/video/fog-of-war-first-game',
//     thumbnailUrl: '/img/videos/fog-of-war-first-game.jpg',
//     title: 'Your first Fog of War game',
//     author: 'Mistboard',
//     tags: ['basics'],
//     level: 'intro',
//     variant: 'fog',
//     language: 'en',
//     addedAt: '2026-07-21',
//   }
const MISTBOARD_VIDEOS: readonly MistboardVideo[] = [];

export const VIDEOS: readonly VideoEntry[] = [...YOUTUBE_VIDEOS, ...MISTBOARD_VIDEOS];
