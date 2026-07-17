#!/usr/bin/env node
// Delete tsc outputs in a workspace's outDir whose source no longer exists.
//
// tsc rebuilds stale outputs but never removes the outputs of DELETED
// sources, and the server test scripts execute `node --test dist/*.test.js`
// globs, so an orphaned compiled test keeps running (and failing) after its
// source is deleted until someone rm -rf's dist by hand (#85). Runs as a
// pre-script next to ensure-packages-built: no-op when outDir is absent or
// clean.
//
// Usage: node scripts/prune-orphan-dist.mjs [workspace-dir]

import { existsSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Only ever delete files tsc emits; anything else in outDir (copied assets,
// hand-placed fixtures) is not ours to prune.
const EMIT_SUFFIXES = ['.d.ts.map', '.d.ts', '.js.map', '.js'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts'];

export function pruneOrphanDist(workspaceDir) {
  const workspace = path.resolve(workspaceDir);
  const tsconfigPath = path.join(workspace, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    throw new Error(`no tsconfig.json in ${workspace}`);
  }
  const compilerOptions = JSON.parse(readFileSync(tsconfigPath, 'utf-8')).compilerOptions ?? {};
  const rootDir = path.resolve(workspace, compilerOptions.rootDir ?? 'src');
  const outDir = path.resolve(workspace, compilerOptions.outDir ?? 'dist');
  if (!existsSync(outDir)) return [];
  if (outDir === rootDir || outDir === workspace) {
    throw new Error(`refusing to prune ${outDir}: outDir must be a dedicated directory`);
  }

  const pruned = [];
  pruneDirectory(outDir, outDir, rootDir, pruned);
  return pruned;
}

function pruneDirectory(dir, outDir, rootDir, pruned) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneDirectory(entryPath, outDir, rootDir, pruned);
      continue;
    }
    const suffix = EMIT_SUFFIXES.find((candidate) => entry.name.endsWith(candidate));
    if (!suffix) continue;
    const relativeBase = path.relative(outDir, entryPath).slice(0, -suffix.length);
    const hasSource = SOURCE_EXTENSIONS.some((extension) =>
      existsSync(path.join(rootDir, relativeBase + extension)),
    );
    if (hasSource) continue;
    unlinkSync(entryPath);
    pruned.push(entryPath);
  }
  // A directory emptied by pruning maps to a deleted source directory.
  if (dir !== outDir && readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const workspaceDir = process.argv[2] ?? process.cwd();
  const pruned = pruneOrphanDist(workspaceDir);
  if (pruned.length > 0) {
    console.log(
      `prune-orphan-dist: removed ${pruned.length} orphaned output(s):\n  ${pruned.join('\n  ')}`,
    );
  }
}
