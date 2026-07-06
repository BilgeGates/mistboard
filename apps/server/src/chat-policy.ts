import {
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
  RegExpMatcher,
} from 'obscenity';

export const CHAT_POLICY = {
  retainedLines: 200,
  servedLines: 100,
  visibleLines: 30,
  quietAfterMs: 24 * 60 * 60 * 1000,
  maxLineChars: 140,
  floodWindowMs: 60 * 1000,
  floodLimitPerWindow: 10,
  repeatedWindowMs: 5 * 60 * 1000,
  repeatedLimitPerWindow: 3,
  youngAccountMs: 7 * 24 * 60 * 60 * 1000,
  timeoutMs: 15 * 60 * 1000,
  reportReasonMax: 240,
  reportThresholdForAdminAttention: 2,
} as const;

export type ChatPolicyDecision =
  | { action: 'allow'; status: 'clean'; reason?: undefined }
  | { action: 'allow'; status: 'flagged'; reason: string }
  | { action: 'reject'; reason: string };

const severeObscenityWords = new Set([
  'abeed',
  'abo',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'dyke',
  'fag',
  'kike',
  'nigger',
  'rape',
  'retard',
  'spastic',
  'tranny',
]);

const severeDataset = new DataSet<{ label: string }>()
  .addPhrase((phrase) =>
    phrase
      .setMetadata({ label: 'self-harm encouragement' })
      .addPattern(parseRawPattern('|kill yourself|')),
  )
  .addPhrase((phrase) =>
    phrase.setMetadata({ label: 'self-harm encouragement' }).addPattern(parseRawPattern('|kys|')),
  );

const severeMatcher = new RegExpMatcher({
  ...severeDataset.build(),
  ...englishRecommendedTransformers,
});

const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function evaluateChatText(text: string): ChatPolicyDecision {
  const normalized = normalizeChatText(text);
  if (severeMatcher.hasMatch(normalized)) {
    return { action: 'reject', reason: 'severe_language' };
  }

  const matches = profanityMatcher.getAllMatches(normalized, true);
  for (const match of matches) {
    const metadata = englishDataset.getPayloadWithPhraseMetadata(match).phraseMetadata;
    if (metadata && severeObscenityWords.has(metadata.originalWord)) {
      return { action: 'reject', reason: 'severe_language' };
    }
  }
  if (matches.length > 0) {
    return { action: 'allow', status: 'flagged', reason: 'profanity' };
  }
  return { action: 'allow', status: 'clean' };
}

export function normalizeChatText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
