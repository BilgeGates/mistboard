// Named openings for the explorer's header strip (lichess anatomy: the panel
// names the position you are ON, not each candidate move — a move has no name,
// the position it reaches does).
//
// Keyed by the MIRROR-CANONICAL position key, the same form the explorer stores
// and the route resolves a query to, so a line and its mirror image resolve to
// one name for free (a name is a property of the position, and the two spellings
// are the same position).
//
// Naming is terminology, not corpus, so it carries no rights question. But it is
// also pedagogy, and the rule here is to surface established names accurately and
// stop: `status: 'established'` names render; `status: 'pending'` names are the
// mapping calls flagged for Brian's review, present as data but NOT served until
// confirmed. Xiangqi has no ECO-style code system, so a name is name-only
// (English + 中文), no alphanumeric prefix.

export type OpeningNameStatus = 'established' | 'pending';

export type OpeningName = {
  /** Mirror-canonical standardXiangqiPositionKey the name attaches to. */
  key: string;
  en: string;
  zh: string;
  status: OpeningNameStatus;
};

// First-move openings are red's unambiguous choice, so their name attaches to
// the position with black to move. The pending rows are black replies whose
// exact "which ply becomes the opening" call is Brian's, not mine.
const OPENING_NAMES: readonly OpeningName[] = [
  {
    key: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b',
    en: 'Central Cannon',
    zh: '中炮',
    status: 'established',
  },
  {
    key: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2B2C1/9/RN1AKABNR b',
    en: 'Elephant Opening',
    zh: '飞相局',
    status: 'established',
  },
  {
    key: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C4NC1/9/RNBAKAB1R b',
    en: 'Horse Opening',
    zh: '起马局',
    status: 'established',
  },
  {
    key: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/2P6/P3P1P1P/1C5C1/9/RNBAKABNR b',
    en: 'Pawn Opening',
    zh: '仙人指路',
    status: 'established',
  },
  // --- pending Brian's confirmation: black replies to the Central Cannon ---
  {
    key: 'r1bakabnr/9/1cn4c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR r',
    en: 'Screen Horses',
    zh: '屏风马',
    status: 'pending',
  },
  {
    key: 'rnbakabnr/9/1c2c4/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR r',
    en: 'Same-Direction Cannons',
    zh: '顺炮',
    status: 'pending',
  },
  {
    key: 'rnbakabnr/9/1c2c4/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR r',
    en: 'Opposite Cannons',
    zh: '列炮',
    status: 'pending',
  },
];

const ESTABLISHED = new Map<string, { en: string; zh: string }>(
  OPENING_NAMES.filter((name) => name.status === 'established').map((name) => [
    name.key,
    { en: name.en, zh: name.zh },
  ]),
);

/**
 * The established name for a mirror-canonical position key, or null. Pass the
 * SAME key the explorer stores under (canonicalPosition(...).key); a raw,
 * un-canonicalized key will miss for every mirror-image position.
 */
export function openingNameForCanonicalKey(
  canonicalKey: string,
): { en: string; zh: string } | null {
  return ESTABLISHED.get(canonicalKey) ?? null;
}

/** All names, including pending, for the review checklist and tests. */
export function allOpeningNames(): readonly OpeningName[] {
  return OPENING_NAMES;
}
