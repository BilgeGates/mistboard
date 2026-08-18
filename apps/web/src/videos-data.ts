// Curated video library data for /videos. Every YouTube entry was verified
// against YouTube's oembed endpoint (https://www.youtube.com/oembed?url=...) on
// the date in `addedAt`; `title` and `author` are the exact oembed values, so
// they stay verbatim even where they break house copy style (that covers the
// CJK titles below). English-language xiangqi is still the spine of this list;
// the zh section gives the site's Chinese locales a catalog of their own instead
// of Chinese chrome over English-only content.
//
// The library catalogs on four axes: topic (`tags`), difficulty (`level`), game
// (`variant`), and spoken `language`. Each entry declares its `source` — an
// external YouTube video or a first-party Mistboard-hosted one — as a
// discriminated union, so the render layer derives the watch URL and thumbnail
// per source rather than assuming YouTube everywhere. Add Mistboard how-tos and
// deep dives to MISTBOARD_VIDEOS.

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

// Spoken language of the video. Deliberately NOT the site `Locale`: speech and
// script are different axes, so one 'zh' covers Mandarin video for both the
// Simplified and Traditional locales. Locale to language is a mapping, never
// identity; it lives in videos.ts as an exhaustive switch. A new member here is
// a catalog decision first: it needs enough curated entries to earn a facet chip
// (see the language test in videos.test.ts), not just a union entry.
export type VideoLanguage = 'en' | 'zh';

// English first, then by catalog depth. The order drives the facet row.
export const VIDEO_LANGUAGES: readonly VideoLanguage[] = ['en', 'zh'];

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
  /** Spoken language, not subtitles: what a viewer has to understand to follow. */
  language: VideoLanguage;
  /** ISO date the entry was curated (and, for YouTube, oembed-verified). */
  addedAt: string;
  /** Ours. Orthogonal to `source`, which says where a video is HOSTED: our own
   *  episodes live on YouTube too, so hosting cannot identify them. First-party
   *  entries lead the library, because a page that sends every visitor to
   *  someone else's channel is not promotion. */
  firstParty?: boolean;
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

  // ── Chinese (Mandarin) ────────────────────────────────────────────────────
  // For /zh-hans and /zh-hant visitors, who until now got Chinese page chrome
  // over an all-English catalog. Curated to cover every topic tag rather than to
  // be exhaustive: the Chinese-language shelf is effectively bottomless, so the
  // bar here is a clear teaching frame and a channel with a track record, not
  // view count. `language` is 'zh' for both scripts (see VideoLanguage).
  {
    source: 'youtube',
    id: 'vE1TGi6QAWo',
    title:
      '【象棋教学】2分钟从零学象棋！初学者必看的影片！象棋vlog #7 Learn Chinese Chess in just 2 MINUTES!! Chinese Chess Vlog #7',
    author: 'KC Thien锦聪象棋',
    durationMinutes: 4,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: '90vfBo4J3fc',
    title: '【七分钟学会中国象棋】中国象棋规则、棋子、基本技巧及马、象走法限制教学',
    author: 'Zenden Goh',
    durationMinutes: 7,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'e_8iAlhvtt0',
    title: '【象棋教學】象棋初學者必看：棋子基本走法、棋盤、棋譜記錄｜Beginneros',
    author: '網上學習平台Beginneros',
    durationMinutes: 10,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'f0TszcBeWWg',
    title:
      '象棋玩法|從零開始|快來跟著老師認識有趣的棋盤與棋子！孩子的象棋入門課第01堂（趙奕帆象棋教學）',
    author: '趙奕帆象棋教學',
    durationMinutes: 34,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'eGe52Bcp08g',
    title:
      '【象棋教学】象棋布局秘密！象棋开局前面三步走什么？象棋vlog #43 XiangQi / Chinese Chess Opening Technique and Secret Vlog#43',
    author: 'KC Thien锦聪象棋',
    durationMinutes: 15,
    tags: ['openings'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'Sw2NmD0KE2M',
    title: '象棋必修课：顺炮开局要领第1讲，牢记这些棋理，棋力暴涨',
    author: '吾爱象棋',
    durationMinutes: 24,
    tags: ['openings'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'u0-YMk1ndqI',
    title: '胡榮華：象棋開局要領一',
    author: '雲淡風輕',
    durationMinutes: 57,
    tags: ['openings', 'strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'Fc-nKojaoI8',
    title:
      '【象棋教学】长盛不衰的象棋布局开局！五九炮对屏风马平炮兑车！象棋vlog #44 XiangQi/ Chinese Chess Opening Technique and Secret Vlog#44',
    author: 'KC Thien锦聪象棋',
    durationMinutes: 30,
    tags: ['openings'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'hBljfkvvLxs',
    title: '教你下棋核心技巧，不用背棋谱，抢占这5个位置，基本就赢了一半',
    author: '吾爱象棋',
    durationMinutes: 18,
    tags: ['strategy'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'ZxUA7c5xKWc',
    title: '象棋25大基本杀法，一条视频全覆盖！',
    author: '小斌说棋',
    durationMinutes: 17,
    tags: ['tactics'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'UMmwd_bfmfg',
    title: '3、中国象棋入门快易精（3）实用残局基本杀法',
    author: '雲淡風輕',
    durationMinutes: 60,
    tags: ['endgames', 'tactics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'DUv0OS1n1L4',
    title: '4、中国象棋入门快易精（4）实用残局',
    author: '雲淡風輕',
    durationMinutes: 60,
    tags: ['endgames'],
    level: 'intermediate',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'khNTfp_hzt4',
    title: '许银川血战王天一最精彩对决 罕见弃车火爆对攻 登峰造极致命一击',
    author: '京京讲棋',
    durationMinutes: 14,
    tags: ['games', 'tactics'],
    level: 'advanced',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
  },
  {
    source: 'youtube',
    id: 'Cc4Kl4e8-7I',
    title: '老梁看象：象棋的起源和江湖残局',
    author: '老梁',
    durationMinutes: 7,
    tags: ['culture'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'zh',
    addedAt: '2026-08-15',
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

/** Mistboard's own episodes. On YouTube (so the card and thumbnail derive the
 *  same way any YouTube entry does), flagged first-party so they lead the list.
 *  Titles are the exact oembed values, same rule as the curated entries. */
const MISTBOARD_CHANNEL_VIDEOS: readonly YoutubeVideo[] = [
  {
    source: 'youtube',
    id: 'aWxafeWsncQ',
    title: 'Chinese Chess (Xiangqi) for Chess Players: All the Rules in 6 Minutes',
    author: 'Mistboard',
    firstParty: true,
    durationMinutes: 6,
    tags: ['basics'],
    level: 'intro',
    variant: 'xiangqi',
    language: 'en',
    addedAt: '2026-08-18',
  },
];

/** The curated catalogue: other people's videos, filtered and faceted by the
 *  page. Deliberately does NOT include our own episodes — they have their own
 *  shelf above it, and mixing them in would double-render every card and shift
 *  every count and facet the page derives from this list. */
export const VIDEOS: readonly VideoEntry[] = [...YOUTUBE_VIDEOS, ...MISTBOARD_VIDEOS];

/** Ours, newest first. Rendered above the catalogue, never inside it. */
export const FIRST_PARTY_VIDEOS: readonly VideoEntry[] = MISTBOARD_CHANNEL_VIDEOS;
