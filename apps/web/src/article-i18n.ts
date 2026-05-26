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
