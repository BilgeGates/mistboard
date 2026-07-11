import type { UserAccount } from './persistence.js';
import { createUser } from './persistence.js';
import {
  addChapter,
  createStudy,
  deleteChapter,
  deleteStudy,
  getStudyById,
  listStudiesForOwner,
  renameChapter,
  setChapterGamebook,
  updateChapterTree,
  updateStudyMeta,
} from './persistence-studies.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('studies', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  async function makeUser(suffix: string): Promise<UserAccount> {
    return createUser({
      id: `user_study_${suffix}`,
      email: `study-${suffix}@example.com`,
      emailVerifiedAt: now,
      handle: `study-${suffix}`,
      displayName: `Study ${suffix}`,
      now,
    });
  }

  const tree = { version: 1, root: { children: [{ uci: 'b3e3', children: [] }] } };

  async function makeStudy(ownerId: string, name = 'My study') {
    return createStudy({
      ownerId,
      name,
      description: 'notes',
      visibility: 'private',
      chapter: { name: 'Chapter 1', variant: 'xiangqi', orientation: 'red', root: tree },
    });
  }

  test('creates a study with a first chapter and reads it back', async () => {
    const user = await makeUser('create');
    const created = await makeStudy(user.id);
    assert.ok(created);
    assert.equal(created.name, 'My study');
    assert.equal(created.visibility, 'private');
    assert.equal(created.chapters.length, 1);
    const chapter = created.chapters[0]!;
    assert.equal(chapter.variant, 'xiangqi');
    assert.equal(chapter.version, 0);
    assert.equal(chapter.gamebook, false);
    assert.deepEqual(chapter.root, tree);

    const fetched = await getStudyById(created.id);
    assert.ok(fetched);
    assert.equal(fetched.chapters.length, 1);
    assert.deepEqual(fetched.chapters[0]!.root, tree);
  });

  test('saves a chapter tree, bumps the version, and enforces ownership', async () => {
    const owner = await makeUser('owner');
    const stranger = await makeUser('stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const chapterId = study.chapters[0]!.id;
    const nextTree = { version: 1, root: { children: [{ uci: 'h3e3', children: [] }] } };

    const ok = await updateChapterTree(chapterId, owner.id, { root: nextTree });
    assert.ok(ok.ok);
    // deepEqual, not string compare: JSONB does not preserve object key order.
    assert.equal(ok.chapter.version, 1);
    assert.deepEqual(ok.chapter.root, nextTree);

    const forbidden = await updateChapterTree(chapterId, stranger.id, { root: nextTree });
    assert.equal(forbidden.ok, false);
    assert.ok(!forbidden.ok && forbidden.error === 'forbidden');
  });

  test('rejects a stale version with a conflict (optimistic concurrency)', async () => {
    const owner = await makeUser('conflict');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const chapterId = study.chapters[0]!.id;
    const t = { version: 1, root: { children: [] } };

    // Two writers both read version 0; the first wins, the second is stale.
    const first = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 0 });
    assert.ok(first.ok);
    const stale = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 0 });
    assert.equal(stale.ok, false);
    assert.ok(!stale.ok && stale.error === 'conflict');

    // Re-reading the current version lets the save through.
    const retry = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 1 });
    assert.ok(retry.ok);
  });

  test('lists an owner studies with chapter counts', async () => {
    const owner = await makeUser('list');
    await makeStudy(owner.id, 'A');
    await makeStudy(owner.id, 'B');
    const studies = await listStudiesForOwner(owner.id);
    assert.equal(studies.length, 2);
    assert.ok(studies.every((s) => s.chapterCount === 1));
  });

  test('adds, renames, and deletes chapters (owner only, keeps at least one)', async () => {
    const owner = await makeUser('chapters');
    const stranger = await makeUser('chapters-stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const studyId = study.id;

    const added = await addChapter(studyId, owner.id, {
      name: 'Chapter 2',
      variant: 'xiangqi',
      orientation: 'red',
      root: tree,
    });
    assert.ok(added.ok);
    assert.equal(added.chapter.name, 'Chapter 2');
    assert.equal(added.chapter.ordinal, 1);

    const bad = await addChapter(studyId, stranger.id, {
      name: 'x',
      variant: 'xiangqi',
      orientation: 'red',
      root: tree,
    });
    assert.ok(!bad.ok && bad.error === 'forbidden');

    let full = await getStudyById(studyId);
    assert.equal(full?.chapters.length, 2);

    const renamed = await renameChapter(added.chapter.id, owner.id, 'Renamed');
    assert.ok(renamed.ok && renamed.chapter.name === 'Renamed');

    const gb = await setChapterGamebook(added.chapter.id, owner.id, true);
    assert.ok(gb.ok && gb.chapter.gamebook === true);
    const gbBad = await setChapterGamebook(added.chapter.id, stranger.id, false);
    assert.ok(!gbBad.ok && gbBad.error === 'forbidden');

    assert.ok((await deleteChapter(added.chapter.id, owner.id)).ok);
    full = await getStudyById(studyId);
    assert.equal(full?.chapters.length, 1);

    // The last chapter cannot be deleted — a study always has at least one.
    const lastDel = await deleteChapter(full!.chapters[0]!.id, owner.id);
    assert.ok(!lastDel.ok && lastDel.error === 'last_chapter');
  });

  test('updates study meta (owner only) and cascades on delete', async () => {
    const owner = await makeUser('meta');
    const stranger = await makeUser('meta-stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);

    const bad = await updateStudyMeta(study.id, stranger.id, { visibility: 'public' });
    assert.ok(!bad.ok && bad.error === 'forbidden');

    const good = await updateStudyMeta(study.id, owner.id, {
      visibility: 'public',
      name: 'Renamed',
    });
    assert.ok(good.ok && good.study.visibility === 'public' && good.study.name === 'Renamed');

    assert.equal(await deleteStudy(study.id, stranger.id), false);
    assert.equal(await deleteStudy(study.id, owner.id), true);
    assert.equal(await getStudyById(study.id), null);
  });
});
