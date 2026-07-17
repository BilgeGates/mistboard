import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pruneOrphanDist } from './prune-orphan-dist.mjs';

function makeWorkspace({ compilerOptions = { rootDir: 'src', outDir: 'dist' } } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'prune-orphan-dist-'));
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'dist'), { recursive: true });
  return dir;
}

function touch(dir, relativePath) {
  const filePath = path.join(dir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, '');
  return filePath;
}

test('prunes outputs whose source was deleted, keeps live outputs', () => {
  const dir = makeWorkspace();
  try {
    touch(dir, 'src/kept.test.ts');
    const keptJs = touch(dir, 'dist/kept.test.js');
    const orphanJs = touch(dir, 'dist/orphan.test.js');
    const orphanMap = touch(dir, 'dist/orphan.test.js.map');
    const orphanDts = touch(dir, 'dist/orphan.d.ts');

    const pruned = pruneOrphanDist(dir);

    assert.deepEqual(pruned.sort(), [orphanDts, orphanJs, orphanMap].sort());
    assert.ok(existsSync(keptJs), 'output with a live source must survive');
    assert.ok(!existsSync(orphanJs));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('removes directories emptied by pruning, keeps non-emitted files', () => {
  const dir = makeWorkspace();
  try {
    touch(dir, 'dist/gone/nested.js');
    const asset = touch(dir, 'dist/assets/data.json');

    pruneOrphanDist(dir);

    assert.ok(!existsSync(path.join(dir, 'dist/gone')), 'emptied directory is removed');
    assert.ok(existsSync(asset), 'non-tsc-emitted files are never pruned');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('second run is a no-op and missing outDir returns empty', () => {
  const dir = makeWorkspace();
  try {
    touch(dir, 'src/a.ts');
    touch(dir, 'dist/a.js');
    touch(dir, 'dist/orphan.js');

    assert.equal(pruneOrphanDist(dir).length, 1);
    assert.equal(pruneOrphanDist(dir).length, 0);

    rmSync(path.join(dir, 'dist'), { recursive: true });
    assert.deepEqual(pruneOrphanDist(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses an outDir that equals rootDir or the workspace', () => {
  const dir = makeWorkspace({ compilerOptions: { rootDir: 'src', outDir: 'src' } });
  try {
    assert.throws(() => pruneOrphanDist(dir), /dedicated directory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
