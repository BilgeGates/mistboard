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
  // title + summary
  'Dark Chess Rules': '迷雾国际象棋规则',
  'A side sees only what its pieces can legally see. King capture ends the game, not checkmate. Everything else is regular chess.':
    '每一方只能看到己方棋子合法可及的范围。吃掉国王即终局，而非将死。其余一切与普通国际象棋相同。',
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
  '[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side\'s visibility is derived from where its pieces can legally move.':
    '[迷雾国际象棋](https://en.wikipedia.org/wiki/Dark_chess)（又称「战争迷雾」）由 Jens Bæk Nielsen 与 Torben Osted 于 1989 年发明。它属于「隐式迷雾」的一支：没有裁判，也没有侦察动作。每一方的视野完全由己方棋子的合法走法范围推导而来。',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷雾国际象棋不只关乎你看得见的棋子。被迷雾遮住的格子、消失的目的地和不见的棋子本身也是信息。这个概念系列从最有用的习惯开始：读懂迷雾正在告诉你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通国际象棋规则](https://zh.wikipedia.org/zh-hans/国际象棋规则)）可以合法走到的格子，以及棋子当前所在的格子。其余一切都笼罩在迷雾之中。',
  "Here's the same rule, piece by piece.": '同一条规则，逐子来看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '视野随棋子移动。当一个棋子走动时，它原先覆盖的格子会重新陷入黑暗（除非另有棋子仍能看到它们），而它新触及的格子则会亮起。',
  'Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece\'s vision ends where its movement ends.':
    '注意 d7 的车能看到 b7 的后和 h7 的王，却看不到 a7。棋子的视野止于它走法的尽头。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '当一方的王被吃掉时，对局即告结束。没有将军，没有将死，也没有任何预警。',
  'Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player\'s view. There is no stalemate draw and no insufficient-material draw.':
    'Mistboard 会在三次重复局面（同一真实局面出现三次，且轮到走子的一方相同、王车易位权与吃过路兵权也相同）或五十回合规则（连续五十个回合无兵的走动、也无吃子）时自动判和。两条规则都针对真实局面，而非任何一方各自的视野。这里没有逼和，也没有子力不足判和。',
  'Games auto-draw on threefold repetition (same position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player\'s view. No stalemate, no insufficient-material draw.':
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
  'When the opponent takes one of your pieces, the capture square falls to fog. You can\'t see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?':
    '当对方吃掉你的一枚棋子时，被吃的那个格子会随即陷入迷雾。你看不到是谁吃的。例如：白方有一个兵在 d5，周围有四个黑方攻击者（c6 兵、e6 兵、c7 马、d7 车）。在 1...exd5 之后，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '现在在 h3 添一枚白象。它的斜线让 e6 始终处在视野内。同样走 1...exd5 之后，白方失去 d5，而那枚象看到 e6 变空了。于是可知：是 e 路的兵吃的。',
  'Dark chess deduction usually narrows the problem instead of solving it outright. Once a hidden bishop, rook, queen, or pawn capture is plausible, the practical question is whether your next move still works if that possibility is true.':
    '迷雾国际象棋中的推理通常是缩小问题，而不是一次性解开答案。一旦隐藏的象、车、后或兵吃子变得可信，实际问题就是：如果这种可能性是真的，你下一步是否仍然成立。',
  'That habit is the bridge from rules to strategy: read the fog, name the dangerous possibilities, and defend against the ones that can end the game.':
    '这个习惯就是从规则走向策略的桥梁：读懂迷雾，说出危险的可能性，并防住那些会直接结束对局的可能。',
  "Here is a complete engine game, shown from both player views and the server's full position.":
    '下面是一盘完整的引擎对局，同时展示双方视野和服务器上的完整局面。',
  'A realistic 41-move game between two decent players.': '一盘两位尚有水平的棋手之间、贴近实战的 41 回合对局。',
  'Open a board, share the link, play. No account required.': '开一局棋，分享链接，开始对弈。无需注册账号。',
  'The full source is AGPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard\'s servers run in production.':
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
  'The **palace** is the 3 by 3 box on each player\'s back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers become stronger after crossing it.':
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
  'The ancient game with modern fog: each side sees only what its pieces can reach, no check warnings, and the general falls by capture.':
    '为这门古老的棋类加上现代的迷雾：每一方只能看到己方棋子可及的范围，没有将军提示，将帅由被吃而落败。',
  // intro
  'Dark Xiangqi is the modern Fog of War version of [xiangqi](/rules/xiangqi): pieces move by standard xiangqi rules, while unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷雾象棋是[象棋](/rules/xiangqi)的现代「战争迷雾」版本：棋子按标准象棋规则走动，而看不见的敌方棋子保持隐藏、危险也不会被告知。擒获将帅即获胜。',
  'If xiangqi is new to you, start with the [Xiangqi Rules Primer](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你刚接触象棋，请先从[象棋规则入门](/rules/xiangqi)开始。如果你已经会下象棋，下面各节只讲解迷雾改变了什么。',
  // section headings
  'Win condition: general capture': '胜负条件：擒获将帅',
  'Play status': '对弈状态',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '将帅对脸',
  'Horse legs': '蹩马腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog.':
    '开局时，你能看到己方棋子以及它们所控制的每一个合法落点。其余一切都是迷雾。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, and newly opened lines immediately change what you know.':
    '每走一步之后，视野都会根据真实局面重新计算，因此隐藏的阻挡子、炮架，以及新打开的线路都会立刻改变你所掌握的信息。',
  'Capture the general to win. Checks and checkmates are not announced.':
    '擒获将帅即获胜。将军与将死都不会被告知。',
  'Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player\'s view. No stalemate draws.':
    '对局会在三次重复局面，以及连续 60 个半回合无吃子时自动判和。两者都依据真实局面判断，而非任何一方各自的视野。不存在困毙判和。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the target is visible and marked, while the screen appears as unknown occupancy.':
    '炮（砲）不吃子时走法与车相同。吃子时，它正好越过一个炮架，落在其后的第一枚敌方棋子上。在迷雾下，目标可见且会被标记，而炮架则显示为未知的占据状态。',
  'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture.':
    '正统象棋禁止将帅对脸。迷雾象棋允许这种局面；如果一方的将帅在一条无遮挡的纵线上看到了对方将帅，便可以将其吃掉。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有当相邻的马腿位置空着时，马才能走动。如果有一枚隐藏的棋子蹩住了那条马腿，落点就会从你的可见集合中消失，而马腿位置则显示为一个「?」标记。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜线走两个交叉点，且不能过河。如果有一枚隐藏的棋子塞在中点的象眼上，斜线落点就会消失，而象眼位置则显示为一个「?」标记。',
  'Playable Dark Xiangqi games are not public yet. These rules are published first so players can review the variant before live play opens.':
    '可对弈的迷雾象棋目前尚未公开。这些规则先行发布，好让玩家在实战开放之前先了解这一变体。',
};

const ZH_HANT: Record<string, string> = {
  'Dark Chess Rules': '迷霧國際象棋規則',
  'A side sees only what its pieces can legally see. King capture ends the game, not checkmate. Everything else is regular chess.':
    '每一方只能看到己方棋子合法可及的範圍。吃掉國王即終局，而非將死。其餘一切與普通國際象棋相同。',
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
  '[Dark chess](https://en.wikipedia.org/wiki/Dark_chess) (also called Fog of War) was invented by Jens Bæk Nielsen and Torben Osted in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side\'s visibility is derived from where its pieces can legally move.':
    '[迷霧國際象棋](https://en.wikipedia.org/wiki/Dark_chess)（又稱「戰爭迷霧」）由 Jens Bæk Nielsen 與 Torben Osted 於 1989 年發明。它屬於「隱式迷霧」的一支：沒有裁判，也沒有偵察動作。每一方的視野完全由己方棋子的合法走法範圍推導而來。',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷霧國際象棋不只關乎你看得見的棋子。被迷霧遮住的格子、消失的目的地和不見的棋子本身也是資訊。這個概念系列從最有用的習慣開始：讀懂迷霧正在告訴你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通國際象棋規則](https://zh.wikipedia.org/zh-hant/国际象棋规则)）可以合法走到的格子，以及棋子當前所在的格子。其餘一切都籠罩在迷霧之中。',
  "Here's the same rule, piece by piece.": '同一條規則，逐子來看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '視野隨棋子移動。當一個棋子走動時，它原先覆蓋的格子會重新陷入黑暗（除非另有棋子仍能看到它們），而它新觸及的格子則會亮起。',
  'Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece\'s vision ends where its movement ends.':
    '注意 d7 的車能看到 b7 的后和 h7 的王，卻看不到 a7。棋子的視野止於它走法的盡頭。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '當一方的王被吃掉時，對局即告結束。沒有將軍，沒有將死，也沒有任何預警。',
  'Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player\'s view. There is no stalemate draw and no insufficient-material draw.':
    'Mistboard 會在三次重複局面（同一真實局面出現三次，且輪到走子的一方相同、王車易位權與吃過路兵權也相同）或五十回合規則（連續五十個回合無兵的走動、也無吃子）時自動判和。兩條規則都針對真實局面，而非任何一方各自的視野。這裡沒有逼和，也沒有子力不足判和。',
  'Games auto-draw on threefold repetition (same position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player\'s view. No stalemate, no insufficient-material draw.':
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
  'When the opponent takes one of your pieces, the capture square falls to fog. You can\'t see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?':
    '當對方吃掉你的一枚棋子時，被吃的那個格子會隨即陷入迷霧。你看不到是誰吃的。例如：白方有一個兵在 d5，周圍有四個黑方攻擊者（c6 兵、e6 兵、c7 馬、d7 車）。在 1...exd5 之後，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '現在在 h3 添一枚白象。它的斜線讓 e6 始終處在視野內。同樣走 1...exd5 之後，白方失去 d5，而那枚象看到 e6 變空了。於是可知：是 e 路的兵吃的。',
  'Dark chess deduction usually narrows the problem instead of solving it outright. Once a hidden bishop, rook, queen, or pawn capture is plausible, the practical question is whether your next move still works if that possibility is true.':
    '迷霧國際象棋中的推理通常是縮小問題，而不是一次性解開答案。一旦隱藏的象、車、后或兵吃子變得可信，實際問題就是：如果這種可能性是真的，你下一步是否仍然成立。',
  'That habit is the bridge from rules to strategy: read the fog, name the dangerous possibilities, and defend against the ones that can end the game.':
    '這個習慣就是從規則走向策略的橋樑：讀懂迷霧，說出危險的可能性，並防住那些會直接結束對局的可能。',
  "Here is a complete engine game, shown from both player views and the server's full position.":
    '下面是一盤完整的引擎對局，同時展示雙方視野和伺服器上的完整局面。',
  'A realistic 41-move game between two decent players.': '一盤兩位尚有水平的棋手之間、貼近實戰的 41 回合對局。',
  'Open a board, share the link, play. No account required.': '開一局棋，分享連結，開始對弈。無需註冊帳號。',
  'The full source is AGPL-3.0. The visibility logic that powers every position in this article is the same code path Mistboard\'s servers run in production.':
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
  'The **palace** is the 3 by 3 box on each player\'s back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers become stronger after crossing it.':
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
  'The ancient game with modern fog: each side sees only what its pieces can reach, no check warnings, and the general falls by capture.':
    '為這門古老的棋類加上現代的迷霧：每一方只能看到己方棋子可及的範圍，沒有將軍提示，將帥由被吃而落敗。',
  // intro
  'Dark Xiangqi is the modern Fog of War version of [xiangqi](/rules/xiangqi): pieces move by standard xiangqi rules, while unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷霧象棋是[象棋](/rules/xiangqi)的現代「戰爭迷霧」版本：棋子按標準象棋規則走動，而看不見的敵方棋子保持隱藏、危險也不會被告知。擒獲將帥即獲勝。',
  'If xiangqi is new to you, start with the [Xiangqi Rules Primer](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你剛接觸象棋，請先從[象棋規則入門](/rules/xiangqi)開始。如果你已經會下象棋，下面各節只講解迷霧改變了什麼。',
  // section headings
  'Win condition: general capture': '勝負條件：擒獲將帥',
  'Play status': '對弈狀態',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '將帥對臉',
  'Horse legs': '蹩馬腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog.':
    '開局時，你能看到己方棋子以及它們所控制的每一個合法落點。其餘一切都是迷霧。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, and newly opened lines immediately change what you know.':
    '每走一步之後，視野都會根據真實局面重新計算，因此隱藏的阻擋子、炮架，以及新打開的線路都會立刻改變你所掌握的資訊。',
  'Capture the general to win. Checks and checkmates are not announced.':
    '擒獲將帥即獲勝。將軍與將死都不會被告知。',
  'Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player\'s view. No stalemate draws.':
    '對局會在三次重複局面，以及連續 60 個半回合無吃子時自動判和。兩者都依據真實局面判斷，而非任何一方各自的視野。不存在困斃判和。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the target is visible and marked, while the screen appears as unknown occupancy.':
    '炮（砲）不吃子時走法與車相同。吃子時，牠正好越過一個炮架，落在其後的第一枚敵方棋子上。在迷霧下，目標可見且會被標記，而炮架則顯示為未知的佔據狀態。',
  'Orthodox xiangqi forbids facing generals. Dark Xiangqi allows the position; if one general sees the other on a clear file, it can capture.':
    '正統象棋禁止將帥對臉。迷霧象棋允許這種局面；如果一方的將帥在一條無遮擋的縱線上看到了對方將帥，便可以將其吃掉。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有當相鄰的馬腿位置空著時，馬才能走動。如果有一枚隱藏的棋子蹩住了那條馬腿，落點就會從你的可見集合中消失，而馬腿位置則顯示為一個「?」標記。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜線走兩個交叉點，且不能過河。如果有一枚隱藏的棋子塞在中點的象眼上，斜線落點就會消失，而象眼位置則顯示為一個「?」標記。',
  'Playable Dark Xiangqi games are not public yet. These rules are published first so players can review the variant before live play opens.':
    '可對弈的迷霧象棋目前尚未公開。這些規則先行發布，好讓玩家在實戰開放之前先了解這一變體。',
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
