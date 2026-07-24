import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializedTree } from './review/tree-serialize.js';
import { createStudyAutosave, studyDraftKey } from './study-autosave.js';

const EMPTY_TREE: SerializedTree = { version: 1, root: { children: [] } };
const EDITED_TREE: SerializedTree = {
  version: 1,
  root: { children: [{ uci: 'h2e2', children: [] }] },
};

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
});

describe('study autosave', () => {
  it('keeps a local draft until the matching server revision is confirmed', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const statuses: string[] = [];
    const saved = vi.fn();
    const autosave = createStudyAutosave({
      studyId: 'study1',
      chapterId: 'chapter1',
      initialTree: EMPTY_TREE,
      initialVersion: 3,
      fetcher: fetcher as typeof fetch,
      storage,
      debounceMs: 60_000,
      onStatus: (state) => statuses.push(state),
      onSaved: saved,
    });

    autosave.markDirty(EDITED_TREE);
    const key = studyDraftKey('study1', 'chapter1');
    expect(JSON.parse(storage.getItem(key) ?? '{}')).toMatchObject({
      schemaVersion: 1,
      baseVersion: 3,
      tree: EDITED_TREE,
    });

    const flushing = autosave.flush();
    expect(autosave.hasPending()).toBe(true);
    pending.resolve(jsonResponse({ chapter: { version: 4 } }));
    await expect(flushing).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(
      '/api/studies/study1/chapters/chapter1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ root: EDITED_TREE, baseVersion: 3 }),
      }),
    );
    expect(storage.getItem(key)).toBeNull();
    expect(saved).toHaveBeenCalledWith(EDITED_TREE, 4);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('serializes an edit that arrives while a save is in flight', async () => {
    const first = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(jsonResponse({ chapter: { version: 7 } }));
    const secondTree: SerializedTree = {
      version: 1,
      root: { children: [{ uci: 'h2e2', children: [{ uci: 'h9g7', children: [] }] }] },
    };
    const autosave = createStudyAutosave({
      studyId: 'study1',
      chapterId: 'chapter1',
      initialTree: EMPTY_TREE,
      initialVersion: 5,
      fetcher: fetcher as typeof fetch,
      storage,
      debounceMs: 60_000,
      onStatus: () => undefined,
    });

    autosave.markDirty(EDITED_TREE);
    const flushing = autosave.flush();
    autosave.markDirty(secondTree);
    first.resolve(jsonResponse({ chapter: { version: 6 } }));
    await expect(flushing).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ root: secondTree, baseVersion: 6 }),
    });
    expect(storage.getItem(studyDraftKey('study1', 'chapter1'))).toBeNull();
  });

  it('retries transient failures and leaves terminal failures recoverable', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ chapter: { version: 2 } }));
    const statuses: string[] = [];
    const autosave = createStudyAutosave({
      studyId: 'study1',
      chapterId: 'chapter1',
      initialTree: EMPTY_TREE,
      initialVersion: 1,
      fetcher: fetcher as typeof fetch,
      storage,
      debounceMs: 60_000,
      retryDelaysMs: [0],
      delay: async () => undefined,
      onStatus: (state) => statuses.push(state),
    });

    autosave.markDirty(EDITED_TREE);
    await expect(autosave.flush()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(statuses).toContain('retrying');

    fetcher.mockResolvedValueOnce(new Response(null, { status: 400 }));
    autosave.markDirty(EDITED_TREE);
    await expect(autosave.flush()).resolves.toBe(false);
    expect(autosave.hasPending()).toBe(true);
    expect(statuses.at(-1)).toBe('error');
    expect(storage.getItem(studyDraftKey('study1', 'chapter1'))).not.toBeNull();
  });

  it('recovers a matching draft and flags a stale draft for explicit resolution', async () => {
    const key = studyDraftKey('study1', 'chapter1');
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        baseVersion: 8,
        tree: EDITED_TREE,
        updatedAt: 123,
      }),
    );
    const statuses: string[] = [];
    const fetcher = vi.fn();
    const autosave = createStudyAutosave({
      studyId: 'study1',
      chapterId: 'chapter1',
      initialTree: EMPTY_TREE,
      initialVersion: 9,
      fetcher: fetcher as typeof fetch,
      storage,
      debounceMs: 60_000,
      onStatus: (state) => statuses.push(state),
    });

    expect(autosave.initialTree).toEqual(EDITED_TREE);
    expect(autosave.hasConflict()).toBe(true);
    await expect(autosave.flush()).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe('conflict');
  });

  it('overwrites only after fetching the latest server version', async () => {
    const key = studyDraftKey('study1', 'chapter1');
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        baseVersion: 2,
        tree: EDITED_TREE,
        updatedAt: 123,
      }),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ chapters: [{ id: 'chapter1', version: 5 }] }))
      .mockResolvedValueOnce(jsonResponse({ chapter: { version: 6 } }));
    const autosave = createStudyAutosave({
      studyId: 'study1',
      chapterId: 'chapter1',
      initialTree: EMPTY_TREE,
      initialVersion: 3,
      fetcher: fetcher as typeof fetch,
      storage,
      debounceMs: 60_000,
      onStatus: () => undefined,
    });

    await expect(autosave.overwriteRemote()).resolves.toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/studies/study1');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ root: EDITED_TREE, baseVersion: 5 }),
    });
    expect(storage.getItem(key)).toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
