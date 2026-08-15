// Localized text for the basic-endgame study.
//
// The seeder builds every chapter name and root comment out of four corpus
// fields (attacker, defender, note, engineDispute) and a fixed template. So the
// translation surface is that vocabulary plus the template, NOT 32 hand-written
// chapters: translating the parts keeps the zh chapters generated the same way
// the English ones are, and stops the two from drifting when the corpus changes.
//
// Dictionaries are keyed by the English source string, exactly like
// article-i18n.ts and announcement-i18n.ts. A missing key falls back to English
// for that one string, which is the same degrade-one-string-at-a-time contract
// study-i18n.ts states for the overlay itself.
//
// Note that study-i18n.ts warns "base is not a synonym for English" — the
// curated classical studies are authored Chinese-first. This study is the other
// case: it is authored in English (the whole point is that these verdicts are
// hard to find in English), so here base IS English and zh is the translation.
//
// Terminology follows standard xiangqi endgame usage rather than literal
// translation: 例胜 / 例和 for the book verdicts, 高兵 for an unadvanced soldier,
// 士象全 for the full four-piece defence, 炮架 for a cannon's platform, 欠行 for
// zugzwang. Piece names follow each script's convention (车/車, 炮/砲, 马/馬).
import type { EndgameEntry } from '@mistboard/game';

export const ENDGAME_STUDY_LANGS = ['zh-Hans', 'zh-Hant'] as const;
export type EndgameStudyLang = (typeof ENDGAME_STUDY_LANGS)[number];

/** Attacking and defending material, as written in the corpus. */
const MATERIAL: Record<EndgameStudyLang, Record<string, string>> = {
  'zh-Hans': {
    // attackers
    'One soldier, across the river': '一个过河兵',
    'One soldier (with general and elephant)': '一个兵（另有帅和相）',
    'Five soldiers, all on the last rank': '五个兵，全在底线',
    'Two unadvanced soldiers': '双高兵',
    'Three unadvanced soldiers': '三高兵',
    'General and soldier': '帅和一个兵',
    'Two soldiers and an elephant': '双兵和一个相',
    'A bare horse': '单马',
    'A horse and one unadvanced soldier': '马和一个高兵',
    'Two horses': '双马',
    'A bare cannon': '单炮',
    'A cannon and one advisor': '炮和一个仕',
    'A cannon with all four defensive pieces': '炮仕相全',
    'Horse and cannon, both sides with four defensive pieces': '马炮，双方均士象全',
    'A bare chariot': '单车',
    'A chariot and cannon, no defensive pieces': '车炮，无仕相',
    'A chariot and cannon with all four defensive pieces': '车炮仕相全',
    'Two chariots': '双车',
    // defenders
    'Bare general': '光将',
    'One advisor': '单士',
    'Two advisors': '双士',
    'Two elephants': '双象',
    'One advisor and one elephant': '单士单象',
    'All four defensive pieces (士象全)': '士象全',
    'All four defensive pieces': '士象全',
    'A horse and two advisors': '马双士',
    'A cannon and two elephants': '炮双象',
    'Two soldiers': '双卒',
    'A bare advisor': '单士',
    'A bare elephant': '单象',
    'A bare elephant, caught on one flank': '单象，被逼在一侧',
    'Three defensive pieces': '士象不全（三子）',
    'A horse': '单马',
    'A cannon': '单炮',
    'A horse and two elephants, in the drawing fortress': '马双象，摆成例和阵形',
    'A horse and two elephants, one elephant misplaced': '马双象，其中一象位置有误',
    'Two minor pieces, no defensive pieces': '两个小子，无士象',
    'A bare chariot holding the middle file': '单车占住中路',
    'A chariot with all four defensive pieces': '车士象全',
    'A chariot and all four defensive pieces': '车士象全',
    'Two horses and all four defensive pieces': '双马士象全',
  },
  'zh-Hant': {
    // attackers
    'One soldier, across the river': '一個過河兵',
    'One soldier (with general and elephant)': '一個兵（另有帥和相）',
    'Five soldiers, all on the last rank': '五個兵，全在底線',
    'Two unadvanced soldiers': '雙高兵',
    'Three unadvanced soldiers': '三高兵',
    'General and soldier': '帥和一個兵',
    'Two soldiers and an elephant': '雙兵和一個相',
    'A bare horse': '單馬',
    'A horse and one unadvanced soldier': '馬和一個高兵',
    'Two horses': '雙馬',
    'A bare cannon': '單砲',
    'A cannon and one advisor': '砲和一個仕',
    'A cannon with all four defensive pieces': '砲仕相全',
    'Horse and cannon, both sides with four defensive pieces': '馬砲，雙方均士象全',
    'A bare chariot': '單車',
    'A chariot and cannon, no defensive pieces': '車砲，無仕相',
    'A chariot and cannon with all four defensive pieces': '車砲仕相全',
    'Two chariots': '雙車',
    // defenders
    'Bare general': '光將',
    'One advisor': '單士',
    'Two advisors': '雙士',
    'Two elephants': '雙象',
    'One advisor and one elephant': '單士單象',
    'All four defensive pieces (士象全)': '士象全',
    'All four defensive pieces': '士象全',
    'A horse and two advisors': '馬雙士',
    'A cannon and two elephants': '砲雙象',
    'Two soldiers': '雙卒',
    'A bare advisor': '單士',
    'A bare elephant': '單象',
    'A bare elephant, caught on one flank': '單象，被逼在一側',
    'Three defensive pieces': '士象不全（三子）',
    'A horse': '單馬',
    'A cannon': '單砲',
    'A horse and two elephants, in the drawing fortress': '馬雙象，擺成例和陣形',
    'A horse and two elephants, one elephant misplaced': '馬雙象，其中一象位置有誤',
    'Two minor pieces, no defensive pieces': '兩個小子，無士象',
    'A bare chariot holding the middle file': '單車佔住中路',
    'A chariot with all four defensive pieces': '車士象全',
    'A chariot and all four defensive pieces': '車士象全',
    'Two horses and all four defensive pieces': '雙馬士象全',
  },
};

/** Free prose: the `note` and `engineDispute` fields. */
const PROSE: Record<EndgameStudyLang, Record<string, string>> = {
  'zh-Hans': {
    'Wins as long as the soldier has not reached the last rank, where it can no longer advance.':
      '只要兵还没走到底线就能取胜，到了底线便无法再前进。',
    'Tempo decides it: Red to play wins, Black to play draws. The general rule is that any extra defensive piece draws, and this is the case that takes real technique.':
      '先手决定胜负：红先胜，黑先和。通例是防守方多一个士象即可求和，而这一型最考验实战功夫。',
    'Soldiers cannot move backward, so on the last rank five of them still cannot force mate or stalemate. Material is not the same thing as mating power.':
      '兵不能后退，所以五个兵全到底线仍然既不能将死也不能困毙对方。子力多寡不等于杀棋能力。',
    'A cannon with no platform to jump is close to useless on defence.':
      '没有炮架可借的炮，在防守中几乎起不到作用。',
    'The mixed pair defends where either pair alone does not: the advisor covers the palace, the elephant covers the approach.':
      '一士一象比双士或双象更好守：士守住九宫，象守住通路。',
    'The headline surprise of xiangqi endgames: three soldiers beat the full defence, while a chariot does not.':
      '象棋残局中最出人意料的一条：三高兵可胜士象全，而一个车反而不能。',
    'Red wins with either side to move. 1.Gd1 is a waiting move that puts Black in zugzwang; the win comes from the red general seizing the middle file, not from the soldier alone.':
      '无论谁先走红方都胜。1.帅四九是等着，令黑方欠行；取胜靠的是红帅占住中路，而不是单靠那个兵。',
    'Reciprocal zugzwang: whoever moves first loses. Set for Black to move, so the verdict is a Red win; flip the side to move and it is a Black win.':
      '双方欠行：谁先走谁负。此局面设为黑先，故结论是红胜；把先走方改为红方，则变成黑胜。',
    'The horse beats a lone advisor but not a lone elephant, which can shuttle between flanks faster than the horse can cut it off.':
      '马可胜单士，却不能胜单象：象在两翼往返的速度快过马的封锁。',
    'The same material as above, but tempo-dependent: Red to play wins with 1.Hd7, cutting the elephant off from the far flank. Black to play draws with 1...Ee8. This is why the class verdict is a draw and this position is not.':
      '子力与上一型相同，但取决于先手：红先走马四七，切断象通往远侧的退路即胜；黑先走象５进７则和。这正是该类残局的通例判和、而此一局面判胜的原因。',
    'The fourth defensive piece is the whole difference between this and the win above.':
      '与上一型的胜局相比，差别只在于防守方多了第四个士象。',
    'Two horses beat the full defence; a chariot, worth more than both, does not.':
      '双马可胜士象全；而子力价值高于双马的车却不能。',
    'A cannon needs a platform to capture, so with nothing to jump it cannot mate. Adding elephants does not help; it needs an advisor, which can screen on any of the three central files.':
      '炮吃子必须借炮架，无子可借便无法成杀。加象没有用，需要的是士，因为士能在中路三条线上任意一条充当炮架。',
    '1.Ge3 wins an advisor: 1...Gd9 runs into 2.Ae2#, and after 1...Ge10 2.Cxd8 the recapture is illegal because the advisor is pinned by the facing generals.':
      '1.帅五进二可得一士：1...将４进１则2.仕五进六杀；1...将５进１则2.炮打士，黑方无法吃回，因为该士被白脸将牵制。',
    'A cannon needs at least an extra soldier to break the full defence.':
      '炮要破士象全，至少还需要一个兵。',
    'Same attacking material, and the defending minor piece alone flips the result: a cannon holds where a horse does not.':
      '进攻子力相同，仅仅换掉防守方的那个小子，结果就翻转：炮守得住，马守不住。',
    'The strongest piece on the board cannot break the full defence, though three soldiers or two horses can. Piece values do not survive into the basic endgames.':
      '盘上最强的子破不了士象全，而三高兵或双马却可以。子力价值那一套到了基本残局就不成立了。',
    'This exact arrangement holds. Most other defensive placements of the same material lose, which is what makes it a fortress rather than a material verdict.':
      '只有摆成这一阵形才守得住。同样的子力换成其他大多数摆法都要输，所以这是一个阵形问题，而不是子力问题。',
    'The fortress above with the g6 elephant moved to g10 instead. Same material, same attacker, and now Red wins starting with 1.Rb7. The pair is the clearest demonstration in the corpus that material does not decide these endgames.':
      '把上一型阵形中位于３路的象改摆到底线。子力相同，进攻方也相同，红方却可以走车二进六取胜。这一对局面最能说明：这类残局不是由子力决定的。',
    'Drawn, but the defence needs accurate placement.': '和棋，但防守方的位置必须准确。',
    'Pikafish finds a forced mate from every placement we tried, including this one (the most resistant of eight). Either the drawing setup is narrower than we could reconstruct, or the defence depends on resources the engine scores differently. Do not rely on this row.':
      'Pikafish 在我们尝试过的每一种摆法中都算出了必杀，包括本局面（八种当中最顽强的一种）。要么求和的阵形比我们能复原的更窄，要么防守依赖的手段被引擎另作评估。此条结论不可依赖。',
    'The defending chariot on the middle file is what draws. Give the attacker any single defensive piece and it becomes a win.':
      '和棋靠的是防守方的车占住中路。只要进攻方多任何一个士或象，就变成胜势。',
    'Pikafish scores this as clearly winning for Red from every placement of the defending chariot we tried. One plausible reason: with both generals bare, the defence leans on checking resources, and perpetual check is a LOSS in xiangqi rather than the draw the analogous chess endgame would give. Do not rely on this row.':
      '在我们尝试过的每一种防守车位上，Pikafish 都判红方明显占优。一种说得通的解释是：双方都没有士象时，防守要靠连续将军，而象棋中长将判负，不像国际象棋中同类残局可以长将求和。此条结论不可依赖。',
    'Drawn with good defensive placement.': '防守位置得当即可求和。',
    'Two horses is the losing pair; other two-minor-piece combinations hold.':
      '双马这一组合守不住；其他两个小子的组合则可以守和。',
  },
  'zh-Hant': {
    'Wins as long as the soldier has not reached the last rank, where it can no longer advance.':
      '只要兵還沒走到底線就能取勝，到了底線便無法再前進。',
    'Tempo decides it: Red to play wins, Black to play draws. The general rule is that any extra defensive piece draws, and this is the case that takes real technique.':
      '先手決定勝負：紅先勝，黑先和。通例是防守方多一個士象即可求和，而這一型最考驗實戰功夫。',
    'Soldiers cannot move backward, so on the last rank five of them still cannot force mate or stalemate. Material is not the same thing as mating power.':
      '兵不能後退，所以五個兵全到底線仍然既不能將死也不能困斃對方。子力多寡不等於殺棋能力。',
    'A cannon with no platform to jump is close to useless on defence.':
      '沒有砲架可借的砲，在防守中幾乎起不到作用。',
    'The mixed pair defends where either pair alone does not: the advisor covers the palace, the elephant covers the approach.':
      '一士一象比雙士或雙象更好守：士守住九宮，象守住通路。',
    'The headline surprise of xiangqi endgames: three soldiers beat the full defence, while a chariot does not.':
      '象棋殘局中最出人意料的一條：三高兵可勝士象全，而一個車反而不能。',
    'Red wins with either side to move. 1.Gd1 is a waiting move that puts Black in zugzwang; the win comes from the red general seizing the middle file, not from the soldier alone.':
      '無論誰先走紅方都勝。1.帥四九是等著，令黑方欠行；取勝靠的是紅帥佔住中路，而不是單靠那個兵。',
    'Reciprocal zugzwang: whoever moves first loses. Set for Black to move, so the verdict is a Red win; flip the side to move and it is a Black win.':
      '雙方欠行：誰先走誰負。此局面設為黑先，故結論是紅勝；把先走方改為紅方，則變成黑勝。',
    'The horse beats a lone advisor but not a lone elephant, which can shuttle between flanks faster than the horse can cut it off.':
      '馬可勝單士，卻不能勝單象：象在兩翼往返的速度快過馬的封鎖。',
    'The same material as above, but tempo-dependent: Red to play wins with 1.Hd7, cutting the elephant off from the far flank. Black to play draws with 1...Ee8. This is why the class verdict is a draw and this position is not.':
      '子力與上一型相同，但取決於先手：紅先走馬四七，切斷象通往遠側的退路即勝；黑先走象５進７則和。這正是該類殘局的通例判和、而此一局面判勝的原因。',
    'The fourth defensive piece is the whole difference between this and the win above.':
      '與上一型的勝局相比，差別只在於防守方多了第四個士象。',
    'Two horses beat the full defence; a chariot, worth more than both, does not.':
      '雙馬可勝士象全；而子力價值高於雙馬的車卻不能。',
    'A cannon needs a platform to capture, so with nothing to jump it cannot mate. Adding elephants does not help; it needs an advisor, which can screen on any of the three central files.':
      '砲吃子必須借砲架，無子可借便無法成殺。加象沒有用，需要的是士，因為士能在中路三條線上任意一條充當砲架。',
    '1.Ge3 wins an advisor: 1...Gd9 runs into 2.Ae2#, and after 1...Ge10 2.Cxd8 the recapture is illegal because the advisor is pinned by the facing generals.':
      '1.帥五進二可得一士：1...將４進１則2.仕五進六殺；1...將５進１則2.砲打士，黑方無法吃回，因為該士被白臉將牽制。',
    'A cannon needs at least an extra soldier to break the full defence.':
      '砲要破士象全，至少還需要一個兵。',
    'Same attacking material, and the defending minor piece alone flips the result: a cannon holds where a horse does not.':
      '進攻子力相同，僅僅換掉防守方的那個小子，結果就翻轉：砲守得住，馬守不住。',
    'The strongest piece on the board cannot break the full defence, though three soldiers or two horses can. Piece values do not survive into the basic endgames.':
      '盤上最強的子破不了士象全，而三高兵或雙馬卻可以。子力價值那一套到了基本殘局就不成立了。',
    'This exact arrangement holds. Most other defensive placements of the same material lose, which is what makes it a fortress rather than a material verdict.':
      '只有擺成這一陣形才守得住。同樣的子力換成其他大多數擺法都要輸，所以這是一個陣形問題，而不是子力問題。',
    'The fortress above with the g6 elephant moved to g10 instead. Same material, same attacker, and now Red wins starting with 1.Rb7. The pair is the clearest demonstration in the corpus that material does not decide these endgames.':
      '把上一型陣形中位於３路的象改擺到底線。子力相同，進攻方也相同，紅方卻可以走車二進六取勝。這一對局面最能說明：這類殘局不是由子力決定的。',
    'Drawn, but the defence needs accurate placement.': '和棋，但防守方的位置必須準確。',
    'Pikafish finds a forced mate from every placement we tried, including this one (the most resistant of eight). Either the drawing setup is narrower than we could reconstruct, or the defence depends on resources the engine scores differently. Do not rely on this row.':
      'Pikafish 在我們嘗試過的每一種擺法中都算出了必殺，包括本局面（八種當中最頑強的一種）。要麼求和的陣形比我們能復原的更窄，要麼防守依賴的手段被引擎另作評估。此條結論不可依賴。',
    'The defending chariot on the middle file is what draws. Give the attacker any single defensive piece and it becomes a win.':
      '和棋靠的是防守方的車佔住中路。只要進攻方多任何一個士或象，就變成勝勢。',
    'Pikafish scores this as clearly winning for Red from every placement of the defending chariot we tried. One plausible reason: with both generals bare, the defence leans on checking resources, and perpetual check is a LOSS in xiangqi rather than the draw the analogous chess endgame would give. Do not rely on this row.':
      '在我們嘗試過的每一種防守車位上，Pikafish 都判紅方明顯佔優。一種說得通的解釋是：雙方都沒有士象時，防守要靠連續將軍，而象棋中長將判負，不像西洋棋中同類殘局可以長將求和。此條結論不可依賴。',
    'Drawn with good defensive placement.': '防守位置得當即可求和。',
    'Two horses is the losing pair; other two-minor-piece combinations hold.':
      '雙馬這一組合守不住；其他兩個小子的組合則可以守和。',
  },
};

/** The fixed frame the seeder wraps around the corpus fields.
 *
 *  `versus` carries its own surrounding spaces on purpose. Without them a
 *  material phrase ending in 相 fuses with the separator into 相對 ("relative
 *  to"), so "車砲，無仕相" 對 "單車…" read as one wrong word. Spaces break every
 *  such collision uniformly instead of special-casing the phrases that collide. */
type Template = {
  versus: string;
  win: string;
  draw: string;
  dispute: string;
  depth: (depth: number, score: string) => string;
  mainline: (plies: number) => string;
  diagram: string;
  constructed: string;
  mate: (moves: number) => string;
  mated: (moves: number) => string;
  noScore: string;
  notChecked: string;
};

const TEMPLATES: Record<EndgameStudyLang, Template> = {
  'zh-Hans': {
    versus: ' 对 ',
    win: '红胜（例胜）。',
    draw: '和棋（例和）。',
    dispute: '引擎不认同这一结论。',
    depth: (depth, score) => `Pikafish 搜索深度 ${depth}：${score}。`,
    mainline: (plies) => `下方主变即引擎给出的着法，共 ${plies} 着。`,
    diagram: '此局面依原书棋图摆出。',
    constructed: '此局面由我们摆出以代表该类残局，并非取自原书棋图。',
    mate: (moves) => `${moves} 步杀`,
    mated: (moves) => `被 ${moves} 步杀`,
    noScore: '无评分',
    notChecked: '未经引擎核对',
  },
  'zh-Hant': {
    versus: ' 對 ',
    win: '紅勝（例勝）。',
    draw: '和棋（例和）。',
    dispute: '引擎不認同這一結論。',
    depth: (depth, score) => `Pikafish 搜尋深度 ${depth}：${score}。`,
    mainline: (plies) => `下方主變即引擎給出的著法，共 ${plies} 著。`,
    diagram: '此局面依原書棋圖擺出。',
    constructed: '此局面由我們擺出以代表該類殘局，並非取自原書棋圖。',
    mate: (moves) => `${moves} 步殺`,
    mated: (moves) => `被 ${moves} 步殺`,
    noScore: '無評分',
    notChecked: '未經引擎核對',
  },
};

/** Study-level name and description. */
export const ENDGAME_STUDY_I18N: Record<EndgameStudyLang, { name: string; description: string }> = {
  'zh-Hans': {
    name: '象棋基本残局：什么例胜，什么例和',
    description:
      '基本残局的通例结论，每一则都配一个有代表性的局面，主变是 Pikafish 给出的着法。请自己摆棋验证，不要只凭结论。',
  },
  'zh-Hant': {
    name: '象棋基本殘局：什麼例勝，什麼例和',
    description:
      '基本殘局的通例結論，每一則都配一個有代表性的局面，主變是 Pikafish 給出的著法。請自己擺棋驗證，不要只憑結論。',
  },
};

function material(text: string, lang: EndgameStudyLang): string | null {
  return MATERIAL[lang][text] ?? null;
}

function prose(text: string, lang: EndgameStudyLang): string | null {
  return PROSE[lang][text] ?? null;
}

/**
 * Localized chapter name, or null when either half of the material is
 * untranslated. Null rather than a half-translated name: "三高兵 vs All four
 * defensive pieces" is worse for a reader than the English original.
 */
export function localizedChapterName(entry: EndgameEntry, lang: EndgameStudyLang): string | null {
  const attacker = material(entry.attacker, lang);
  const defender = material(entry.defender, lang);
  if (!attacker || !defender) return null;
  return `${attacker}${TEMPLATES[lang].versus}${defender}`;
}

function scoreText(
  row: { mate: number | null; cp: number | null } | undefined,
  lang: EndgameStudyLang,
): string {
  const t = TEMPLATES[lang];
  if (!row) return t.notChecked;
  if (row.mate != null && row.mate !== 0) {
    return row.mate > 0 ? t.mate(row.mate) : t.mated(-row.mate);
  }
  if (row.cp == null) return t.noScore;
  return `${row.cp > 0 ? '+' : ''}${(row.cp / 100).toFixed(1)}`;
}

/**
 * Localized root comment, or null when any prose the entry actually uses is
 * untranslated. Same reasoning as the chapter name: a comment that switches
 * language halfway is worse than one that stays in English.
 */
export function localizedRootComment(
  entry: EndgameEntry,
  row: { depth: number; mate: number | null; cp: number | null } | undefined,
  plies: number,
  lang: EndgameStudyLang,
): string | null {
  const t = TEMPLATES[lang];
  const attacker = material(entry.attacker, lang);
  const defender = material(entry.defender, lang);
  if (!attacker || !defender) return null;

  const parts = [`${attacker}${t.versus}${defender}。${entry.verdict === 'win' ? t.win : t.draw}`];
  if (entry.note) {
    const note = prose(entry.note, lang);
    if (!note) return null;
    parts.push(note);
  }
  if (entry.engineDispute) {
    const dispute = prose(entry.engineDispute, lang);
    if (!dispute) return null;
    parts.push(`${t.dispute}${dispute}`);
  }
  if (row) {
    parts.push(t.depth(row.depth, scoreText(row, lang)) + (plies > 0 ? t.mainline(plies) : ''));
  }
  parts.push(entry.provenance === 'diagram' ? t.diagram : t.constructed);
  return parts.join('\n\n');
}

/** Every English string the dictionaries currently key, for the coverage test. */
export function endgameStudyTranslationKeys(lang: EndgameStudyLang): string[] {
  return [...Object.keys(MATERIAL[lang]), ...Object.keys(PROSE[lang])];
}

export function hasEndgameStudyTranslation(lang: EndgameStudyLang, text: string): boolean {
  return Object.hasOwn(MATERIAL[lang], text) || Object.hasOwn(PROSE[lang], text);
}
