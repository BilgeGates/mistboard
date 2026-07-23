import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStudyFromTree, studyExportMessage } from './study-export.js';
import type { SerializedTree } from './tree-serialize.js';

const TREE = { rootFen: undefined, nodes: [] } as unknown as SerializedTree;

function stubFetch(impl: (url: string, init: RequestInit) => Partial<Response>) {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStudyFromTree', () => {
  it('posts the tree as the first chapter and returns the new id', async () => {
    const fetchMock = stubFetch(() => ({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ study: { id: 'abc123' } }),
    }));
    const result = await createStudyFromTree({ variant: 'xiangqi', name: 'My line', tree: TREE });
    expect(result).toEqual({ ok: true, id: 'abc123' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/studies');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('My line');
    // A one-click write to the user's account must not publish anything.
    expect(body.visibility).toBe('private');
    expect(body.chapter.variant).toBe('xiangqi');
    expect(body.chapter.root).toEqual(TREE);
  });

  it('reports an unauthenticated caller distinctly from a failure', async () => {
    stubFetch(() => ({ ok: false, status: 401 }));
    expect(await createStudyFromTree({ variant: 'xiangqi', name: 'x', tree: TREE })).toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('treats a server error as a failure', async () => {
    stubFetch(() => ({ ok: false, status: 500 }));
    expect(await createStudyFromTree({ variant: 'xiangqi', name: 'x', tree: TREE })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('does not throw when the network drops', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(await createStudyFromTree({ variant: 'xiangqi', name: 'x', tree: TREE })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('fails rather than navigating when the response carries no id', async () => {
    stubFetch(() => ({ ok: true, status: 201, json: () => Promise.resolve({}) }));
    expect(await createStudyFromTree({ variant: 'xiangqi', name: 'x', tree: TREE })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('tells a signed-out user what to do', () => {
    expect(studyExportMessage('unauthenticated')).toContain('Sign in');
    expect(studyExportMessage('failed')).not.toContain('Sign in');
  });
});
