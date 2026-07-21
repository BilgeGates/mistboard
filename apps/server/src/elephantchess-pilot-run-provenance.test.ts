import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildElephantChessPilotManifest,
  type ElephantChessPilotGame,
  renderElephantChessPilotManifest,
} from './elephantchess-pilot-manifest.js';
import {
  probePikafishUciIdentity,
  readPinnedElephantChessPilotManifest,
  sha256Bytes,
} from './elephantchess-pilot-run-provenance.js';

function game(index: number): ElephantChessPilotGame {
  return {
    historicalGameId: `historical-${index}`,
    sourceGameId: `source-${index}`,
    importBatchId: 'batch-provenance-test',
    plyCount: 30 + index,
    result: index % 2 ? '1-0' : '0-1',
    redEloBefore: 1_000 + index,
    blackEloBefore: 1_010 + index,
    timeControlCategory: index < 12 ? 'RAPID' : 'CORRESPONDENCE',
    ratingMode: 'rated',
    redPlayerId: `red-${index}`,
    blackPlayerId: `black-${index}`,
  };
}

test('pins both serialized and internal manifest identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mistboard-pilot-provenance-'));
  try {
    const manifest = buildElephantChessPilotManifest(
      Array.from({ length: 16 }, (_, index) => game(index)),
      {
        importBatchId: 'batch-provenance-test',
        seed: 'provenance-test',
        targets: { representativeLiveBase: 4, coverageLive: 2, correspondenceMax: 2 },
      },
    );
    const serialized = renderElephantChessPilotManifest(manifest);
    const path = join(directory, 'manifest.json');
    await writeFile(path, serialized, 'utf8');
    const loaded = await readPinnedElephantChessPilotManifest({
      path,
      expectedFileSha256: sha256Bytes(Buffer.from(serialized)),
      expectedContentSha256: manifest.manifestSha256,
    });
    assert.deepEqual(loaded.manifest, manifest);

    await assert.rejects(
      readPinnedElephantChessPilotManifest({
        path,
        expectedFileSha256: '0'.repeat(64),
        expectedContentSha256: manifest.manifestSha256,
      }),
      /manifest file hash mismatch/,
    );
    await assert.rejects(
      readPinnedElephantChessPilotManifest({
        path,
        expectedFileSha256: sha256Bytes(Buffer.from(serialized)),
        expectedContentSha256: '1'.repeat(64),
      }),
      /manifest identity mismatch/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('reads the engine identity from its UCI handshake', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mistboard-pilot-uci-'));
  try {
    const binary = join(directory, 'fake-pikafish');
    await writeFile(
      binary,
      '#!/bin/sh\nwhile read line; do\n  if [ "$line" = uci ]; then\n    echo \'id name Pikafish test-build\'\n    echo \'id author Test Authors\'\n    echo uciok\n  fi\n  if [ "$line" = quit ]; then exit 0; fi\ndone\n',
      'utf8',
    );
    await chmod(binary, 0o755);
    assert.deepEqual(await probePikafishUciIdentity(binary), {
      name: 'Pikafish test-build',
      author: 'Test Authors',
    });
  } finally {
    await rm(directory, { recursive: true });
  }
});
