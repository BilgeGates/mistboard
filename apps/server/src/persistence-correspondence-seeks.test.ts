import {
  countOpenSeeksForUser,
  createCorrespondenceSeek,
  createUser,
  deleteCorrespondenceSeek,
  getCorrespondenceSeek,
  listOpenCorrespondenceSeeks,
} from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('correspondence seeks', () => {
  const at = new Date('2026-06-13T12:00:00Z');
  const seedUser = (id: string, handle: string, displayName: string) =>
    createUser({
      id,
      email: `${id}@example.com`,
      emailVerifiedAt: at,
      handle,
      displayName,
      now: at,
    });

  test('create, count, list with creator name, get, and delete-wins-the-race', async () => {
    const alice = await seedUser('seek-alice', 'alice', 'Alice');
    const bob = await seedUser('seek-bob', 'bob', 'Bob');

    await createCorrespondenceSeek({
      id: 'seek-1',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'white',
    });
    await createCorrespondenceSeek({
      id: 'seek-2',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 1,
      preferredColor: 'random',
    });
    await createCorrespondenceSeek({
      id: 'seek-3',
      creatorUserId: bob.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 7,
      preferredColor: 'black',
    });

    assert.equal(await countOpenSeeksForUser(alice.id), 2);
    assert.equal(await countOpenSeeksForUser(bob.id), 1);

    const open = await listOpenCorrespondenceSeeks();
    assert.equal(open.length, 3);
    assert.equal(open[0]?.id, 'seek-3'); // newest first
    const aliceSeek = open.find((seek) => seek.id === 'seek-1');
    assert.equal(aliceSeek?.creatorName, 'Alice');
    assert.equal(aliceSeek?.preferredColor, 'white');
    assert.equal(aliceSeek?.daysPerMove, 3);

    assert.equal((await getCorrespondenceSeek('seek-1'))?.creatorUserId, alice.id);
    assert.equal(await getCorrespondenceSeek('missing'), null);

    // First delete wins (true); a second delete of the same id loses (false) —
    // the guard the accept flow relies on when two players accept at once.
    assert.equal(await deleteCorrespondenceSeek('seek-1'), true);
    assert.equal(await deleteCorrespondenceSeek('seek-1'), false);
    assert.equal(await countOpenSeeksForUser(alice.id), 1);
  });

  test('owner-scoped cancel removes only the creator-owned seek', async () => {
    const alice = await seedUser('cancel-alice', 'calice', 'Alice');
    const bob = await seedUser('cancel-bob', 'cbob', 'Bob');
    await createCorrespondenceSeek({
      id: 'cseek',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'white',
    });

    // Bob cannot cancel Alice's seek; Alice can.
    assert.equal(await deleteCorrespondenceSeek('cseek', bob.id), false);
    assert.notEqual(await getCorrespondenceSeek('cseek'), null);
    assert.equal(await deleteCorrespondenceSeek('cseek', alice.id), true);
    assert.equal(await getCorrespondenceSeek('cseek'), null);
  });
});
