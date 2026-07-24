import type { SerializedTree } from './review/tree-serialize.js';

const DRAFT_SCHEMA_VERSION = 1;

export type StudyAutosaveState = 'saved' | 'dirty' | 'saving' | 'retrying' | 'conflict' | 'error';

type StoredStudyDraft = {
  schemaVersion: 1;
  baseVersion: number;
  tree: SerializedTree;
  updatedAt: number;
};

type SaveResult = { ok: true; version: number } | { ok: false; kind: 'conflict' | 'error' };

export type StudyAutosave = {
  /** The server tree, or a still-pending local draft when one exists. */
  initialTree: SerializedTree;
  markDirty(tree: SerializedTree): void;
  /** Resolve all queued edits. False means the local draft remains pending. */
  flush(): Promise<boolean>;
  /** Explicitly overwrite the latest server copy after the owner reviews a conflict. */
  overwriteRemote(): Promise<boolean>;
  /** Forget the local draft. The caller should then reload the server copy. */
  discard(): void;
  hasPending(): boolean;
  hasConflict(): boolean;
  dispose(): void;
};

export type StudyAutosaveOptions = {
  studyId: string;
  chapterId: string;
  initialTree: SerializedTree;
  initialVersion: number;
  onStatus(state: StudyAutosaveState, message: string): void;
  onSaved?(tree: SerializedTree, version: number): void;
  fetcher?: typeof fetch;
  storage?: Storage | null;
  debounceMs?: number;
  retryDelaysMs?: number[];
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
};

/**
 * Owns one chapter's write lifecycle. A draft is written synchronously before
 * any network request and removed only after the server confirms the same edit
 * revision, so closing the tab or a failed request cannot silently drop work.
 */
export function createStudyAutosave(options: StudyAutosaveOptions): StudyAutosave {
  const fetcher = options.fetcher ?? fetch;
  const storage = options.storage === undefined ? safeLocalStorage() : options.storage;
  const debounceMs = options.debounceMs ?? 700;
  const retryDelaysMs = options.retryDelaysMs ?? [700, 2_000];
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const key = studyDraftKey(options.studyId, options.chapterId);
  const restored = readDraft(storage, key);

  let tree = restored?.tree ?? options.initialTree;
  let serverVersion = options.initialVersion;
  let draftBaseVersion = restored?.baseVersion ?? serverVersion;
  let revision = restored ? 1 : 0;
  let dirty = restored !== null;
  let conflict = restored !== null && restored.baseVersion !== serverVersion;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;

  const emit = (state: StudyAutosaveState, message: string): void => {
    if (!disposed) options.onStatus(state, message);
  };

  const persist = (): void => {
    if (!storage) return;
    const draft: StoredStudyDraft = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      baseVersion: draftBaseVersion,
      tree,
      updatedAt: now(),
    };
    try {
      storage.setItem(key, JSON.stringify(draft));
    } catch {
      // Saving to the server still works when storage is unavailable or full.
    }
  };

  const clearStoredDraft = (): void => {
    try {
      storage?.removeItem(key);
    } catch {
      // A confirmed server save remains authoritative.
    }
  };

  const requestSave = async (
    targetTree: SerializedTree,
    baseVersion: number,
  ): Promise<SaveResult> => {
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        const response = await fetcher(
          `/api/studies/${encodeURIComponent(options.studyId)}/chapters/${encodeURIComponent(
            options.chapterId,
          )}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ root: targetTree, baseVersion }),
          },
        );
        if (response.ok) {
          const body = (await response.json()) as { chapter?: { version?: unknown } };
          const version = body.chapter?.version;
          return typeof version === 'number' ? { ok: true, version } : { ok: false, kind: 'error' };
        }
        if (response.status === 409) return { ok: false, kind: 'conflict' };
        if (!isTransientStatus(response.status) || attempt === retryDelaysMs.length) {
          return { ok: false, kind: 'error' };
        }
      } catch {
        if (attempt === retryDelaysMs.length) return { ok: false, kind: 'error' };
      }
      emit('retrying', 'Connection interrupted, retrying…');
      await delay(retryDelaysMs[attempt]!);
    }
    return { ok: false, kind: 'error' };
  };

  const saveOneRevision = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (conflict) return false;

    const targetTree = tree;
    const targetRevision = revision;
    const baseVersion = serverVersion;
    emit('saving', 'Saving…');
    const result = await requestSave(targetTree, baseVersion);
    if (!result.ok) {
      if (result.kind === 'conflict') {
        conflict = true;
        emit('conflict', 'Resolve save conflict');
      } else {
        emit('error', 'Draft saved locally, retry');
      }
      return false;
    }

    serverVersion = result.version;
    options.onSaved?.(targetTree, result.version);
    if (revision === targetRevision) {
      dirty = false;
      draftBaseVersion = serverVersion;
      clearStoredDraft();
      emit('saved', 'Saved');
      return true;
    }

    // An edit landed while this request was in flight. Its optimistic base is
    // now the just-confirmed version, and flush() will immediately send it.
    draftBaseVersion = serverVersion;
    persist();
    emit('dirty', 'Editing…');
    return true;
  };

  const flush = async (): Promise<boolean> => {
    if (timer) clearTimeout(timer);
    timer = null;
    while (dirty) {
      if (conflict) return false;
      if (inFlight) {
        const ok = await inFlight;
        if (!ok) return false;
        continue;
      }
      const request = saveOneRevision();
      inFlight = request;
      const ok = await request;
      if (inFlight === request) inFlight = null;
      if (!ok) return false;
    }
    return true;
  };

  const schedule = (): void => {
    if (disposed || conflict) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const overwriteRemote = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (timer) clearTimeout(timer);
    timer = null;
    emit('saving', 'Checking latest version…');
    try {
      const response = await fetcher(`/api/studies/${encodeURIComponent(options.studyId)}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        emit('error', 'Could not load latest version, retry');
        return false;
      }
      const body = (await response.json()) as {
        chapters?: Array<{ id?: unknown; version?: unknown }>;
      };
      const latest = body.chapters?.find((chapter) => chapter.id === options.chapterId)?.version;
      if (typeof latest !== 'number') {
        emit('error', 'Could not load latest version, retry');
        return false;
      }
      serverVersion = latest;
      draftBaseVersion = latest;
      conflict = false;
      persist();
      return flush();
    } catch {
      emit('error', 'Could not load latest version, retry');
      return false;
    }
  };

  const controller: StudyAutosave = {
    initialTree: tree,
    markDirty: (nextTree) => {
      tree = nextTree;
      revision += 1;
      dirty = true;
      persist();
      if (conflict) {
        emit('conflict', 'Resolve save conflict');
        return;
      }
      emit('dirty', 'Editing…');
      schedule();
    },
    flush,
    overwriteRemote,
    discard: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      revision += 1;
      dirty = false;
      conflict = false;
      clearStoredDraft();
      emit('saved', 'Saved');
    },
    hasPending: () => dirty || inFlight !== null,
    hasConflict: () => conflict,
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };

  if (restored) {
    if (conflict) emit('conflict', 'Review recovered draft');
    else {
      emit('dirty', 'Recovered local draft');
      schedule();
    }
  } else emit('saved', 'Saved');

  return controller;
}

export function studyDraftKey(studyId: string, chapterId: string): string {
  return `mistboard:study-draft:${studyId}:${chapterId}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readDraft(storage: Storage | null, key: string): StoredStudyDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredStudyDraft>;
    if (
      value.schemaVersion === DRAFT_SCHEMA_VERSION &&
      typeof value.baseVersion === 'number' &&
      typeof value.updatedAt === 'number' &&
      isSerializedTree(value.tree)
    ) {
      return value as StoredStudyDraft;
    }
    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore a storage implementation that rejects both reads and writes.
    }
  }
  return null;
}

function isSerializedTree(value: unknown): value is SerializedTree {
  if (!value || typeof value !== 'object') return false;
  const tree = value as { version?: unknown; root?: unknown };
  if (tree.version !== 1 || !tree.root || typeof tree.root !== 'object') return false;
  return Array.isArray((tree.root as { children?: unknown }).children);
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
