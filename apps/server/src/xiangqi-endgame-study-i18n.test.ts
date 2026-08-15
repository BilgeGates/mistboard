import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XIANGQI_ENDGAME_CORPUS } from '@mistboard/game';
import {
  ENDGAME_STUDY_LANGS,
  endgameStudyTranslationKeys,
  hasEndgameStudyTranslation,
  localizedChapterName,
  localizedRootComment,
} from './xiangqi-endgame-study-i18n.js';

// Two directions, the same pair article-i18n and announcement-i18n check.
//
// 1. Every string the corpus actually uses resolves in both zh scripts. Adding a
//    corpus entry fails here until it is translated, which is the reminder that
//    the study ships trilingual now.
// 2. No dictionary key is orphaned. Editing an English note detaches its
//    translation silently (the lookup just misses and the whole comment falls
//    back to English), so the orphan is the only observable trace.

function liveStrings(): Set<string> {
  const strings = new Set<string>();
  for (const entry of XIANGQI_ENDGAME_CORPUS) {
    strings.add(entry.attacker);
    strings.add(entry.defender);
    if (entry.note) strings.add(entry.note);
    if (entry.engineDispute) strings.add(entry.engineDispute);
  }
  return strings;
}

describe('endgame study translation coverage', () => {
  it('every corpus string resolves in all zh scripts', () => {
    const missing: string[] = [];
    for (const text of liveStrings()) {
      for (const lang of ENDGAME_STUDY_LANGS) {
        if (!hasEndgameStudyTranslation(lang, text)) {
          missing.push(`[${lang}] ${text.slice(0, 60)}`);
        }
      }
    }
    assert.deepEqual(missing, [], `untranslated endgame strings:\n${missing.join('\n')}`);
  });

  it('dictionaries contain only strings the corpus uses', () => {
    const live = liveStrings();
    const orphans = ENDGAME_STUDY_LANGS.flatMap((lang) =>
      endgameStudyTranslationKeys(lang)
        .filter((key) => !live.has(key))
        .map((key) => `[${lang}] ${key.slice(0, 60)}`),
    );
    assert.deepEqual(orphans, [], `orphaned endgame translation keys:\n${orphans.join('\n')}`);
  });

  it('renders a full chapter name and comment for every entry', () => {
    for (const entry of XIANGQI_ENDGAME_CORPUS) {
      for (const lang of ENDGAME_STUDY_LANGS) {
        const name = localizedChapterName(entry, lang);
        assert.ok(name, `${entry.id} has no ${lang} chapter name`);
        // A name that still carries Latin letters means a material phrase fell
        // through to English inside an otherwise translated string.
        assert.ok(!/[A-Za-z]/.test(name), `${entry.id} ${lang} name is half English: ${name}`);

        const comment = localizedRootComment(entry, { depth: 26, mate: 4, cp: null }, 6, lang);
        assert.ok(comment, `${entry.id} has no ${lang} root comment`);
      }
    }
  });

  it('drops the overlay rather than emitting half a translation', () => {
    // The contract the seeder relies on: an entry carrying prose with no
    // translation yields null, so the chapter keeps its English comment whole.
    const entry = { ...XIANGQI_ENDGAME_CORPUS[0]!, note: 'an untranslated note' };
    assert.equal(localizedRootComment(entry, undefined, 0, 'zh-Hans'), null);
  });
});
