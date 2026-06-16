// Article localization (zh-Hans / zh-Hant).
//
// Model: the English Article in articles-data.ts is the single structural source
// of truth. A translated render is produced by deep-cloning the article and
// substituting any string that appears as a key in the per-language dictionary.
// Board geometry (squares, piece roles, orientation, arrows) never matches a key,
// so only human-readable content (title, summary, headings, prose, board labels,
// CTA labels) is swapped. No duplicated structure → no drift when the English
// article changes shape.
//
// Dictionaries are authored from docs-private/translation-experiment-dark-chess-zh.md
// (head term 迷雾国际象棋 / 迷霧國際象棋 validated against the zh chess-variant
// community; Traditional carries the Taiwan lexical forks, not a glyph conversion).
import type { Article } from './articles-data.js';

export type ArticleLang = 'zh-Hans' | 'zh-Hant';

export const ARTICLE_LANGS: ArticleLang[] = ['zh-Hans', 'zh-Hant'];

// URL prefix per language. `/zh-hans/articles/<slug>`, `/zh-hant/articles/<slug>`.
export const ARTICLE_LANG_PREFIX: Record<ArticleLang, string> = {
  'zh-Hans': '/zh-hans',
  'zh-Hant': '/zh-hant',
};

const ZH_HANS: Record<string, string> = {
  // -- Mini Xiangqi (rules) --
  'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.':
    '迷你象棋规则，迷雾迷你象棋的 7×7 入门基础：没有士象、没有河界、兵可横走，以将死取胜。',
  'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. It is a simplified, reduced version of [xiangqi](/rules/xiangqi): a smaller board, fewer pieces, and no river.':
    '迷你象棋由日本大阪的楠本茂信于 1973 年发明。它是[象棋](/rules/xiangqi)的简化精简版本：棋盘更小、棋子更少，且没有河界。',
  'This page describes the open-information base game.': '本页介绍的是信息公开的底层游戏。',
  'Board and setup': '棋盘与布局',
  'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.':
    '迷你象棋是把象棋压缩到 7×7 棋盘、并削减子力的版本。去掉了士和象，也没有河界，但每一方的将帅仍保有一个 3×3 的九宫。',
  'Piece movement': '棋子走法',
  'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).':
    '除兵（卒）以外，每种棋子的走法都与[象棋](/rules/xiangqi)完全相同。',
  '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.':
    '**兵（卒）：**兵向前或横向走一个交叉点并以此吃子，永不后退。由于没有河界可过，它从第一步起就拥有横走的自由，这与完整象棋棋盘上的兵不同。',
  'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.':
    '将帅对脸在这里同样不合法。双方的将帅不能处在中间无子的同一条纵线上，因此任何会暴露这条直线的走法都不被允许。',
  'Winning and draws': '胜负与和棋',
  'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.':
    '将死即获胜。与象棋一样，没有合法走法的一方判负，而非因困毙而和棋；长将或长捉也不能用来免费求和：不断重复同样进攻的一方反而判负。',
  'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.':
    '当任何一方都没有足够的子力将死对方、长时间无吃子（象棋对此设有上限，类似国际象棋的五十回合规则），或出现不违反上述长打规则的重复局面时，对局判和。这些结果都由局面决定，而非某一方主动选择停手。',
  'A complete game': '一盘完整对局',
  'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.':
    '迷你象棋没有著名的人类对局传统，因此若想看全部子力协同作战，可以逐步重演一盘由强大的开源引擎 Fairy-Stockfish 在完全信息下执双方对弈的棋局。注意车和炮开线有多快：在紧凑、无河界的 7×7 棋盘上，将帅遭受火力的时间远比完整象棋来得早。',
  'Mini Xiangqi is the open-information base game. Dark Mini Xiangqi adds Fog of War, where enemy pieces outside your vision disappear and the general falls by capture rather than checkmate.':
    '迷你象棋是信息公开的底层游戏。迷雾迷你象棋为它加上战争迷雾：你视野之外的敌方棋子会消失，且将帅由被吃而非将死而落败。',
  'Read Dark Mini Xiangqi': '阅读迷雾迷你象棋',
  Xiangqi: '象棋',

  // -- Dark Mini Xiangqi (rules) --
  'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.':
    '战争迷雾下的迷你象棋：在 7×7 棋盘上，每一方只能看到己方棋子可及的交叉点，将帅由被吃而落败。',
  '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.':
    '在战争迷雾下进行的[迷你象棋](/rules/mini-xiangqi)：每位玩家只能看到己方棋子，以及己方子力可及的敌方棋子。棋盘为 7×7，以吃掉对方将帅结束对局。如果你已经会下迷你象棋，下面各节只讲解迷雾改变了什么。',
  'Board and fog': '棋盘与迷雾',
  'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.':
    '棋盘和子力与迷你象棋相同。战争迷雾随后遮住棋盘：你能看到己方棋子以及它们可及的每个交叉点，其余一切都是迷雾。',
  'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.':
    '从三个视角看开局局面。红方与黑方各自只能清楚看到自己的一侧，而中间由服务器掌握真实棋盘。每走一步后视野都会重新计算，因此打开一条线路或失去一枚棋子都会立刻改变各方所掌握的信息。',
  'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.':
    '你永远看不到视野之外的敌方棋子，也看不到被迷雾遮住的交叉点是否为空，更看不到被遮蔽的阻挡子是什么。',
  'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.':
    '吃掉将帅即获胜。没有将死，也没有将军提示，因此你可以走入危险、让自己的将帅暴露，甚至让双方将帅在一条无遮挡的纵线上对脸。',
  "There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player's view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.":
    '这里没有困毙判和：若轮到走子的一方没有合法着法，则判负。由于没有将军来限制你，这种情况几乎不会发生。和棋依据真实局面判断，而非任何一方各自的视野：对局会在三次重复局面时判和，也会在连续 60 个半回合（双方各 30 回合）无吃子时判和。',
  'Two pieces interact with fog in ways worth seeing up close.':
    '有两种棋子与迷雾的互动值得近距离一看。',
  'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is shown with a marker.':
    '炮吃子时正好越过一个炮架，落在其后的第一枚敌方棋子上。在迷雾下，规则是**炮架被遮、目标可见**：炮架显示为被占据但身份不明，其后的空隙仍处于迷雾中，而可吃的目标则会带有标记显示出来。',
  Horses: '马',
  'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.':
    '马先沿横竖方向走一个交叉点，再斜向外走一个交叉点；如果中间的马腿位置被占据，它就不能走。如果有一枚隐藏的棋子蹩住马腿，马腿位置会显示为被占据但身份不明，其后的落点则从你的视野中消失。',
  'A complete game under fog': '一盘迷雾下的完整对局',
  'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty 1.0, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.':
    '想看全部子力在战争迷雾下协同作战，可以逐步重演一盘由 Mistboard 引擎 Misty 1.0 执双方对弈的棋局。每一手都以三种方式呈现：红方所见、服务器上的真实棋盘，以及黑方所见。',
  'Dark Mini Xiangqi is open for alpha play. You can play Misty, create an invite, or find an opponent from the homepage play panel by choosing Dark Mini Xiangqi in the Variant row.':
    '迷雾迷你象棋现已开放 Alpha 对弈。你可以在首页对弈面板的“Variant”一行选择迷雾迷你象棋，然后对战 Misty、创建邀请，或寻找对手。',
  'Play Misty': '对战 Misty',
  'Create invite': '创建邀请',

  // -- Shogi4 (4x4 Shogi) --
  'Shogi4 (4×4 Shogi) Rules': 'Shogi4（4×4 将棋）规则',
  "The complete rules of Shogi4 (4x4 Shogi), Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.":
    'Shogi4（4×4 将棋）的完整规则，由 Oca Studios 发布并进入公有领域的 4×4 棋盘动物打入将棋：鲤鱼、貘、狸、狐与王的走法，以及跳越友子、进化、打入与吃王取胜。',
  "Shogi4, also called 4x4 Shogi, is a drop-shogi played with animal tiles on a 4×4 board. It plays much like ordinary shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces switch sides and drop back into play, and you win by taking the king. The one rule shogi players won't recognize is that a piece may hop over a friendly piece, added so your own pieces don't jam each other on a board this small.":
    'Shogi4（又称 4×4 将棋）是一种在 4×4 棋盘上用动物棋子进行的打入将棋。它玩起来很像缩小到十六格的普通将棋：棋子按棋面标示的方向走动，被吃的棋子改换阵营并可重新打入棋盘，吃掉王即获胜。唯一一条将棋玩家会感到陌生的规则是：棋子可以跳越一枚己方棋子，这是为了避免在这么小的棋盘上自己的棋子互相堵塞而加入的。',
  'Oca Studios released Shogi4 into the public domain in its "Four" series, free as a print-and-play set and as an app. Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal (a Crane for the first player, a Pheasant for the second).':
    'Oca Studios 在其「Four」系列中将 Shogi4 发布到公有领域，作为可打印自玩的套装和应用免费提供。每位玩家有五枚棋子：鲤鱼、貘、狸、狐，以及一枚王（先手为鹤，后手为雉）。',
  'The board and setup': '棋盘与摆子',
  "The board is 4×4, with a farm to either side that holds captured pieces. A tile's owner is shown by its facing: the first player's tiles point up the board, the second player's point down.":
    '棋盘为 4×4，两侧各有一个农场用来存放被吃的棋子。棋子的归属由朝向表示：先手的棋子朝向棋盘上方，后手的朝向下方。',
  'Every piece moves one square per turn, in the directions printed on its tile. On reaching the far row, each non-royal piece evolves, flipping to its evolved side. The pairs below show the base piece, then its evolved form, with a dot on every square each can reach (forward is up).':
    '每枚棋子每回合走一格，方向按棋面所印。到达最远一行时，每枚非王棋子都会进化，翻到其进化面。下面每一对依次展示基础棋子及其进化形态，并在各自能到达的每个格子上标一个点（上方为前进方向）。',
  '**Carp → Koi.** The Carp steps one square straight forward, a pawn. It evolves into a Koi, which moves as a silver from shogi.':
    '**鲤鱼 → Koi。**鲤鱼向正前方走一格，相当于将棋中的步兵。它进化为 Koi，走法与将棋中的银将相同。',
  '**Tapir → Baku.** The Tapir steps forward or to a forward diagonal. It evolves into a Baku, a silver.':
    '**貘 → Baku。**貘向前方或前斜方走一格。它进化为 Baku，走法同银将。',
  '**Raccoon-dog → Tanuki.** The Raccoon-dog steps one diagonal. It evolves into a Tanuki, a silver.':
    '**狸 → Tanuki。**狸向斜方走一格。它进化为 Tanuki，走法同银将。',
  '**Fox → Kitsune.** The Fox steps one orthogonal. It evolves into a Kitsune, which moves as a gold from shogi.':
    '**狐 → Kitsune。**狐向横竖方向走一格。它进化为 Kitsune，走法与将棋中的金将相同。',
  '**Crane / Pheasant.** The royal steps one square in any of the eight directions, a king. The two royals differ only in theme. It never evolves, and capturing it ends the game.':
    '**鹤 / 雉。**王可向八个方向中的任意一个走一格，相当于国际象棋的王。两种王仅在主题上不同。它永不进化，被吃掉即终局。',
  'Jumping over a friendly piece': '跳越友方棋子',
  'A piece can leap over a friendly piece. If an ally sits on the next square in a direction the piece moves, the piece jumps it and lands on the square just beyond, empty or capturing an enemy there. It works in any direction the piece itself moves: straight for a Carp, on the diagonal for a Raccoon-dog, any of the eight for the royal.':
    '棋子可以跳越一枚己方棋子。如果在该棋子可走的某个方向上、紧邻的格子里有一枚友方棋子，它便可越过这枚棋子，落到再往前的那一格上：该格可以为空，也可以吃掉那里的敌方棋子。这适用于棋子本身能走的任意方向：鲤鱼沿直线，狸沿斜线，王则可沿八个方向中的任意一个。',
  'Capturing, farms, and drops': '吃子、农场与打入',
  'Move onto an enemy to capture it; it switches sides into your farm, reverting to its base form if it was evolved.':
    '走到敌方棋子所在的格子即可吃掉它；它会改换阵营进入你的农场，若此前已进化，则恢复为基础形态。',
  "Instead of moving, drop a piece from your farm onto any empty square, except those on the far row (the opponent's back rank).":
    '你也可以不走子，而是从农场中取出一枚棋子打入任意空格，但最远一行（对方底线）除外。',
  Winning: '取胜',
  'Capturing the royal is the only way to win. No check, no checkmate: the game ends the moment a royal is taken.':
    '吃掉王是唯一的取胜方式。没有将军，也没有将死：王一旦被吃，对局立即结束。',
  'There is no stalemate. Because moving the king into capture range is legal, a lack of safe moves never ends the game: you simply make the unsafe move and play on until a king is taken. A side with no legal move at all, boxed in with nothing to drop, loses rather than draws.':
    '不存在逼和。由于把王走入可被吃的范围是合法的，缺少安全着法绝不会结束对局：你只管走那步不安全的棋，继续对弈，直到有一方的王被吃。若一方完全没有合法着法（被困住且无子可打入），则判负，而非和棋。',
  'Repetition and draws': '重复与和棋',
  "The original rules address neither repetition nor a move-count limit. Our convention fills the gap: a position reached three times is an automatic draw. That rule is ours, not Oca's, and changes none of the rules above.":
    '原始规则既未规定重复局面，也未规定步数上限。我们的约定补上了这一空缺：同一局面出现三次即自动判和。这条规则是我们定的，并非 Oca 的，且不改变上述任何规则。',
  "Fairy-Stockfish self-play on the friendly-jump engine (this site's patched build). White wins in 73 plies; the mating move is itself a friendly jump.":
    'Fairy-Stockfish 在支持越友规则的引擎（本站修补版）上进行的自我对弈。白方在 73 个半回合内取胜；制胜的那一步本身就是一次跳越友子。',
  'Starting position': '初始局面',
  'Source and license': '来源与许可',
  'Shogi4 and its tile art are by Oca Studios, which released its whole "Four" series into the public domain. The [BoardGameGeek entry](https://boardgamegeek.com/boardgame/146291/shogi4) is a catalog reference.':
    'Shogi4 及其棋子美术由 Oca Studios 创作，该工作室已将其整个「Four」系列发布到公有领域。[BoardGameGeek 条目](https://boardgamegeek.com/boardgame/146291/shogi4)可作为目录参考。',
  "We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read the move logic directly: the friendly-jump geometry, the single drop ban, and king-capture as the sole win all come from there. Oca's public rules page and starting-position graphic (now reachable only through the [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/), since the live site is down) corroborate the board and the basic moves.":
    '我们通过反编译 Oca 官方的 Shogi4 应用、直接读取其走子逻辑，还原出了确切的规则：跳越友子的几何规则、唯一的打入禁区，以及以吃王作为唯一取胜方式，都来自于此。Oca 的公开规则页面和初始局面图（由于其网站已关闭，现在只能通过 [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/) 访问）也印证了棋盘和基本走法。',
  'Playing Shogi4': '开始游玩 Shogi4',
  "Shogi4 isn't playable on the site yet; for now this page is the rules reference. Browse the rest of the rules, or compare it with the chess and xiangqi primers.":
    'Shogi4 目前还不能在本站对弈；现阶段本页作为规则参考。你可以浏览其余规则，或将它与国际象棋和象棋入门相互对照。',

  // -- Dark Draft960 --
  'Dark Draft960': '迷雾选阵960',
  "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.":
    '带密封开局选阵的迷雾国际象棋：每位玩家从三种国际象棋960 底线阵型中选择一种，且永远看不到对方的选择。',
  'The draft': '选阵',
  "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.":
    '服务器为每位玩家发出三种随机的国际象棋960 底线阵型。你从中选一种，对手也各自从自己的三种中选一种。双方的选阵都是密封的：任何一方都看不到对方的候选阵型或最终选择。',
  "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.":
    '假设双方都选了候选 A。每一方只能看到自己的底线阵型，对方的则隐藏在迷雾中。只有服务器同时掌握双方的阵型。',
  '960 × 960 = **921,600** possible starts. Standard chess is one of them.':
    '960 × 960 = **921,600** 种可能的开局。标准国际象棋只是其中之一。',
  'Dark Draft960 is a future variant, not playable yet. There is no set release date.':
    '迷雾选阵960 是一个未来的变体，目前尚不可对弈，也没有确定的发布日期。',

  // -- Xiangqi primer (rules) --
  'Xiangqi Rules': '象棋规则',
  'Standard xiangqi rules, the primer behind Dark Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.':
    '标准象棋规则，迷雾象棋的入门基础：九宫、楚河汉界、炮架、将帅对脸，以及一盘可供逐步重演的名局。',
  '[Xiangqi](https://en.wikipedia.org/wiki/Xiangqi), or Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).':
    '[象棋](https://en.wikipedia.org/wiki/Xiangqi)（中国象棋）是一种双人策略游戏，其根源可追溯到中国数百年乃至更久以前。它的现代形式（包括炮在内）大约在宋代（960 至 1279 年）成形。',
  'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.':
    '红黑双方轮流走子，红方先行。每一方开局有 16 枚棋子：一个将（帅）、两个士（仕）、两个象（相）、两个马、两个车、两个炮（砲）和五个兵（卒）。目标是将死对方的将帅。',
  'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares.':
    '棋盘有 9 条纵线和 10 条横线，但棋子落在线的交叉点上，而不是格子内。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.":
    '**九宫**是每一方底线一侧的 3×3 区域。将帅与士仕必须留在己方九宫之内。**楚河汉界**将棋盘分为两半。象（相）不能过河，而兵（卒）过河之后可以横向走子。',
  "A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon's capturing jump is the only exception. The pieces are listed below in the traditional order.":
    '棋子通过落在敌方占据的交叉点上来吃子，而任何棋子都不能穿过被占据的交叉点。炮的吃子跳跃是唯一的例外。下面按传统顺序列出各棋子。',
  '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.':
    '**将（帅）：**横向或纵向走一个交叉点，永远不能离开己方九宫。双方的将帅不能在中间无子的同一条纵线上对脸：任何让这条直线暴露出来的走法都是不合法的。实际上，将帅就像一只车那样守住它正前方的纵线。',
  '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.':
    '**士（仕）：**斜向走一个交叉点，与将帅一样必须留在九宫之内。',
  "**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant's eye, blocks the move.":
    '**象（相）：**沿斜线正好走两个交叉点（俗称「象走田」），且不能过河，因此它永远不会离开己方半边。它不能跳越：如果斜线中点（象眼）上有棋子，这步走法就被挡住。',
  "**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse's leg, is occupied, the horse cannot move in that direction.":
    '**马：**先沿横竖方向走一个交叉点，再斜向外走一个交叉点，走「日」字，类似国际象棋的马，但它不能跳越。如果它经过的那个横竖交叉点（马腿）被占据（蹩马腿），马便不能朝那个方向走。',
  '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.':
    '**车：**横向或纵向走任意距离，不能越子，与国际象棋的车完全相同。它是棋盘上最强的棋子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.':
    '**炮（砲）：**不吃子时走法与车相同。吃子时，它正好越过一枚棋子（不分敌我），这枚棋子称为炮架，并落在其后的一枚敌方棋子上。',
  '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.':
    '**兵（卒）：**向正前方走一个交叉点，永不后退。过河之后，它还可以横向走一个交叉点。它不会升变。',
  'Check, checkmate, and endings': '将军、将死与终局',
  'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.':
    '当敌方棋子攻击将帅时，即为将军，被将军的一方必须应对这一威胁。如果没有合法的应法，便是将死，被将军的一方告负。',
  'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.':
    '完全没有合法走法的一方同样告负。这与西洋的国际象棋相反，在那里没有合法走法算作逼和（和棋）。',
  'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.':
    '象棋还限制无止境的逼着循环。长将与长捉是不允许的：一方若不断重复同样的进攻，将被判负，而不能借此逼和。比赛规则对何时算作「长」给出了详细的重复判定程序。',
  'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.':
    '当任何一方都没有足够的子力将死对方、出现不违反上述规则的重复局面，或长时间无吃子时，对局判和。无吃子的上限取决于所采用的规则：世界象棋联合会的规则采用五十回合规则，而中国象棋协会（CXA）的规则则要求至少 60 个半回合之后才能提出和棋。',
  "To see the pieces work together in a real game, step through this 1990 championship between two of xiangqi's greatest grandmasters. Playing Black, Liu Dahua checkmates Hu Ronghua, the most dominant champion of the era, in 31 moves.":
    '想看棋子在实战中如何协同，可以逐步重演这盘 1990 年、由两位象棋顶尖特级大师对弈的冠军赛。执黑的柳大华用 31 个回合将死了那个时代最具统治力的冠军胡荣华。',
  'Xiangqi is the open-information base game. Add Fog of War for dark xiangqi, where enemy pieces outside your vision disappear and the general falls by capture. Or try the compact board.':
    '象棋是信息公开的底层游戏。为它加上战争迷雾，便得到迷雾象棋：你视野之外的敌方棋子会消失，而将帅由被吃而落败。或者也可以试试更紧凑的棋盘。',
  'Mini Xiangqi': '迷你象棋',
  'Dark Mini Xiangqi': '迷雾迷你象棋',

  // -- Chess primer --
  'Chess Rules': '国际象棋规则',
  'Standard chess rules, the primer behind Dark Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.':
    '标准国际象棋规则，迷雾国际象棋的入门基础：王车易位、升变、吃过路兵、和棋规则，以及一盘可供逐步重演的名局。',
  'Chess is a two-player strategy game played for centuries. It descends from the Indian game chaturanga of around the 6th century and reached Europe through Persia and the Islamic world; its modern form, with the long-range queen and bishop, took shape in Europe in the late 1400s.':
    '国际象棋是一种已有数百年历史的双人策略游戏。它源自约公元 6 世纪的印度游戏恰图兰加，经由波斯和伊斯兰世界传入欧洲；其现代形式（拥有远程的后和象）于 15 世纪末在欧洲成形。',
  'Board setup': '棋盘布置',
  'Chess is played on an 8 by 8 board of alternating light and dark squares.':
    '国际象棋在 8×8 的棋盘上进行，棋盘由深浅相间的方格组成。',
  'White moves first, then players alternate. Each side fills the two rows nearest it, with the queen starting on her own color. On your turn, move one piece to a legal square: you cannot land on your own piece, and landing on an enemy piece captures it, removing it from the board.':
    '白方先走，之后双方轮流走子。每一方在最靠近自己的两排摆满棋子，后摆在与自身同色的格子上。轮到你时，将一枚棋子走到一个合法的格子：你不能落在自己的棋子上，而落在敌方棋子上即可将其吃掉，并把它从棋盘上移走。',
  'Each piece moves in its own way. In every diagram below, the highlighted squares are the legal moves and captures for the marked white piece.':
    '每种棋子都有各自的走法。在下面每一幅图中，高亮的格子表示被标记的白方棋子的合法走法与吃子。',
  '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.':
    '**王：**可向任意方向走一格。在普通国际象棋中，王不能走到被对方攻击的格子上。',
  '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.':
    '**后：**可沿横线、竖线或斜线走任意格数。其他棋子会挡住它的去路。',
  '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.':
    '**车：**可沿横线或竖线走任意格数。它不能跳子，因此一条线上第一个被占据的格子就会挡住它。',
  '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.':
    '**象：**可沿斜线走任意格数。由于斜线始终保持同一种颜色，每个象在整盘棋中都只走浅色格或只走深色格。',
  '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.':
    '**马：**走「L」形：朝一个方向走两格，再横向走一格。马是唯一能跳过其他棋子的棋子。',
  '**Pawn:** the pawn moves and captures differently from every other piece. It moves straight forward into an empty square, one square at a time, or two squares from its starting position. It can never move backward or sideways, and a piece directly in front of it blocks it completely. It captures only diagonally forward, one square (the green rings below), never straight ahead. Two further pawn rules, promotion and en passant, appear under Special moves below.':
    '**兵：**兵的走法和吃法与其他所有棋子都不同。它向正前方走入一个空格，每次一格，或在起始位置时一次走两格。它永远不能后退或横走，正前方若紧挨着一枚棋子便会被完全挡住。它只能向斜前方吃子，一格（见下图的绿色圆环），绝不向正前方吃子。另有两条与兵有关的规则：升变与吃过路兵，见下文的「特殊走法」。',
  'Check and checkmate': '将军与将死',
  'In regular chess, the king is protected by check and checkmate. A king is **in check** when an enemy piece attacks it. The checked player must make a legal move that leaves the king safe.':
    '在普通国际象棋中，王受到将军与将死规则的保护。当敌方棋子攻击王时，王即处于**被将军**的状态。被将军的一方必须走一步合法着法，使王重新安全。',
  'Most checks are answered in one of three ways: move the king, block the line of attack, or capture the attacking piece. If none of those legal answers works, the game ends by **checkmate**.':
    '应对将军通常有三种方法：移动王、挡住攻击线路，或吃掉发动攻击的棋子。如果这些合法应法都行不通，对局便以**将死**告终。',
  'In regular chess the king is never actually captured: the game ends at checkmate, with the king still on the board.':
    '在普通国际象棋中，王从不会真的被吃掉：对局在将死时结束，此时王仍留在棋盘上。',
  'Special moves': '特殊走法',
  'Castling is a one-move king-and-rook move. The king moves two squares toward a rook, and that rook moves to the square the king crossed. In regular chess, the pieces must be unmoved, the path must be empty, and the king cannot castle out of, through, or into check.':
    '王车易位是一步同时移动王和车的走法。王朝着一只车的方向走两格，那只车则移动到王越过的格子上。在普通国际象棋中，参与易位的王与车此前都不能动过，中间的格子必须为空，且王不能在被将军时易位、不能穿过被攻击的格子易位，也不能易位到被攻击的格子上。',
  'Queenside castling works the same way on the other side: the king moves two squares toward the rook, and the rook lands next to it.':
    '后翼易位在另一侧以同样方式进行：王朝着车走两格，车则落到王的旁边。',
  Promotion: '升变',
  'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight.':
    '当兵到达最远的一条横线时，它会升变为后、车、象或马。',
  'En passant is the unusual pawn capture. If an enemy pawn moves two squares from its starting rank and lands beside your pawn, your pawn may capture it diagonally as if it had moved only one square. This chance exists only on the very next move.':
    '吃过路兵是一种特殊的兵吃子。如果敌方的兵从起始横线一次走两格，并停在你的兵旁边，你的兵可以斜向吃掉它，就好像它只走了一格一样。这个机会只在紧接着的下一步存在。',
  'Not every game is won. Some end in a draw, where neither side wins.':
    '并非每盘棋都分出胜负。有些以和棋告终，即双方都不获胜。',
  Stalemate: '逼和',
  'Stalemate is when the player to move has no legal move but their king is not in check. It is a draw, not a win, even if one side is far ahead. Below it is Black to move: the king on a8 is not in check, yet every square it could step to is covered by the white queen, and Black has nothing else to move. The game is drawn.':
    '逼和是指轮到走子的一方没有任何合法着法，但其王并未被将军。它判作和棋，而非取胜，即使一方大占优势也是如此。下图轮到黑方走子：a8 的王没有被将军，但它能走到的每一个格子都被白后控制，而黑方又无其他棋子可走。对局判和。',
  'Other draws': '其他和棋',
  '**Threefold repetition:** the same position, with the same player to move, occurs three times. Either player can then claim a draw.':
    '**三次重复局面：**同一局面在同一方走子的情况下出现三次。此时任一方都可以提出和棋。',
  '**Fifty-move rule:** fifty moves by each side pass with no capture and no pawn move. The clock resets whenever a pawn moves or a piece is taken.':
    '**五十回合规则：**双方各走五十回合而无任何吃子、也无任何兵的走动。每当有兵走动或有棋子被吃，计数便重新归零。',
  '**Insufficient material:** neither side has enough force to deliver checkmate, such as king versus king, or king and a lone bishop or knight against a bare king.':
    '**子力不足：**任何一方都没有足够的子力完成将死，例如单王对单王，或一王加单象或单马对单王。',
  '**Agreement:** both players simply agree to a draw.': '**协议和棋：**双方直接同意作和。',
  'A famous game': '一盘名局',
  'To see the pieces work together in a real game, step through Game 11 of the 2014 World Championship in Sochi. Playing White, Magnus Carlsen grinds down Viswanathan Anand in a Berlin endgame to clinch the title; Anand resigns on move 45.':
    '想看棋子在实战中如何协同，可以逐步重演 2014 年索契世界冠军赛的第 11 局。执白的马格努斯·卡尔森在柏林防御残局中逐步磨垮维斯瓦纳坦·阿南德，锁定冠军；阿南德在第 45 回合认输。',
  'Where to next': '接下来去哪',
  'Chess is the open-information base game. Add Fog of War for dark chess, where enemy pieces outside your vision disappear and the king falls by capture.':
    '国际象棋是信息公开的底层游戏。为它加上战争迷雾，便得到迷雾国际象棋：你视野之外的敌方棋子会消失，而王由被吃而落败。',
  'Read Dark Chess': '阅读迷雾国际象棋',
  'All rules': '全部规则',

  // title + summary
  'Dark Chess (Fog of War) Rules': '迷雾国际象棋规则',
  'Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.':
    '战争迷雾下的国际象棋：每一方只能看到己方棋子可及的格子，没有将军提示，王被吃掉即负。',
  'Is dark chess the same as fog of war chess?': '迷雾国际象棋和「暗棋」是同一种游戏吗？',
  'Yes. "Dark chess" and "fog of war chess" are two names for this same variant: hidden-information chess where you see only the squares your pieces reach. It is sometimes confused with [banqi](https://en.wikipedia.org/wiki/Banqi), the Chinese game also nicknamed "dark chess," which plays with xiangqi pieces turned face-down. That is a different game.':
    '不是。迷雾国际象棋（英文 dark chess / fog of war chess）是隐藏信息的国际象棋：你只能看到己方棋子可及的格子。它有时会和[暗棋](https://en.wikipedia.org/wiki/Banqi)（一种将象棋棋子翻面的中国游戏）混淆，但两者是不同的游戏。',
  'Dark Chess Concepts': '迷雾国际象棋概念',
  'Strategy concepts for dark chess: how to read fogged squares, pawn signals, vanished moves, and capture clues after you know the rules.':
    '迷雾国际象棋的策略概念：在理解规则之后，学习如何解读迷雾格、兵的信号、消失的走法和吃子线索。',
  // section headings
  'The starting position': '开局局面',
  'What you see': '你能看到什么',
  'Win condition: king capture': '胜负条件：吃王',
  Draws: '和棋',
  'Edge cases': '特殊情形',
  'Reading the fog': '读懂迷雾',
  'A sample game': '一盘示例对局',
  'Try it': '上手一试',
  'What to do with partial proof': '如何处理不完整的证据',
  // sub-headings
  Castling: '王车易位',
  'Pawn vision': '兵的视野',
  'En passant': '吃过路兵',
  'Pawn moves': '兵的走动',
  Captures: '吃子',
  // paragraphs (markdown links preserved; link text translated, URLs kept)
  "[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.":
    '[迷雾国际象棋](https://en.wikipedia.org/wiki/Dark_chess)（又称「战争迷雾」）由 Jens Bæk Nielsen 与 Torben Osted 于 1989 年发明。它属于「隐式迷雾」的一支：没有裁判，也没有侦察动作。每一方的视野完全由己方棋子的合法走法范围推导而来。',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷雾国际象棋不只关乎你看得见的棋子。被迷雾遮住的格子、消失的目的地和不见的棋子本身也是信息。这个概念系列从最有用的习惯开始：读懂迷雾正在告诉你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通国际象棋规则](https://zh.wikipedia.org/zh-hans/国际象棋规则)）可以合法走到的格子，以及棋子当前所在的格子。其余一切都笼罩在迷雾之中。',
  "Here's the same rule, piece by piece.": '同一条规则，逐子来看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '视野随棋子移动。当一个棋子走动时，它原先覆盖的格子会重新陷入黑暗（除非另有棋子仍能看到它们），而它新触及的格子则会亮起。',
  "Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece's vision ends where its movement ends.":
    '注意 d7 的车能看到 b7 的后和 h7 的王，却看不到 a7。棋子的视野止于它走法的尽头。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '当一方的王被吃掉时，对局即告结束。没有将军，没有将死，也没有任何预警。',
  "Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. There is no stalemate draw and no insufficient-material draw.":
    'Mistboard 会在三次重复局面（同一真实局面出现三次，且轮到走子的一方相同、王车易位权与吃过路兵权也相同）或五十回合规则（连续五十个回合无兵的走动、也无吃子）时自动判和。两条规则都针对真实局面，而非任何一方各自的视野。这里没有逼和，也没有子力不足判和。',
  "Games auto-draw on threefold repetition (same position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. No stalemate, no insufficient-material draw.":
    '对局会在三次重复局面（同一局面出现三次，且轮到走子的一方相同、王车易位权与吃过路兵权也相同）或五十回合规则（连续五十个回合无兵的走动、也无吃子）时自动判和。两条规则都针对真实局面，而非任何一方各自的视野。这里没有逼和，也没有子力不足判和。',
  'A king may castle out of, through, or into check.':
    '王可以在被将军时易位，可以穿过被攻击的格子易位，也可以易位到被攻击的格子上。',
  'Pawns see forward push squares when those squares are empty. They see diagonal squares only when an enemy piece is actually there to capture.':
    '兵在前方格为空时能看到可推进的格子。只有当斜前方真的有敌方棋子可吃时，兵才会看到那个斜线格。',
  'White does not see a4 or b4: black pawns block those pushes, so they are not legal moves. Some rulesets reveal blocked pawn squares; Mistboard does not.':
    '白方看不到 a4 或 b4：黑兵挡住了这些推进，所以它们不是合法走法。有些规则会显示被阻挡的兵推进格；Mistboard 不会。',
  "En passant is chess's strangest move, so our vision rule bends for it: the capturing pawn sees the captured pawn on its adjacent square. The window is one move only. Pass on the capture and the chance is gone.":
    '吃过路兵是国际象棋中最奇特的一步，因此我们的视野规则为它破了个例：执行吃子的兵能看到相邻格子上那个将被吃掉的对方兵。这个窗口只持续一步。若放弃这次吃子，机会便不复存在。',
  "You can read the darkness to deduce what's happening on the board.":
    '你可以通过解读这片黑暗，推断棋盘上正在发生什么。',
  'The goal is not perfect certainty. A good dark chess player learns which hidden worlds are dangerous enough to respect, then chooses moves that survive those worlds.':
    '目标不是获得完美确定性。优秀的迷雾棋手会判断哪些隐藏局面危险到必须尊重，然后选择在那些局面中也能成立的走法。',
  'A pawn sees where it can push. Fog on a push square means an opponent piece or pawn is blocking it.':
    '兵能看到它可以推进到的格子。若推进格被迷雾遮住，就说明那里有对方的棋子或兵挡着。',
  "Same signal in opening play. After 1.d4 e6 2.Nf3 Bb4, b4 leaves White's view: the b2-pawn no longer pushes there. A Black piece just landed on b4. Pawn, knight, or bishop, and White can't tell which. But c3 and d2 are visible empty, so a bishop would capture the king next move. White has to defend on that assumption.":
    '开局中也有同样的信号。在 1.d4 e6 2.Nf3 Bb4 之后，b4 离开了白方的视野：b2 的兵不再能推进到那里。说明刚有一枚黑方棋子落在了 b4。可能是兵、马或象，白方无从判断是哪一个。但 c3 与 d2 都清晰可见且为空，因此一枚象下一步就能吃掉白王。白方只能按这个最坏的假设来防守。',
  "When the opponent takes one of your pieces, the capture square falls to fog. You can't see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?":
    '当对方吃掉你的一枚棋子时，被吃的那个格子会随即陷入迷雾。你看不到是谁吃的。例如：白方有一个兵在 d5，周围有四个黑方攻击者（c6 兵、e6 兵、c7 马、d7 车）。在 1...exd5 之后，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '现在在 h3 添一枚白象。它的斜线让 e6 始终处在视野内。同样走 1...exd5 之后，白方失去 d5，而那枚象看到 e6 变空了。于是可知：是 e 路的兵吃的。',
  'Dark chess deduction usually narrows the problem instead of solving it outright. Once a hidden bishop, rook, queen, or pawn capture is plausible, the practical question is whether your next move still works if that possibility is true.':
    '迷雾国际象棋中的推理通常是缩小问题，而不是一次性解开答案。一旦隐藏的象、车、后或兵吃子变得可信，实际问题就是：如果这种可能性是真的，你下一步是否仍然成立。',
  'That habit is the bridge from rules to strategy: read the fog, name the dangerous possibilities, and defend against the ones that can end the game.':
    '这个习惯就是从规则走向策略的桥梁：读懂迷雾，说出危险的可能性，并防住那些会直接结束对局的可能。',
  "Here is a complete game between Mistboard's engine and a human, shown from both player views and the server's full position.":
    '下面是一盘 Mistboard 引擎对阵真人的完整对局，同时展示双方视野和服务器上的完整局面。',
  'A realistic 41-move game between two decent players.':
    '一盘两位尚有水平的棋手之间、贴近实战的 41 回合对局。',
  'Open a board, share the link, play. No account required.':
    '开一局棋，分享链接，开始对弈。无需注册账号。',
  "The full source is AGPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard's servers run in production.":
    '完整源代码以 AGPL-3.0 协议开源。驱动本文每一个局面的视野逻辑，与 Mistboard 服务器在生产环境中运行的是同一段代码。',
  // CTA
  'Play dark chess': '来玩迷雾国际象棋',
  'Read dark chess concepts': '阅读迷雾国际象棋概念',
  'Read the rules': '阅读规则',
  // board labels
  "WHITE'S VIEW": '白方视野',
  'SERVER TRUTH': '服务器真相',
  "BLACK'S VIEW": '黑方视野',
  PAWN: '兵',
  KNIGHT: '马',
  BISHOP: '象',
  ROOK: '车',
  QUEEN: '后',
  KING: '王',
  BEFORE: '之前',
  AFTER: '之后',
  'EMPTY AHEAD': '前方空旷',
  'BLOCKED AHEAD': '前方受阻',

  // ── Dark Xiangqi / Xiangqi primer ──
  // (shared keys with dark chess intentionally NOT redefined here:
  //  'The starting position', 'What you see', 'Edge cases', 'Draws',
  //  "Here's the same rule, piece by piece.")

  // -- Xiangqi Rules Primer --
  // title + summary
  'Xiangqi Rules Primer': '象棋规则入门',
  'A short guide to the board, pieces, movement rules, and endings you need before reading the Dark Xiangqi rules.':
    '在阅读迷雾象棋规则之前，先用一篇简短的指南了解棋盘、棋子、走法规则和终局方式。',
  // intro
  'Xiangqi is the game underneath Dark Xiangqi. If you already play xiangqi, you can skip this primer and go straight to the [Dark Xiangqi rules](/rules/dark-xiangqi). If you know chess but not xiangqi, this page gives you the board, pieces, and rule details you need before fog is added.':
    '象棋是迷雾象棋的底层游戏。如果你已经会下象棋，可以跳过这篇入门，直接阅读[迷雾象棋规则](/rules/dark-xiangqi)。如果你会下国际象棋但不会象棋，本页将在加入迷雾之前，为你讲清棋盘、棋子和规则细节。',
  'Dark Xiangqi keeps the xiangqi board and piece movement. The changes come later: hidden enemy pieces, no check warnings, and general capture as the win condition.':
    '迷雾象棋保留了象棋的棋盘和棋子走法。变化在后面：敌方棋子会被隐藏、没有将军提示，以及以擒获将帅作为获胜条件。',
  // section headings
  'Xiangqi in one minute': '一分钟看懂象棋',
  'The board': '棋盘',
  'The pieces': '棋子',
  'Rules chess players usually miss': '国际象棋棋手常忽略的规则',
  'Checks and endings': '将军与终局',
  'Next: Dark Xiangqi': '接下来：迷雾象棋',
  // paragraphs
  'Xiangqi is played by two players: Red and Black. Red moves first. Each side starts with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers.':
    '象棋由两名玩家对弈：红方与黑方。红方先行。每一方开局有 16 枚棋子：一个将（帅）、两个士（仕）、两个象（相）、两个马、两个车、两个炮（砲）和五个兵（卒）。',
  'In normal xiangqi, the goal is to checkmate the opposing general. If a player has no legal move, that player loses. That is different from Western chess, where stalemate is a draw.':
    '在普通象棋中，目标是将死对方的将帅。如果一方无合法走法，则该方告负。这与西洋的国际象棋不同，那里逼和算作和棋。',
  'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares. Pieces capture by moving to an enemy-occupied point. You cannot land on your own piece.':
    '棋盘有 9 条纵线和 10 条横线，但棋子落在线的交叉点上，而不是格子内。棋子通过走到敌方占据的交叉点来吃子。你不能落到自己的棋子上。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers become stronger after crossing it.":
    '**九宫**是每一方底线一侧的 3×3 区域。将帅与士仕必须留在己方九宫之内。**楚河汉界**将棋盘分为两半。象（相）不能过河，而兵（卒）过河之后会变强。',
  '**General:** moves one point horizontally or vertically. It must stay inside the palace.':
    '**将（帅）：**横向或纵向走一个交叉点。它必须留在九宫之内。',
  '**Advisor:** moves one point diagonally. It must stay inside the palace.':
    '**士（仕）：**斜向走一个交叉点。它必须留在九宫之内。',
  '**Elephant:** moves exactly two points diagonally. It cannot cross the river. If another piece sits on the midpoint of that diagonal, the elephant is blocked.':
    '**象（相）：**沿斜线正好走两个交叉点（俗称「象走田」）。它不能过河。如果斜线中点上有别的棋子，象眼被塞住，象就走不了。',
  '**Horse:** moves in an L shape, similar to a chess knight, but it does not jump. If the adjacent leg point is occupied, the horse cannot move in that direction.':
    '**马：**走「日」字，类似国际象棋的马，但它不能跳越。如果相邻的马腿位置上有棋子（蹩马腿），马便不能朝那个方向走。',
  '**Chariot:** moves any distance horizontally or vertically, like a rook. It cannot jump over pieces.':
    '**车：**横向或纵向走任意距离，类似国际象棋的车。它不能越子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it must jump over exactly one intervening piece, called the screen, and land on an enemy piece beyond it.':
    '**炮（砲）：**不吃子时走法与车相同。吃子时，它必须正好越过一枚中间的棋子（称为炮架），并落在其后的一枚敌方棋子上。',
  '**Soldier:** moves one point forward. After crossing the river, it may also move one point sideways. It never moves backward and never promotes.':
    '**兵（卒）：**向前走一个交叉点。过河之后，它还可以横向走一个交叉点。它永远不能后退，也不会升变。',
  'A horse can be blocked. Unlike a knight, it cannot jump over the adjacent leg point.':
    '马可以被蹩腿。与国际象棋的马不同，它不能跳越相邻的马腿位置。',
  'An elephant can be blocked, and it never crosses the river.':
    '象（相）可以被塞象眼，而且它永远不过河。',
  'A cannon does not capture like a rook. It needs exactly one screen between itself and the target.':
    '炮（砲）的吃子方式与车不同。它与目标之间需要正好一个炮架。',
  'The two generals cannot face each other on the same open file in normal xiangqi. A move that exposes that direct line is illegal.':
    '在普通象棋中，双方的将帅不能在同一条无遮挡的纵线上对脸（将帅对脸，俗称「白脸将」）。任何让这条直线暴露出来的走法都是不合法的。',
  'Stalemate is a loss for the player with no legal move, not a draw.':
    '困毙是无合法走法一方的告负，而不是和棋。',
  'In normal xiangqi, a general is in check when an enemy piece attacks it. The checked player must answer the threat. If there is no legal answer, the game ends by checkmate.':
    '在普通象棋中，当敌方棋子攻击将帅时，即为将军。被将军的一方必须应对这一威胁。如果没有合法的应法，对局以将死结束。',
  'Normal xiangqi also has rules for repetition, perpetual check, and perpetual chase. Those rules can get detailed in tournament play. For this primer, the useful takeaway is simple: normal xiangqi does not allow endless forcing cycles as a free drawing weapon.':
    '普通象棋还有关于重复局面、长将和长捉的规则。这些规则在比赛中会相当细致。就本篇入门而言，有用的要点很简单：普通象棋不允许把无止境的逼着循环当作免费的求和手段。',
  'Dark Xiangqi keeps the board, setup, and piece movement above. Then it changes the information and the ending: enemy pieces outside your vision are hidden, there are no check warnings, facing generals are allowed, and the game ends when a general is captured.':
    '迷雾象棋保留了以上的棋盘、布局和棋子走法。然后它改变了信息和终局：你视野之外的敌方棋子会被隐藏，没有将军提示，允许将帅对脸，并且当将帅被吃掉时对局结束。',
  'That means the same xiangqi tactics still matter, but under fog. Horse legs, elephant eyes, cannon screens, palace geometry, and river-crossed soldiers all become information signals as well as movement rules.':
    '这意味着相同的象棋战术依然重要，只是处在迷雾之下。蹩马腿、塞象眼、炮架、九宫的几何结构，以及过河的兵卒，都既是走法规则，也成了信息信号。',
  // CTA
  'Read Dark Xiangqi': '阅读迷雾象棋',

  // -- Dark Xiangqi --
  // title + summary
  'Dark Xiangqi': '迷雾象棋',
  'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.':
    '战争迷雾下的象棋：每一方只能看到己方棋子可及的范围，隐藏的阻挡子至关重要，将帅由被吃而落败。',
  'Dark Xiangqi is a future variant, not playable yet. There is no set release date.':
    '迷雾象棋是一个未来的变体，目前尚不可对弈，也没有确定的发布日期。',
  'Back to all rules': '返回全部规则',
  'The ancient game with modern fog: each side sees only what its pieces can reach, no check warnings, and the general falls by capture.':
    '为这门古老的棋类加上现代的迷雾：每一方只能看到己方棋子可及的范围，没有将军提示，将帅由被吃而落败。',
  // intro
  'Dark Xiangqi is the modern Fog of War version of [xiangqi](/rules/xiangqi): pieces keep their xiangqi movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷雾象棋是[象棋](/rules/xiangqi)的现代「战争迷雾」版本：棋子保留象棋的走法，而看不见的敌方棋子保持隐藏、危险也不会被告知。擒获将帅即获胜。',
  'If xiangqi is new to you, start with [Xiangqi Rules](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你刚接触象棋，请先从[象棋规则](/rules/xiangqi)开始。如果你已经会下象棋，下面各节只讲解迷雾改变了什么。',
  // section headings
  'Win condition: general capture': '胜负条件：擒获将帅',
  'Play status': '对弈状态',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '将帅对脸',
  'Horse legs': '蹩马腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog. Your opponent sees a different board from the same true position.':
    '开局时，你能看到己方棋子以及它们所控制的每一个合法落点。其余一切都是迷雾。你的对手会从同一个真实局面看到一张不同的棋盘。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, horse legs, elephant eyes, and newly opened lines immediately change what you know.':
    '每走一步之后，视野都会根据真实局面重新计算，因此隐藏的阻挡子、炮架、马腿、象眼，以及新打开的线路都会立刻改变你所掌握的信息。',
  'Capture the general to win. Checks and checkmates are not announced, and the server does not warn a player who has moved into danger.':
    '擒获将帅即获胜。将军与将死都不会被告知，并且当一方走入危险时，服务器也不会发出警告。',
  "Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player's view. There is no stalemate draw: if the side to move has no legal move, it loses, and with no check to freeze you, this almost never happens.":
    '对局会在三次重复局面，以及连续 60 个半回合无吃子时自动判和。两者都依据真实局面判断，而非任何一方各自的视野。这里没有困毙判和：若轮到走子的一方没有合法着法，则判负；而由于没有将军来限制你，这种情况几乎不会发生。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the target is visible and marked, while the screen appears as unknown occupancy.':
    '炮（砲）不吃子时走法与车相同。吃子时，它正好越过一个炮架，落在其后的第一枚敌方棋子上。在迷雾下，目标可见且会被标记，而炮架则显示为未知的占据状态。',
  'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.':
    '正统象棋禁止将帅对脸。迷雾象棋允许这种局面；如果一方的将帅在一条无遮挡的纵线上看到了对方将帅，便可以沿该纵线将其吃掉。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有当相邻的马腿位置空着时，马才能走动。如果有一枚隐藏的棋子蹩住了那条马腿，落点就会从你的可见集合中消失，而马腿位置则显示为一个「?」标记。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜线走两个交叉点，且不能过河。如果有一枚隐藏的棋子塞在中点的象眼上，斜线落点就会消失，而象眼位置则显示为一个「?」标记。',
  'Playable Dark Xiangqi games are not public yet. These rules are published first so players can review the variant before live play opens.':
    '可对弈的迷雾象棋目前尚未公开。这些规则先行发布，好让玩家在实战开放之前先了解这一变体。',

  // -- Jieqi (rules) --
  'Jieqi (揭棋) Rules': '揭棋规则',
  'Jieqi (揭棋) rules: xiangqi with hidden non-general pieces that first move by starting point, then reveal and play by identity.':
    '揭棋规则：在象棋基础上将除将帅以外的棋子全部暗置，暗子先按所在起始位置的兵种行棋，走子后翻明并按真实身份行棋。',
  "Jieqi (揭棋, 'reveal chess') keeps xiangqi's board and checkmate goal, but hides every non-general piece. A dark piece first moves, attacks, and captures by the starting point it occupies. After that move, it reveals and plays by identity.":
    '揭棋（意为“翻开的棋”）沿用象棋的棋盘和将死取胜的目标，但把除将帅以外的每一枚棋子都暗置。暗子最初的走子、攻击和吃子都按它所在的起始位置对应的兵种进行。走出那一步之后，它便翻明，并按真实身份行棋。',
  'Use [Xiangqi Rules](/rules/xiangqi) for the base game. This page covers what changes.':
    '底层游戏请参阅[象棋规则](/rules/xiangqi)。本页只讲解揭棋改变了什么。',
  Setup: '布局',
  "Set each general face-up on its normal palace point. Shuffle each side's other fifteen pieces and deal them face-down onto the remaining starting points. Neither player knows any hidden identities, including their own.":
    '将双方的将帅各自正面朝上摆在九宫内通常的位置。把每一方其余十五枚棋子洗混，背面朝下地发到剩余的起始位置上。任何一方都不知道任何暗子的身份，包括自己的暗子。',
  'First moves use starting points': '首步按起始位置行棋',
  'Before reveal, a dark piece uses the role of the starting point it occupies, not its hidden identity. A dark piece on a corner point plays like a chariot; dark pieces on horse, advisor, elephant, cannon, and soldier points use those matching moves.':
    '翻明之前，暗子按其所在起始位置对应的兵种行棋，而不是按它隐藏的真实身份。位于角点的暗子像车一样走；位于马、士、象、炮、兵起始位置上的暗子，则分别按这些兵种的走法行棋。',
  'The normal restrictions still apply to that first move: horse legs, elephant eyes, cannon screens, palace limits for advisor points, and the river limit for elephant points. Once the move resolves, the piece flips face-up for both players.':
    '通常的限制对这首步同样适用：蹩马腿、塞象眼、炮架，士位受九宫限制，象位受河界限制。这步走完后，该棋子即对双方翻为正面朝上。',
  'Revealed pieces use identity': '翻明后的棋子按真实身份行棋',
  "After reveal, use the piece's identity from its current point. Advisors may leave the palace, and elephants may cross the river. Their movement shapes do not change: advisors step one point diagonally; elephants move two points diagonally and are still eye-blocked.":
    '翻明之后，棋子从它当前所在的位置按其真实身份行棋。士可以离开九宫，象可以过河。它们的走子形状不变：士斜走一个交叉点；象斜走两个交叉点，并且仍会被塞象眼。',
  'Horses, chariots, and cannons move normally. Soldiers use the normal river rule from wherever they reveal: forward only before crossing, forward or sideways after crossing, never backward.':
    '马、车、炮按常规走法行棋。兵（卒）则从它翻明的位置起套用通常的过河规则：过河前只能向前，过河后可向前或横走，永不后退。',
  'Captured dark pieces': '被吃掉的暗子',
  'If a dark piece is captured before revealing, only the capturer learns what it was. The owner sees one dark piece leave the board, but not its identity. Later, the capturer can rule out that hidden identity elsewhere.':
    '如果一枚暗子在翻明之前被吃掉，只有吃子的一方知道它是什么。棋子的主人只看到一枚暗子离开棋盘，却看不到它的身份。此后，吃子的一方便可以排除其他位置上存在这个隐藏身份的可能。',
  'This reference uses the common Jieqi convention: the capturer sees it. Some cờ úp groups handle captured dark pieces differently, so agree on the convention before over-the-board play.':
    '本规则参考采用揭棋的常见约定：吃子一方可见。某些 cờ úp（越南揭棋）流派对被吃暗子的处理方式不同，因此在线下实地对弈前应先就采用的约定达成一致。',
  'Checks, wins, and draws': '将军、胜负与和棋',
  "Every occupied point is visible, so players can see when the general is attacked. An unmoved dark piece attacks from its starting point using that point's role. Once it moves, it reveals immediately; any check from the destination uses the revealed identity.":
    '每个被占据的交叉点都是可见的，因此双方都能看出将帅何时受到攻击。尚未走动的暗子按其起始位置对应的兵种从该位置发动攻击。一旦走动，它立即翻明；任何来自落点的将军都按翻明后的真实身份计算。',
  'Win by checkmating the general or leaving the opponent with no legal move. The facing-generals rule still applies, and dark pieces block the file like any other piece.':
    '将死对方将帅，或让对方无合法走法可走，即可获胜。将帅对脸的规则依然有效，暗子也和其他棋子一样会挡住纵线。',
  'Repetition follows xiangqi long-beat rules, not a generic threefold or fourfold result. Perpetual check and direct perpetual chase are forbidden, so the forcing side must change course or lose; mutual forcing and ordinary repeated positions are judged by the xiangqi cycle, not by board equality alone. The automatic draw convention in this reference is the Guangdong/Tencent no-capture clock: 60 full moves, meaning 120 plies, without a capture.':
    '重复局面依照象棋的长打规则裁定，而不是笼统地按三次或四次重复出结果。长将和直接的长捉都被禁止，因此发动逼着的一方必须改变着法，否则判负；互打以及普通的重复局面则依据象棋的循环判例裁定，而不能只看局面是否相同。本规则参考采用的自动判和约定是广东/腾讯的无吃子回合数：连续 60 个完整回合（即 120 个半回合）无吃子即判和。',
  Names: '名称',
  '揭棋 is Mandarin jiēqí, meaning reveal chess. Luo Jinsheng of Guangzhou invented it in the 1980s. Vietnamese play commonly calls this family cờ úp.':
    '揭棋的普通话读音为 jiēqí，意为“翻开的棋”。它由广州的罗锦生于 20 世纪 80 年代发明。越南的玩法通常把这一类游戏称为 cờ úp。',
  'English names overlap. Dark Chinese chess may refer to jieqi, but it can also mean [banqi](/rules/banqi), a different half-board flip game. Jieqi keeps the full xiangqi board and checkmate goal; banqi uses a 4x8 board, rank captures, and elimination.':
    '英文名称常有重叠。“Dark Chinese chess”可能指揭棋，但也可能指[暗棋](/rules/banqi)（banqi），那是另一种半盘翻子游戏。揭棋保留完整的象棋棋盘和将死取胜的目标；暗棋则使用 4×8 的棋盘，按子力等级吃子，以吃光对方取胜。',
  'Mistboard also uses [Dark Xiangqi](/rules/dark-xiangqi) and Dark Mini Xiangqi for our Fog of War xiangqi variants. Those are not jieqi: identities stay known, but unseen points are hidden. We have not found an earlier public playable platform for Fog of War xiangqi.':
    'Mistboard 还以[迷雾象棋](/rules/dark-xiangqi)和迷雾迷你象棋作为我们的战争迷雾象棋变体。它们并不是揭棋：棋子的身份始终是已知的，只是看不到的交叉点被隐藏起来。我们尚未发现更早的、可公开对弈的战争迷雾象棋平台。',
  'Jieqi is playable on Mistboard. Take on PikaJieQi, our jieqi engine, at the strength you pick. For the base game, read xiangqi; for the other face-down xiangqi cousin, compare banqi.':
    '揭棋现在已可在 Mistboard 上对弈。来挑战我们的揭棋引擎 PikaJieQi，强度由你选择。底层游戏请阅读象棋；另一种翻面的象棋近亲，可对照暗棋。',
  'Play vs PikaJieQi': '对战 PikaJieQi',
  'Step through a full self-play game below. Dark pieces show as colored backs and flip to their dealt identity the first time they move, so a corner that plays like a chariot can reveal a soldier. Red wins by checkmate.':
    '在下方逐步查看一整盘自我对弈的棋局。暗子以彩色背面显示，第一次走动时翻开，显示其发到的身份，因此一个像车一样走子的角落棋子，翻开后可能是一个兵。红方以将死获胜。',
  Banqi: '暗棋',
};

const ZH_HANT: Record<string, string> = {
  // -- Mini Xiangqi (rules) --
  'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.':
    '迷你象棋規則，迷霧迷你象棋的 7×7 入門基礎：沒有士象、沒有河界、兵可橫走，以將死取勝。',
  'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. It is a simplified, reduced version of [xiangqi](/rules/xiangqi): a smaller board, fewer pieces, and no river.':
    '迷你象棋由日本大阪的楠本茂信於 1973 年發明。它是[象棋](/rules/xiangqi)的簡化精簡版本：棋盤更小、棋子更少，且沒有河界。',
  'This page describes the open-information base game.': '本頁介紹的是資訊公開的底層遊戲。',
  'Board and setup': '棋盤與佈局',
  'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.':
    '迷你象棋是把象棋壓縮到 7×7 棋盤、並削減子力的版本。去掉了士和象，也沒有河界，但每一方的將帥仍保有一個 3×3 的九宮。',
  'Piece movement': '棋子走法',
  'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).':
    '除兵（卒）以外，每種棋子的走法都與[象棋](/rules/xiangqi)完全相同。',
  '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.':
    '**兵（卒）：**兵向前或橫向走一個交叉點並以此吃子，永不後退。由於沒有河界可過，牠從第一步起就擁有橫走的自由，這與完整象棋棋盤上的兵不同。',
  'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.':
    '將帥對臉在這裡同樣不合法。雙方的將帥不能處在中間無子的同一條縱線上，因此任何會暴露這條直線的走法都不被允許。',
  'Winning and draws': '勝負與和棋',
  'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.':
    '將死即獲勝。與象棋一樣，沒有合法走法的一方判負，而非因困斃而和棋；長將或長捉也不能用來免費求和：不斷重複同樣進攻的一方反而判負。',
  'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.':
    '當任何一方都沒有足夠的子力將死對方、長時間無吃子（象棋對此設有上限，類似國際象棋的五十回合規則），或出現不違反上述長打規則的重複局面時，對局判和。這些結果都由局面決定，而非某一方主動選擇停手。',
  'A complete game': '一盤完整對局',
  'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.':
    '迷你象棋沒有著名的人類對局傳統，因此若想看全部子力協同作戰，可以逐步重演一盤由強大的開源引擎 Fairy-Stockfish 在完全資訊下執雙方對弈的棋局。注意車和炮開線有多快：在緊湊、無河界的 7×7 棋盤上，將帥遭受火力的時間遠比完整象棋來得早。',
  'Mini Xiangqi is the open-information base game. Dark Mini Xiangqi adds Fog of War, where enemy pieces outside your vision disappear and the general falls by capture rather than checkmate.':
    '迷你象棋是資訊公開的底層遊戲。迷霧迷你象棋為它加上戰爭迷霧：你視野之外的敵方棋子會消失，且將帥由被吃而非將死而落敗。',
  'Read Dark Mini Xiangqi': '閱讀迷霧迷你象棋',
  Xiangqi: '象棋',

  // -- Dark Mini Xiangqi (rules) --
  'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.':
    '戰爭迷霧下的迷你象棋：在 7×7 棋盤上，每一方只能看到己方棋子可及的交叉點，將帥由被吃而落敗。',
  '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.':
    '在戰爭迷霧下進行的[迷你象棋](/rules/mini-xiangqi)：每位玩家只能看到己方棋子，以及己方子力可及的敵方棋子。棋盤為 7×7，以吃掉對方將帥結束對局。如果你已經會下迷你象棋，下面各節只講解迷霧改變了什麼。',
  'Board and fog': '棋盤與迷霧',
  'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.':
    '棋盤和子力與迷你象棋相同。戰爭迷霧隨後遮住棋盤：你能看到己方棋子以及牠們可及的每個交叉點，其餘一切都是迷霧。',
  'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.':
    '從三個視角看開局局面。紅方與黑方各自只能清楚看到自己的一側，而中間由伺服器掌握真實棋盤。每走一步後視野都會重新計算，因此打開一條線路或失去一枚棋子都會立刻改變各方所掌握的資訊。',
  'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.':
    '你永遠看不到視野之外的敵方棋子，也看不到被迷霧遮住的交叉點是否為空，更看不到被遮蔽的阻擋子是什麼。',
  'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.':
    '吃掉將帥即獲勝。沒有將死，也沒有將軍提示，因此你可以走入危險、讓自己的將帥暴露，甚至讓雙方將帥在一條無遮擋的縱線上對臉。',
  "There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player's view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.":
    '這裡沒有困斃判和：若輪到走子的一方沒有合法著法，則判負。由於沒有將軍來限制你，這種情況幾乎不會發生。和棋依據真實局面判斷，而非任何一方各自的視野：對局會在三次重複局面時判和，也會在連續 60 個半回合（雙方各 30 回合）無吃子時判和。',
  'Two pieces interact with fog in ways worth seeing up close.':
    '有兩種棋子與迷霧的互動值得近距離一看。',
  'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is shown with a marker.':
    '炮吃子時正好越過一個炮架，落在其後的第一枚敵方棋子上。在迷霧下，規則是**炮架被遮、目標可見**：炮架顯示為被佔據但身份不明，其後的空隙仍處於迷霧中，而可吃的目標則會帶有標記顯示出來。',
  Horses: '馬',
  'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.':
    '馬先沿橫豎方向走一個交叉點，再斜向外走一個交叉點；如果中間的馬腿位置被佔據，牠就不能走。如果有一枚隱藏的棋子蹩住馬腿，馬腿位置會顯示為被佔據但身份不明，其後的落點則從你的視野中消失。',
  'A complete game under fog': '一盤迷霧下的完整對局',
  'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty 1.0, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.':
    '想看全部子力在戰爭迷霧下協同作戰，可以逐步重演一盤由 Mistboard 引擎 Misty 1.0 執雙方對弈的棋局。每一手都以三種方式呈現：紅方所見、伺服器上的真實棋盤，以及黑方所見。',
  'Dark Mini Xiangqi is open for alpha play. You can play Misty, create an invite, or find an opponent from the homepage play panel by choosing Dark Mini Xiangqi in the Variant row.':
    '迷霧迷你象棋現已開放 Alpha 對弈。你可以在首頁對弈面板的「Variant」一行選擇迷霧迷你象棋，然後對戰 Misty、建立邀請，或尋找對手。',
  'Play Misty': '對戰 Misty',
  'Create invite': '建立邀請',

  // -- Shogi4 (4x4 Shogi) --
  'Shogi4 (4×4 Shogi) Rules': 'Shogi4（4×4 將棋）規則',
  "The complete rules of Shogi4 (4x4 Shogi), Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.":
    'Shogi4（4×4 將棋）的完整規則，由 Oca Studios 發布並進入公有領域的 4×4 棋盤動物打入將棋：鯉魚、貘、狸、狐與王的走法，以及跳越友子、進化、打入與吃王取勝。',
  "Shogi4, also called 4x4 Shogi, is a drop-shogi played with animal tiles on a 4×4 board. It plays much like ordinary shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces switch sides and drop back into play, and you win by taking the king. The one rule shogi players won't recognize is that a piece may hop over a friendly piece, added so your own pieces don't jam each other on a board this small.":
    'Shogi4（又稱 4×4 將棋）是一種在 4×4 棋盤上用動物棋子進行的打入將棋。它玩起來很像縮小到十六格的普通將棋：棋子按棋面標示的方向走動，被吃的棋子改換陣營並可重新打入棋盤，吃掉王即獲勝。唯一一條將棋玩家會感到陌生的規則是：棋子可以跳越一枚己方棋子，這是為了避免在這麼小的棋盤上自己的棋子互相堵塞而加入的。',
  'Oca Studios released Shogi4 into the public domain in its "Four" series, free as a print-and-play set and as an app. Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal (a Crane for the first player, a Pheasant for the second).':
    'Oca Studios 在其「Four」系列中將 Shogi4 發布到公有領域，作為可列印自玩的套裝和應用免費提供。每位玩家有五枚棋子：鯉魚、貘、狸、狐，以及一枚王（先手為鶴，後手為雉）。',
  'The board and setup': '棋盤與擺子',
  "The board is 4×4, with a farm to either side that holds captured pieces. A tile's owner is shown by its facing: the first player's tiles point up the board, the second player's point down.":
    '棋盤為 4×4，兩側各有一個農場用來存放被吃的棋子。棋子的歸屬由朝向表示：先手的棋子朝向棋盤上方，後手的朝向下方。',
  'Every piece moves one square per turn, in the directions printed on its tile. On reaching the far row, each non-royal piece evolves, flipping to its evolved side. The pairs below show the base piece, then its evolved form, with a dot on every square each can reach (forward is up).':
    '每枚棋子每回合走一格，方向按棋面所印。到達最遠一行時，每枚非王棋子都會進化，翻到其進化面。下面每一對依次展示基礎棋子及其進化形態，並在各自能到達的每個格子上標一個點（上方為前進方向）。',
  '**Carp → Koi.** The Carp steps one square straight forward, a pawn. It evolves into a Koi, which moves as a silver from shogi.':
    '**鯉魚 → Koi。**鯉魚向正前方走一格，相當於將棋中的步兵。它進化為 Koi，走法與將棋中的銀將相同。',
  '**Tapir → Baku.** The Tapir steps forward or to a forward diagonal. It evolves into a Baku, a silver.':
    '**貘 → Baku。**貘向前方或前斜方走一格。它進化為 Baku，走法同銀將。',
  '**Raccoon-dog → Tanuki.** The Raccoon-dog steps one diagonal. It evolves into a Tanuki, a silver.':
    '**狸 → Tanuki。**狸向斜方走一格。它進化為 Tanuki，走法同銀將。',
  '**Fox → Kitsune.** The Fox steps one orthogonal. It evolves into a Kitsune, which moves as a gold from shogi.':
    '**狐 → Kitsune。**狐向橫豎方向走一格。它進化為 Kitsune，走法與將棋中的金將相同。',
  '**Crane / Pheasant.** The royal steps one square in any of the eight directions, a king. The two royals differ only in theme. It never evolves, and capturing it ends the game.':
    '**鶴 / 雉。**王可向八個方向中的任意一個走一格，相當於國際象棋的王。兩種王僅在主題上不同。它永不進化，被吃掉即終局。',
  'Jumping over a friendly piece': '跳越友方棋子',
  'A piece can leap over a friendly piece. If an ally sits on the next square in a direction the piece moves, the piece jumps it and lands on the square just beyond, empty or capturing an enemy there. It works in any direction the piece itself moves: straight for a Carp, on the diagonal for a Raccoon-dog, any of the eight for the royal.':
    '棋子可以跳越一枚己方棋子。如果在該棋子可走的某個方向上、緊鄰的格子裡有一枚友方棋子，它便可越過這枚棋子，落到再往前的那一格上：該格可以為空，也可以吃掉那裡的敵方棋子。這適用於棋子本身能走的任意方向：鯉魚沿直線，狸沿斜線，王則可沿八個方向中的任意一個。',
  'Capturing, farms, and drops': '吃子、農場與打入',
  'Move onto an enemy to capture it; it switches sides into your farm, reverting to its base form if it was evolved.':
    '走到敵方棋子所在的格子即可吃掉它；它會改換陣營進入你的農場，若此前已進化，則恢復為基礎形態。',
  "Instead of moving, drop a piece from your farm onto any empty square, except those on the far row (the opponent's back rank).":
    '你也可以不走子，而是從農場中取出一枚棋子打入任意空格，但最遠一行（對方底線）除外。',
  Winning: '取勝',
  'Capturing the royal is the only way to win. No check, no checkmate: the game ends the moment a royal is taken.':
    '吃掉王是唯一的取勝方式。沒有將軍，也沒有將死：王一旦被吃，對局立即結束。',
  'There is no stalemate. Because moving the king into capture range is legal, a lack of safe moves never ends the game: you simply make the unsafe move and play on until a king is taken. A side with no legal move at all, boxed in with nothing to drop, loses rather than draws.':
    '不存在逼和。由於把王走入可被吃的範圍是合法的，缺少安全著法絕不會結束對局：你只管走那步不安全的棋，繼續對弈，直到有一方的王被吃。若一方完全沒有合法著法（被困住且無子可打入），則判負，而非和棋。',
  'Repetition and draws': '重複與和棋',
  "The original rules address neither repetition nor a move-count limit. Our convention fills the gap: a position reached three times is an automatic draw. That rule is ours, not Oca's, and changes none of the rules above.":
    '原始規則既未規定重複局面，也未規定步數上限。我們的約定補上了這一空缺：同一局面出現三次即自動判和。這條規則是我們定的，並非 Oca 的，且不改變上述任何規則。',
  "Fairy-Stockfish self-play on the friendly-jump engine (this site's patched build). White wins in 73 plies; the mating move is itself a friendly jump.":
    'Fairy-Stockfish 在支援越友規則的引擎（本站修補版）上進行的自我對弈。白方在 73 個半回合內取勝；制勝的那一步本身就是一次跳越友子。',
  'Starting position': '初始局面',
  'Source and license': '來源與授權',
  'Shogi4 and its tile art are by Oca Studios, which released its whole "Four" series into the public domain. The [BoardGameGeek entry](https://boardgamegeek.com/boardgame/146291/shogi4) is a catalog reference.':
    'Shogi4 及其棋子美術由 Oca Studios 創作，該工作室已將其整個「Four」系列發布到公有領域。[BoardGameGeek 條目](https://boardgamegeek.com/boardgame/146291/shogi4)可作為目錄參考。',
  "We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read the move logic directly: the friendly-jump geometry, the single drop ban, and king-capture as the sole win all come from there. Oca's public rules page and starting-position graphic (now reachable only through the [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/), since the live site is down) corroborate the board and the basic moves.":
    '我們透過反編譯 Oca 官方的 Shogi4 應用、直接讀取其走子邏輯，還原出了確切的規則：跳越友子的幾何規則、唯一的打入禁區，以及以吃王作為唯一取勝方式，都來自於此。Oca 的公開規則頁面和初始局面圖（由於其網站已關閉，現在只能透過 [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/) 存取）也印證了棋盤和基本走法。',
  'Playing Shogi4': '開始遊玩 Shogi4',
  "Shogi4 isn't playable on the site yet; for now this page is the rules reference. Browse the rest of the rules, or compare it with the chess and xiangqi primers.":
    'Shogi4 目前還不能在本站對弈；現階段本頁作為規則參考。你可以瀏覽其餘規則，或將它與國際象棋和象棋入門相互對照。',

  // -- Dark Draft960 --
  'Dark Draft960': '迷霧選陣960',
  "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.":
    '帶密封開局選陣的迷霧國際象棋：每位玩家從三種國際象棋960 底線陣型中選擇一種，且永遠看不到對方的選擇。',
  'The draft': '選陣',
  "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.":
    '伺服器為每位玩家發出三種隨機的國際象棋960 底線陣型。你從中選一種，對手也各自從自己的三種中選一種。雙方的選陣都是密封的：任何一方都看不到對方的候選陣型或最終選擇。',
  "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.":
    '假設雙方都選了候選 A。每一方只能看到自己的底線陣型，對方的則隱藏在迷霧中。只有伺服器同時掌握雙方的陣型。',
  '960 × 960 = **921,600** possible starts. Standard chess is one of them.':
    '960 × 960 = **921,600** 種可能的開局。標準國際象棋只是其中之一。',
  'Dark Draft960 is a future variant, not playable yet. There is no set release date.':
    '迷霧選陣960 是一個未來的變體，目前尚不可對弈，也沒有確定的發布日期。',

  // -- Xiangqi primer (rules) --
  'Xiangqi Rules': '象棋規則',
  'Standard xiangqi rules, the primer behind Dark Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.':
    '標準象棋規則，迷霧象棋的入門基礎：九宮、楚河漢界、炮架、將帥對臉，以及一盤可供逐步重演的名局。',
  '[Xiangqi](https://en.wikipedia.org/wiki/Xiangqi), or Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).':
    '[象棋](https://en.wikipedia.org/wiki/Xiangqi)（中國象棋）是一種雙人策略遊戲，其根源可追溯到中國數百年乃至更久以前。它的現代形式（包括炮在內）大約在宋代（960 至 1279 年）成形。',
  'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.':
    '紅黑雙方輪流走子，紅方先行。每一方開局有 16 枚棋子：一個將（帥）、兩個士（仕）、兩個象（相）、兩個馬、兩個車、兩個炮（砲）和五個兵（卒）。目標是將死對方的將帥。',
  'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares.':
    '棋盤有 9 條縱線和 10 條橫線，但棋子落在線的交叉點上，而不是格子內。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.":
    '**九宮**是每一方底線一側的 3×3 區域。將帥與士仕必須留在己方九宮之內。**楚河漢界**將棋盤分為兩半。象（相）不能過河，而兵（卒）過河之後可以橫向走子。',
  "A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon's capturing jump is the only exception. The pieces are listed below in the traditional order.":
    '棋子透過落在敵方佔據的交叉點上來吃子，而任何棋子都不能穿過被佔據的交叉點。炮的吃子跳躍是唯一的例外。下面按傳統順序列出各棋子。',
  '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.':
    '**將（帥）：**橫向或縱向走一個交叉點，永遠不能離開己方九宮。雙方的將帥不能在中間無子的同一條縱線上對臉：任何讓這條直線暴露出來的走法都是不合法的。實際上，將帥就像一隻車那樣守住它正前方的縱線。',
  '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.':
    '**士（仕）：**斜向走一個交叉點，與將帥一樣必須留在九宮之內。',
  "**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant's eye, blocks the move.":
    '**象（相）：**沿斜線正好走兩個交叉點（俗稱「象走田」），且不能過河，因此牠永遠不會離開己方半邊。牠不能跳越：如果斜線中點（象眼）上有棋子，這步走法就被擋住。',
  "**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse's leg, is occupied, the horse cannot move in that direction.":
    '**馬：**先沿橫豎方向走一個交叉點，再斜向外走一個交叉點，走「日」字，類似西洋棋的騎士，但牠不能跳越。如果牠經過的那個橫豎交叉點（馬腿）被佔據（蹩馬腿），馬便不能朝那個方向走。',
  '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.':
    '**車：**橫向或縱向走任意距離，不能越子，與西洋棋的城堡完全相同。牠是棋盤上最強的棋子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.':
    '**炮（砲）：**不吃子時走法與車相同。吃子時，牠正好越過一枚棋子（不分敵我），這枚棋子稱為炮架，並落在其後的一枚敵方棋子上。',
  '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.':
    '**兵（卒）：**向正前方走一個交叉點，永不後退。過河之後，牠還可以橫向走一個交叉點。牠不會升變。',
  'Check, checkmate, and endings': '將軍、將死與終局',
  'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.':
    '當敵方棋子攻擊將帥時，即為將軍，被將軍的一方必須應對這一威脅。如果沒有合法的應法，便是將死，被將軍的一方告負。',
  'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.':
    '完全沒有合法走法的一方同樣告負。這與西洋棋相反，在那裡沒有合法走法算作逼和（和棋）。',
  'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.':
    '象棋還限制無止境的逼著循環。長將與長捉是不允許的：一方若不斷重複同樣的進攻，將被判負，而不能藉此逼和。比賽規則對何時算作「長」給出了詳細的重複判定程序。',
  'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.':
    '當任何一方都沒有足夠的子力將死對方、出現不違反上述規則的重複局面，或長時間無吃子時，對局判和。無吃子的上限取決於所採用的規則：世界象棋聯合會的規則採用五十回合規則，而中國象棋協會（CXA）的規則則要求至少 60 個半回合之後才能提出和棋。',
  "To see the pieces work together in a real game, step through this 1990 championship between two of xiangqi's greatest grandmasters. Playing Black, Liu Dahua checkmates Hu Ronghua, the most dominant champion of the era, in 31 moves.":
    '想看棋子在實戰中如何協同，可以逐步重演這盤 1990 年、由兩位象棋頂尖特級大師對弈的冠軍賽。執黑的柳大華用 31 個回合將死了那個時代最具統治力的冠軍胡榮華。',
  'Xiangqi is the open-information base game. Add Fog of War for dark xiangqi, where enemy pieces outside your vision disappear and the general falls by capture. Or try the compact board.':
    '象棋是資訊公開的底層遊戲。為它加上戰爭迷霧，便得到迷霧象棋：你視野之外的敵方棋子會消失，而將帥由被吃而落敗。或者也可以試試更緊湊的棋盤。',
  'Mini Xiangqi': '迷你象棋',
  'Dark Mini Xiangqi': '迷霧迷你象棋',

  // -- Chess primer --
  'Chess Rules': '國際象棋規則',
  'Standard chess rules, the primer behind Dark Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.':
    '標準國際象棋規則，迷霧國際象棋的入門基礎：王車易位、升變、吃過路兵、和棋規則，以及一盤可供逐步重演的名局。',
  'Chess is a two-player strategy game played for centuries. It descends from the Indian game chaturanga of around the 6th century and reached Europe through Persia and the Islamic world; its modern form, with the long-range queen and bishop, took shape in Europe in the late 1400s.':
    '國際象棋是一種已有數百年歷史的雙人策略遊戲。它源自約公元 6 世紀的印度遊戲恰圖蘭加，經由波斯和伊斯蘭世界傳入歐洲；其現代形式（擁有遠程的后和象）於 15 世紀末在歐洲成形。',
  'Board setup': '棋盤佈置',
  'Chess is played on an 8 by 8 board of alternating light and dark squares.':
    '國際象棋在 8×8 的棋盤上進行，棋盤由深淺相間的方格組成。',
  'White moves first, then players alternate. Each side fills the two rows nearest it, with the queen starting on her own color. On your turn, move one piece to a legal square: you cannot land on your own piece, and landing on an enemy piece captures it, removing it from the board.':
    '白方先走，之後雙方輪流走子。每一方在最靠近自己的兩排擺滿棋子，后擺在與自身同色的格子上。輪到你時，將一枚棋子走到一個合法的格子：你不能落在自己的棋子上，而落在敵方棋子上即可將其吃掉，並把它從棋盤上移走。',
  'Each piece moves in its own way. In every diagram below, the highlighted squares are the legal moves and captures for the marked white piece.':
    '每種棋子都有各自的走法。在下面每一幅圖中，高亮的格子表示被標記的白方棋子的合法走法與吃子。',
  '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.':
    '**王：**可向任意方向走一格。在普通國際象棋中，王不能走到被對方攻擊的格子上。',
  '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.':
    '**后：**可沿橫線、豎線或斜線走任意格數。其他棋子會擋住它的去路。',
  '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.':
    '**車：**可沿橫線或豎線走任意格數。它不能跳子，因此一條線上第一個被佔據的格子就會擋住它。',
  '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.':
    '**象：**可沿斜線走任意格數。由於斜線始終保持同一種顏色，每個象在整盤棋中都只走淺色格或只走深色格。',
  '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.':
    '**馬：**走「L」形：朝一個方向走兩格，再橫向走一格。馬是唯一能跳過其他棋子的棋子。',
  '**Pawn:** the pawn moves and captures differently from every other piece. It moves straight forward into an empty square, one square at a time, or two squares from its starting position. It can never move backward or sideways, and a piece directly in front of it blocks it completely. It captures only diagonally forward, one square (the green rings below), never straight ahead. Two further pawn rules, promotion and en passant, appear under Special moves below.':
    '**兵：**兵的走法和吃法與其他所有棋子都不同。它向正前方走入一個空格，每次一格，或在起始位置時一次走兩格。它永遠不能後退或橫走，正前方若緊挨著一枚棋子便會被完全擋住。它只能向斜前方吃子，一格（見下圖的綠色圓環），絕不向正前方吃子。另有兩條與兵有關的規則：升變與吃過路兵，見下文的「特殊走法」。',
  'Check and checkmate': '將軍與將死',
  'In regular chess, the king is protected by check and checkmate. A king is **in check** when an enemy piece attacks it. The checked player must make a legal move that leaves the king safe.':
    '在普通國際象棋中，王受到將軍與將死規則的保護。當敵方棋子攻擊王時，王即處於**被將軍**的狀態。被將軍的一方必須走一步合法著法，使王重新安全。',
  'Most checks are answered in one of three ways: move the king, block the line of attack, or capture the attacking piece. If none of those legal answers works, the game ends by **checkmate**.':
    '應對將軍通常有三種方法：移動王、擋住攻擊線路，或吃掉發動攻擊的棋子。如果這些合法應法都行不通，對局便以**將死**告終。',
  'In regular chess the king is never actually captured: the game ends at checkmate, with the king still on the board.':
    '在普通國際象棋中，王從不會真的被吃掉：對局在將死時結束，此時王仍留在棋盤上。',
  'Special moves': '特殊走法',
  'Castling is a one-move king-and-rook move. The king moves two squares toward a rook, and that rook moves to the square the king crossed. In regular chess, the pieces must be unmoved, the path must be empty, and the king cannot castle out of, through, or into check.':
    '王車易位是一步同時移動王和車的走法。王朝著一隻車的方向走兩格，那隻車則移動到王越過的格子上。在普通國際象棋中，參與易位的王與車此前都不能動過，中間的格子必須為空，且王不能在被將軍時易位、不能穿過被攻擊的格子易位，也不能易位到被攻擊的格子上。',
  'Queenside castling works the same way on the other side: the king moves two squares toward the rook, and the rook lands next to it.':
    '后翼易位在另一側以同樣方式進行：王朝著車走兩格，車則落到王的旁邊。',
  Promotion: '升變',
  'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight.':
    '當兵到達最遠的一條橫線時，它會升變為后、車、象或馬。',
  'En passant is the unusual pawn capture. If an enemy pawn moves two squares from its starting rank and lands beside your pawn, your pawn may capture it diagonally as if it had moved only one square. This chance exists only on the very next move.':
    '吃過路兵是一種特殊的兵吃子。如果敵方的兵從起始橫線一次走兩格，並停在你的兵旁邊，你的兵可以斜向吃掉它，就好像它只走了一格一樣。這個機會只在緊接著的下一步存在。',
  'Not every game is won. Some end in a draw, where neither side wins.':
    '並非每盤棋都分出勝負。有些以和棋告終，即雙方都不獲勝。',
  Stalemate: '逼和',
  'Stalemate is when the player to move has no legal move but their king is not in check. It is a draw, not a win, even if one side is far ahead. Below it is Black to move: the king on a8 is not in check, yet every square it could step to is covered by the white queen, and Black has nothing else to move. The game is drawn.':
    '逼和是指輪到走子的一方沒有任何合法著法，但其王並未被將軍。它判作和棋，而非取勝，即使一方大佔優勢也是如此。下圖輪到黑方走子：a8 的王沒有被將軍，但它能走到的每一個格子都被白后控制，而黑方又無其他棋子可走。對局判和。',
  'Other draws': '其他和棋',
  '**Threefold repetition:** the same position, with the same player to move, occurs three times. Either player can then claim a draw.':
    '**三次重複局面：**同一局面在同一方走子的情況下出現三次。此時任一方都可以提出和棋。',
  '**Fifty-move rule:** fifty moves by each side pass with no capture and no pawn move. The clock resets whenever a pawn moves or a piece is taken.':
    '**五十回合規則：**雙方各走五十回合而無任何吃子、也無任何兵的走動。每當有兵走動或有棋子被吃，計數便重新歸零。',
  '**Insufficient material:** neither side has enough force to deliver checkmate, such as king versus king, or king and a lone bishop or knight against a bare king.':
    '**子力不足：**任何一方都沒有足夠的子力完成將死，例如單王對單王，或一王加單象或單馬對單王。',
  '**Agreement:** both players simply agree to a draw.': '**協議和棋：**雙方直接同意作和。',
  'A famous game': '一盤名局',
  'To see the pieces work together in a real game, step through Game 11 of the 2014 World Championship in Sochi. Playing White, Magnus Carlsen grinds down Viswanathan Anand in a Berlin endgame to clinch the title; Anand resigns on move 45.':
    '想看棋子在實戰中如何協同，可以逐步重演 2014 年索契世界冠軍賽的第 11 局。執白的馬格努斯·卡爾森在柏林防禦殘局中逐步磨垮維斯瓦納坦·阿南德，鎖定冠軍；阿南德在第 45 回合認輸。',
  'Where to next': '接下來去哪',
  'Chess is the open-information base game. Add Fog of War for dark chess, where enemy pieces outside your vision disappear and the king falls by capture.':
    '國際象棋是資訊公開的底層遊戲。為它加上戰爭迷霧，便得到迷霧國際象棋：你視野之外的敵方棋子會消失，而王由被吃而落敗。',
  'Read Dark Chess': '閱讀迷霧國際象棋',
  'All rules': '全部規則',
  'Dark Chess (Fog of War) Rules': '迷霧國際象棋規則',
  'Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.':
    '戰爭迷霧下的國際象棋：每一方只能看到己方棋子可及的格子，沒有將軍提示，王被吃掉即負。',
  'Is dark chess the same as fog of war chess?': '迷霧國際象棋和「暗棋」是同一種遊戲嗎？',
  'Yes. "Dark chess" and "fog of war chess" are two names for this same variant: hidden-information chess where you see only the squares your pieces reach. It is sometimes confused with [banqi](https://en.wikipedia.org/wiki/Banqi), the Chinese game also nicknamed "dark chess," which plays with xiangqi pieces turned face-down. That is a different game.':
    '不是。迷霧國際象棋（英文 dark chess / fog of war chess）是隱藏資訊的國際象棋：你只能看到己方棋子可及的格子。它有時會和[暗棋](https://en.wikipedia.org/wiki/Banqi)（一種將象棋棋子翻面的中國遊戲）混淆，但兩者是不同的遊戲。',
  'Dark Chess Concepts': '迷霧國際象棋概念',
  'Strategy concepts for dark chess: how to read fogged squares, pawn signals, vanished moves, and capture clues after you know the rules.':
    '迷霧國際象棋的策略概念：在理解規則之後，學習如何解讀迷霧格、兵的訊號、消失的走法和吃子線索。',
  'The starting position': '開局局面',
  'What you see': '你能看到什麼',
  'Win condition: king capture': '勝負條件：吃王',
  Draws: '和棋',
  'Edge cases': '特殊情形',
  'Reading the fog': '讀懂迷霧',
  'A sample game': '一盤示例對局',
  'Try it': '上手一試',
  'What to do with partial proof': '如何處理不完整的證據',
  Castling: '王車易位',
  'Pawn vision': '兵的視野',
  'En passant': '吃過路兵',
  'Pawn moves': '兵的走動',
  Captures: '吃子',
  "[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.":
    '[迷霧國際象棋](https://en.wikipedia.org/wiki/Dark_chess)（又稱「戰爭迷霧」）由 Jens Bæk Nielsen 與 Torben Osted 於 1989 年發明。它屬於「隱式迷霧」的一支：沒有裁判，也沒有偵察動作。每一方的視野完全由己方棋子的合法走法範圍推導而來。',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷霧國際象棋不只關乎你看得見的棋子。被迷霧遮住的格子、消失的目的地和不見的棋子本身也是資訊。這個概念系列從最有用的習慣開始：讀懂迷霧正在告訴你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通國際象棋規則](https://zh.wikipedia.org/zh-hant/国际象棋规则)）可以合法走到的格子，以及棋子當前所在的格子。其餘一切都籠罩在迷霧之中。',
  "Here's the same rule, piece by piece.": '同一條規則，逐子來看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '視野隨棋子移動。當一個棋子走動時，它原先覆蓋的格子會重新陷入黑暗（除非另有棋子仍能看到它們），而它新觸及的格子則會亮起。',
  "Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece's vision ends where its movement ends.":
    '注意 d7 的車能看到 b7 的后和 h7 的王，卻看不到 a7。棋子的視野止於它走法的盡頭。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '當一方的王被吃掉時，對局即告結束。沒有將軍，沒有將死，也沒有任何預警。',
  "Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. There is no stalemate draw and no insufficient-material draw.":
    'Mistboard 會在三次重複局面（同一真實局面出現三次，且輪到走子的一方相同、王車易位權與吃過路兵權也相同）或五十回合規則（連續五十個回合無兵的走動、也無吃子）時自動判和。兩條規則都針對真實局面，而非任何一方各自的視野。這裡沒有逼和，也沒有子力不足判和。',
  "Games auto-draw on threefold repetition (same position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. No stalemate, no insufficient-material draw.":
    '對局會在三次重複局面（同一局面出現三次，且輪到走子的一方相同、王車易位權與吃過路兵權也相同）或五十回合規則（連續五十個回合無兵的走動、也無吃子）時自動判和。兩條規則都針對真實局面，而非任何一方各自的視野。這裡沒有逼和，也沒有子力不足判和。',
  'A king may castle out of, through, or into check.':
    '王可以在被將軍時易位，可以穿過被攻擊的格子易位，也可以易位到被攻擊的格子上。',
  'Pawns see forward push squares when those squares are empty. They see diagonal squares only when an enemy piece is actually there to capture.':
    '兵在前方格為空時能看到可推進的格子。只有當斜前方真的有敵方棋子可吃時，兵才會看到那個斜線格。',
  'White does not see a4 or b4: black pawns block those pushes, so they are not legal moves. Some rulesets reveal blocked pawn squares; Mistboard does not.':
    '白方看不到 a4 或 b4：黑兵擋住了這些推進，所以它們不是合法走法。有些規則會顯示被阻擋的兵推進格；Mistboard 不會。',
  "En passant is chess's strangest move, so our vision rule bends for it: the capturing pawn sees the captured pawn on its adjacent square. The window is one move only. Pass on the capture and the chance is gone.":
    '吃過路兵是國際象棋中最奇特的一步，因此我們的視野規則為它破了個例：執行吃子的兵能看到相鄰格子上那個將被吃掉的對方兵。這個窗口只持續一步。若放棄這次吃子，機會便不復存在。',
  "You can read the darkness to deduce what's happening on the board.":
    '你可以透過解讀這片黑暗，推斷棋盤上正在發生什麼。',
  'The goal is not perfect certainty. A good dark chess player learns which hidden worlds are dangerous enough to respect, then chooses moves that survive those worlds.':
    '目標不是獲得完美確定性。優秀的迷霧棋手會判斷哪些隱藏局面危險到必須尊重，然後選擇在那些局面中也能成立的走法。',
  'A pawn sees where it can push. Fog on a push square means an opponent piece or pawn is blocking it.':
    '兵能看到它可以推進到的格子。若推進格被迷霧遮住，就說明那裡有對方的棋子或兵擋著。',
  "Same signal in opening play. After 1.d4 e6 2.Nf3 Bb4, b4 leaves White's view: the b2-pawn no longer pushes there. A Black piece just landed on b4. Pawn, knight, or bishop, and White can't tell which. But c3 and d2 are visible empty, so a bishop would capture the king next move. White has to defend on that assumption.":
    '開局中也有同樣的信號。在 1.d4 e6 2.Nf3 Bb4 之後，b4 離開了白方的視野：b2 的兵不再能推進到那裡。說明剛有一枚黑方棋子落在了 b4。可能是兵、馬或象，白方無從判斷是哪一個。但 c3 與 d2 都清晰可見且為空，因此一枚象下一步就能吃掉白王。白方只能按這個最壞的假設來防守。',
  "When the opponent takes one of your pieces, the capture square falls to fog. You can't see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?":
    '當對方吃掉你的一枚棋子時，被吃的那個格子會隨即陷入迷霧。你看不到是誰吃的。例如：白方有一個兵在 d5，周圍有四個黑方攻擊者（c6 兵、e6 兵、c7 馬、d7 車）。在 1...exd5 之後，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '現在在 h3 添一枚白象。它的斜線讓 e6 始終處在視野內。同樣走 1...exd5 之後，白方失去 d5，而那枚象看到 e6 變空了。於是可知：是 e 路的兵吃的。',
  'Dark chess deduction usually narrows the problem instead of solving it outright. Once a hidden bishop, rook, queen, or pawn capture is plausible, the practical question is whether your next move still works if that possibility is true.':
    '迷霧國際象棋中的推理通常是縮小問題，而不是一次性解開答案。一旦隱藏的象、車、后或兵吃子變得可信，實際問題就是：如果這種可能性是真的，你下一步是否仍然成立。',
  'That habit is the bridge from rules to strategy: read the fog, name the dangerous possibilities, and defend against the ones that can end the game.':
    '這個習慣就是從規則走向策略的橋樑：讀懂迷霧，說出危險的可能性，並防住那些會直接結束對局的可能。',
  "Here is a complete game between Mistboard's engine and a human, shown from both player views and the server's full position.":
    '下面是一盤 Mistboard 引擎對陣真人的完整對局，同時展示雙方視野和伺服器上的完整局面。',
  'A realistic 41-move game between two decent players.':
    '一盤兩位尚有水平的棋手之間、貼近實戰的 41 回合對局。',
  'Open a board, share the link, play. No account required.':
    '開一局棋，分享連結，開始對弈。無需註冊帳號。',
  "The full source is AGPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard's servers run in production.":
    '完整原始碼以 AGPL-3.0 協議開源。驅動本文每一個局面的視野邏輯，與 Mistboard 伺服器在生產環境中執行的是同一段程式碼。',
  'Play dark chess': '來玩迷霧國際象棋',
  'Read dark chess concepts': '閱讀迷霧國際象棋概念',
  'Read the rules': '閱讀規則',
  "WHITE'S VIEW": '白方視野',
  'SERVER TRUTH': '伺服器真相',
  "BLACK'S VIEW": '黑方視野',
  PAWN: '兵',
  KNIGHT: '馬',
  BISHOP: '象',
  ROOK: '車',
  QUEEN: '后',
  KING: '王',
  BEFORE: '之前',
  AFTER: '之後',
  'EMPTY AHEAD': '前方空曠',
  'BLOCKED AHEAD': '前方受阻',

  // ── Dark Xiangqi / Xiangqi primer ──
  // (shared keys with dark chess intentionally NOT redefined here:
  //  'The starting position', 'What you see', 'Edge cases', 'Draws',
  //  "Here's the same rule, piece by piece.")

  // -- Xiangqi Rules Primer --
  // title + summary
  'Xiangqi Rules Primer': '象棋規則入門',
  'A short guide to the board, pieces, movement rules, and endings you need before reading the Dark Xiangqi rules.':
    '在閱讀迷霧象棋規則之前，先用一篇簡短的指南了解棋盤、棋子、走法規則和終局方式。',
  // intro
  'Xiangqi is the game underneath Dark Xiangqi. If you already play xiangqi, you can skip this primer and go straight to the [Dark Xiangqi rules](/rules/dark-xiangqi). If you know chess but not xiangqi, this page gives you the board, pieces, and rule details you need before fog is added.':
    '象棋是迷霧象棋的底層遊戲。如果你已經會下象棋，可以跳過這篇入門，直接閱讀[迷霧象棋規則](/rules/dark-xiangqi)。如果你會下西洋棋但不會象棋，本頁將在加入迷霧之前，為你講清棋盤、棋子和規則細節。',
  'Dark Xiangqi keeps the xiangqi board and piece movement. The changes come later: hidden enemy pieces, no check warnings, and general capture as the win condition.':
    '迷霧象棋保留了象棋的棋盤和棋子走法。變化在後面：敵方棋子會被隱藏、沒有將軍提示，以及以擒獲將帥作為獲勝條件。',
  // section headings
  'Xiangqi in one minute': '一分鐘看懂象棋',
  'The board': '棋盤',
  'The pieces': '棋子',
  'Rules chess players usually miss': '西洋棋棋手常忽略的規則',
  'Checks and endings': '將軍與終局',
  'Next: Dark Xiangqi': '接下來：迷霧象棋',
  // paragraphs
  'Xiangqi is played by two players: Red and Black. Red moves first. Each side starts with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers.':
    '象棋由兩名玩家對弈：紅方與黑方。紅方先行。每一方開局有 16 枚棋子：一個將（帥）、兩個士（仕）、兩個象（相）、兩個馬、兩個車、兩個炮（砲）和五個兵（卒）。',
  'In normal xiangqi, the goal is to checkmate the opposing general. If a player has no legal move, that player loses. That is different from Western chess, where stalemate is a draw.':
    '在普通象棋中，目標是將死對方的將帥。如果一方無合法走法，則該方告負。這與西洋棋不同，那裡逼和算作和棋。',
  'The board has 9 files and 10 ranks, but pieces sit on the intersections of the lines, not inside squares. Pieces capture by moving to an enemy-occupied point. You cannot land on your own piece.':
    '棋盤有 9 條縱線和 10 條橫線，但棋子落在線的交叉點上，而不是格子內。棋子透過走到敵方佔據的交叉點來吃子。你不能落到自己的棋子上。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers become stronger after crossing it.":
    '**九宮**是每一方底線一側的 3×3 區域。將帥與士仕必須留在己方九宮之內。**楚河漢界**將棋盤分為兩半。象（相）不能過河，而兵（卒）過河之後會變強。',
  '**General:** moves one point horizontally or vertically. It must stay inside the palace.':
    '**將（帥）：**橫向或縱向走一個交叉點。它必須留在九宮之內。',
  '**Advisor:** moves one point diagonally. It must stay inside the palace.':
    '**士（仕）：**斜向走一個交叉點。它必須留在九宮之內。',
  '**Elephant:** moves exactly two points diagonally. It cannot cross the river. If another piece sits on the midpoint of that diagonal, the elephant is blocked.':
    '**象（相）：**沿斜線正好走兩個交叉點（俗稱「象走田」）。它不能過河。如果斜線中點上有別的棋子，象眼被塞住，象就走不了。',
  '**Horse:** moves in an L shape, similar to a chess knight, but it does not jump. If the adjacent leg point is occupied, the horse cannot move in that direction.':
    '**馬：**走「日」字，類似西洋棋的騎士，但牠不能跳越。如果相鄰的馬腿位置上有棋子（蹩馬腿），馬便不能朝那個方向走。',
  '**Chariot:** moves any distance horizontally or vertically, like a rook. It cannot jump over pieces.':
    '**車：**橫向或縱向走任意距離，類似西洋棋的城堡。牠不能越子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it must jump over exactly one intervening piece, called the screen, and land on an enemy piece beyond it.':
    '**炮（砲）：**不吃子時走法與車相同。吃子時，牠必須正好越過一枚中間的棋子（稱為炮架），並落在其後的一枚敵方棋子上。',
  '**Soldier:** moves one point forward. After crossing the river, it may also move one point sideways. It never moves backward and never promotes.':
    '**兵（卒）：**向前走一個交叉點。過河之後，牠還可以橫向走一個交叉點。牠永遠不能後退，也不會升變。',
  'A horse can be blocked. Unlike a knight, it cannot jump over the adjacent leg point.':
    '馬可以被蹩腿。與西洋棋的騎士不同，牠不能跳越相鄰的馬腿位置。',
  'An elephant can be blocked, and it never crosses the river.':
    '象（相）可以被塞象眼，而且牠永遠不過河。',
  'A cannon does not capture like a rook. It needs exactly one screen between itself and the target.':
    '炮（砲）的吃子方式與車不同。牠與目標之間需要正好一個炮架。',
  'The two generals cannot face each other on the same open file in normal xiangqi. A move that exposes that direct line is illegal.':
    '在普通象棋中，雙方的將帥不能在同一條無遮擋的縱線上對臉（將帥對臉，俗稱「白臉將」）。任何讓這條直線暴露出來的走法都是不合法的。',
  'Stalemate is a loss for the player with no legal move, not a draw.':
    '困斃是無合法走法一方的告負，而不是和棋。',
  'In normal xiangqi, a general is in check when an enemy piece attacks it. The checked player must answer the threat. If there is no legal answer, the game ends by checkmate.':
    '在普通象棋中，當敵方棋子攻擊將帥時，即為將軍。被將軍的一方必須應對這一威脅。如果沒有合法的應法，對局以將死結束。',
  'Normal xiangqi also has rules for repetition, perpetual check, and perpetual chase. Those rules can get detailed in tournament play. For this primer, the useful takeaway is simple: normal xiangqi does not allow endless forcing cycles as a free drawing weapon.':
    '普通象棋還有關於重複局面、長將和長捉的規則。這些規則在比賽中會相當細緻。就本篇入門而言，有用的要點很簡單：普通象棋不允許把無止境的逼著循環當作免費的求和手段。',
  'Dark Xiangqi keeps the board, setup, and piece movement above. Then it changes the information and the ending: enemy pieces outside your vision are hidden, there are no check warnings, facing generals are allowed, and the game ends when a general is captured.':
    '迷霧象棋保留了以上的棋盤、佈局和棋子走法。然後它改變了資訊和終局：你視野之外的敵方棋子會被隱藏，沒有將軍提示，允許將帥對臉，並且當將帥被吃掉時對局結束。',
  'That means the same xiangqi tactics still matter, but under fog. Horse legs, elephant eyes, cannon screens, palace geometry, and river-crossed soldiers all become information signals as well as movement rules.':
    '這意味著相同的象棋戰術依然重要，只是處在迷霧之下。蹩馬腿、塞象眼、炮架、九宮的幾何結構，以及過河的兵卒，都既是走法規則，也成了資訊信號。',
  // CTA
  'Read Dark Xiangqi': '閱讀迷霧象棋',

  // -- Dark Xiangqi --
  // title + summary
  'Dark Xiangqi': '迷霧象棋',
  'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.':
    '戰爭迷霧下的象棋：每一方只能看到己方棋子可及的範圍，隱藏的阻擋子至關重要，將帥由被吃而落敗。',
  'Dark Xiangqi is a future variant, not playable yet. There is no set release date.':
    '迷霧象棋是一個未來的變體，目前尚不可對弈，也沒有確定的發布日期。',
  'Back to all rules': '返回全部規則',
  'The ancient game with modern fog: each side sees only what its pieces can reach, no check warnings, and the general falls by capture.':
    '為這門古老的棋類加上現代的迷霧：每一方只能看到己方棋子可及的範圍，沒有將軍提示，將帥由被吃而落敗。',
  // intro
  'Dark Xiangqi is the modern Fog of War version of [xiangqi](/rules/xiangqi): pieces keep their xiangqi movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷霧象棋是[象棋](/rules/xiangqi)的現代「戰爭迷霧」版本：棋子保留象棋的走法，而看不見的敵方棋子保持隱藏、危險也不會被告知。擒獲將帥即獲勝。',
  'If xiangqi is new to you, start with [Xiangqi Rules](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你剛接觸象棋，請先從[象棋規則](/rules/xiangqi)開始。如果你已經會下象棋，下面各節只講解迷霧改變了什麼。',
  // section headings
  'Win condition: general capture': '勝負條件：擒獲將帥',
  'Play status': '對弈狀態',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '將帥對臉',
  'Horse legs': '蹩馬腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog. Your opponent sees a different board from the same true position.':
    '開局時，你能看到己方棋子以及它們所控制的每一個合法落點。其餘一切都是迷霧。你的對手會從同一個真實局面看到一張不同的棋盤。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, horse legs, elephant eyes, and newly opened lines immediately change what you know.':
    '每走一步之後，視野都會根據真實局面重新計算，因此隱藏的阻擋子、炮架、馬腿、象眼，以及新打開的線路都會立刻改變你所掌握的資訊。',
  'Capture the general to win. Checks and checkmates are not announced, and the server does not warn a player who has moved into danger.':
    '擒獲將帥即獲勝。將軍與將死都不會被告知，並且當一方走入危險時，伺服器也不會發出警告。',
  "Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player's view. There is no stalemate draw: if the side to move has no legal move, it loses, and with no check to freeze you, this almost never happens.":
    '對局會在三次重複局面，以及連續 60 個半回合無吃子時自動判和。兩者都依據真實局面判斷，而非任何一方各自的視野。這裡沒有困斃判和：若輪到走子的一方沒有合法著法，則判負；而由於沒有將軍來限制你，這種情況幾乎不會發生。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the target is visible and marked, while the screen appears as unknown occupancy.':
    '炮（砲）不吃子時走法與車相同。吃子時，牠正好越過一個炮架，落在其後的第一枚敵方棋子上。在迷霧下，目標可見且會被標記，而炮架則顯示為未知的佔據狀態。',
  'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.':
    '正統象棋禁止將帥對臉。迷霧象棋允許這種局面；如果一方的將帥在一條無遮擋的縱線上看到了對方將帥，便可以沿該縱線將其吃掉。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有當相鄰的馬腿位置空著時，馬才能走動。如果有一枚隱藏的棋子蹩住了那條馬腿，落點就會從你的可見集合中消失，而馬腿位置則顯示為一個「?」標記。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜線走兩個交叉點，且不能過河。如果有一枚隱藏的棋子塞在中點的象眼上，斜線落點就會消失，而象眼位置則顯示為一個「?」標記。',
  'Playable Dark Xiangqi games are not public yet. These rules are published first so players can review the variant before live play opens.':
    '可對弈的迷霧象棋目前尚未公開。這些規則先行發布，好讓玩家在實戰開放之前先了解這一變體。',

  // -- Jieqi (rules) --
  'Jieqi (揭棋) Rules': '揭棋規則',
  'Jieqi (揭棋) rules: xiangqi with hidden non-general pieces that first move by starting point, then reveal and play by identity.':
    '揭棋規則：在象棋基礎上將除將帥以外的棋子全部暗置，暗子先按所在起始位置的兵種行棋，走子後翻明並按真實身份行棋。',
  "Jieqi (揭棋, 'reveal chess') keeps xiangqi's board and checkmate goal, but hides every non-general piece. A dark piece first moves, attacks, and captures by the starting point it occupies. After that move, it reveals and plays by identity.":
    '揭棋（意為「翻開的棋」）沿用象棋的棋盤和將死取勝的目標，但把除將帥以外的每一枚棋子都暗置。暗子最初的走子、攻擊和吃子都按牠所在的起始位置對應的兵種進行。走出那一步之後，牠便翻明，並按真實身份行棋。',
  'Use [Xiangqi Rules](/rules/xiangqi) for the base game. This page covers what changes.':
    '底層遊戲請參閱[象棋規則](/rules/xiangqi)。本頁只講解揭棋改變了什麼。',
  Setup: '佈局',
  "Set each general face-up on its normal palace point. Shuffle each side's other fifteen pieces and deal them face-down onto the remaining starting points. Neither player knows any hidden identities, including their own.":
    '將雙方的將帥各自正面朝上擺在九宮內通常的位置。把每一方其餘十五枚棋子洗混，背面朝下地發到剩餘的起始位置上。任何一方都不知道任何暗子的身份，包括自己的暗子。',
  'First moves use starting points': '首步按起始位置行棋',
  'Before reveal, a dark piece uses the role of the starting point it occupies, not its hidden identity. A dark piece on a corner point plays like a chariot; dark pieces on horse, advisor, elephant, cannon, and soldier points use those matching moves.':
    '翻明之前，暗子按其所在起始位置對應的兵種行棋，而不是按牠隱藏的真實身份。位於角點的暗子像車一樣走；位於馬、士、象、炮、兵起始位置上的暗子，則分別按這些兵種的走法行棋。',
  'The normal restrictions still apply to that first move: horse legs, elephant eyes, cannon screens, palace limits for advisor points, and the river limit for elephant points. Once the move resolves, the piece flips face-up for both players.':
    '通常的限制對這首步同樣適用：蹩馬腿、塞象眼、炮架，士位受九宮限制，象位受河界限制。這步走完後，該棋子即對雙方翻為正面朝上。',
  'Revealed pieces use identity': '翻明後的棋子按真實身份行棋',
  "After reveal, use the piece's identity from its current point. Advisors may leave the palace, and elephants may cross the river. Their movement shapes do not change: advisors step one point diagonally; elephants move two points diagonally and are still eye-blocked.":
    '翻明之後，棋子從牠當前所在的位置按其真實身份行棋。士可以離開九宮，象可以過河。牠們的走子形狀不變：士斜走一個交叉點；象斜走兩個交叉點，並且仍會被塞象眼。',
  'Horses, chariots, and cannons move normally. Soldiers use the normal river rule from wherever they reveal: forward only before crossing, forward or sideways after crossing, never backward.':
    '馬、車、炮按常規走法行棋。兵（卒）則從牠翻明的位置起套用通常的過河規則：過河前只能向前，過河後可向前或橫走，永不後退。',
  'Captured dark pieces': '被吃掉的暗子',
  'If a dark piece is captured before revealing, only the capturer learns what it was. The owner sees one dark piece leave the board, but not its identity. Later, the capturer can rule out that hidden identity elsewhere.':
    '如果一枚暗子在翻明之前被吃掉，只有吃子的一方知道牠是什麼。棋子的主人只看到一枚暗子離開棋盤，卻看不到牠的身份。此後，吃子的一方便可以排除其他位置上存在這個隱藏身份的可能。',
  'This reference uses the common Jieqi convention: the capturer sees it. Some cờ úp groups handle captured dark pieces differently, so agree on the convention before over-the-board play.':
    '本規則參考採用揭棋的常見約定：吃子一方可見。某些 cờ úp（越南揭棋）流派對被吃暗子的處理方式不同，因此在線下實地對弈前應先就採用的約定達成一致。',
  'Checks, wins, and draws': '將軍、勝負與和棋',
  "Every occupied point is visible, so players can see when the general is attacked. An unmoved dark piece attacks from its starting point using that point's role. Once it moves, it reveals immediately; any check from the destination uses the revealed identity.":
    '每個被佔據的交叉點都是可見的，因此雙方都能看出將帥何時受到攻擊。尚未走動的暗子按其起始位置對應的兵種從該位置發動攻擊。一旦走動，牠立即翻明；任何來自落點的將軍都按翻明後的真實身份計算。',
  'Win by checkmating the general or leaving the opponent with no legal move. The facing-generals rule still applies, and dark pieces block the file like any other piece.':
    '將死對方將帥，或讓對方無合法走法可走，即可獲勝。將帥對臉的規則依然有效，暗子也和其他棋子一樣會擋住縱線。',
  'Repetition follows xiangqi long-beat rules, not a generic threefold or fourfold result. Perpetual check and direct perpetual chase are forbidden, so the forcing side must change course or lose; mutual forcing and ordinary repeated positions are judged by the xiangqi cycle, not by board equality alone. The automatic draw convention in this reference is the Guangdong/Tencent no-capture clock: 60 full moves, meaning 120 plies, without a capture.':
    '重複局面依照象棋的長打規則裁定，而不是籠統地按三次或四次重複出結果。長將和直接的長捉都被禁止，因此發動逼著的一方必須改變著法，否則判負；互打以及普通的重複局面則依據象棋的循環判例裁定，而不能只看局面是否相同。本規則參考採用的自動判和約定是廣東／騰訊的無吃子回合數：連續 60 個完整回合（即 120 個半回合）無吃子即判和。',
  Names: '名稱',
  '揭棋 is Mandarin jiēqí, meaning reveal chess. Luo Jinsheng of Guangzhou invented it in the 1980s. Vietnamese play commonly calls this family cờ úp.':
    '揭棋的官話讀音為 jiēqí，意為「翻開的棋」。它由廣州的羅錦生於 20 世紀 80 年代發明。越南的玩法通常把這一類遊戲稱為 cờ úp。',
  'English names overlap. Dark Chinese chess may refer to jieqi, but it can also mean [banqi](/rules/banqi), a different half-board flip game. Jieqi keeps the full xiangqi board and checkmate goal; banqi uses a 4x8 board, rank captures, and elimination.':
    '英文名稱常有重疊。「Dark Chinese chess」可能指揭棋，但也可能指[暗棋](/rules/banqi)（banqi），那是另一種半盤翻子遊戲。揭棋保留完整的象棋棋盤和將死取勝的目標；暗棋則使用 4×8 的棋盤，按子力等級吃子，以吃光對方取勝。',
  'Mistboard also uses [Dark Xiangqi](/rules/dark-xiangqi) and Dark Mini Xiangqi for our Fog of War xiangqi variants. Those are not jieqi: identities stay known, but unseen points are hidden. We have not found an earlier public playable platform for Fog of War xiangqi.':
    'Mistboard 還以[迷霧象棋](/rules/dark-xiangqi)和迷霧迷你象棋作為我們的戰爭迷霧象棋變體。它們並不是揭棋：棋子的身份始終是已知的，只是看不到的交叉點被隱藏起來。我們尚未發現更早的、可公開對弈的戰爭迷霧象棋平台。',
  'Jieqi is playable on Mistboard. Take on PikaJieQi, our jieqi engine, at the strength you pick. For the base game, read xiangqi; for the other face-down xiangqi cousin, compare banqi.':
    '揭棋現在已可在 Mistboard 上對弈。來挑戰我們的揭棋引擎 PikaJieQi，強度由你選擇。底層遊戲請閱讀象棋；另一種翻面的象棋近親，可對照暗棋。',
  'Play vs PikaJieQi': '對戰 PikaJieQi',
  'Step through a full self-play game below. Dark pieces show as colored backs and flip to their dealt identity the first time they move, so a corner that plays like a chariot can reveal a soldier. Red wins by checkmate.':
    '在下方逐步查看一整盤自我對弈的棋局。暗子以彩色背面顯示，第一次走動時翻開，顯示其發到的身份，因此一個像車一樣走子的角落棋子，翻開後可能是一個兵。紅方以將死獲勝。',
  Banqi: '暗棋',
};

const ARTICLE_DICTS: Record<ArticleLang, Record<string, string>> = {
  'zh-Hans': ZH_HANS,
  'zh-Hant': ZH_HANT,
};

function deepTranslate<T>(value: T, dict: Record<string, string>): T {
  if (typeof value === 'string') return (dict[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => deepTranslate(v, dict)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepTranslate(v, dict);
    return out as T;
  }
  return value;
}

// Returns a deep copy of the article with content strings swapped to `lang`.
// Strings absent from the dictionary fall through as English (graceful partial
// translation). Does not mutate the source article.
export function translateArticle(article: Article, lang: ArticleLang): Article {
  return deepTranslate(article, ARTICLE_DICTS[lang]);
}

// True when `text` has an authored translation for `lang`. The translation
// coverage test uses this to assert that every prose string in a locked
// article resolves in both zh scripts, so an English edit that orphans a
// dictionary key fails the build instead of silently rendering English.
export function hasTranslation(lang: ArticleLang, text: string): boolean {
  return Object.hasOwn(ARTICLE_DICTS[lang], text);
}

// Every authored dictionary key for `lang`. The coverage reporter uses this to
// flag orphaned keys: entries that no longer match any current article string
// (the residue of an English edit that left a stale translation behind).
export function translationKeys(lang: ArticleLang): string[] {
  return Object.keys(ARTICLE_DICTS[lang]);
}
