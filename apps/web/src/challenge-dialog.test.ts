import { afterEach, describe, expect, it, vi } from 'vitest';
import { openChallengeDialog } from './challenge-dialog.js';

describe('openChallengeDialog', () => {
  afterEach(() => {
    for (const d of document.querySelectorAll('dialog[data-challenge-dialog]')) d.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a directed-challenge modal with day + color selects and the target name', () => {
    openChallengeDialog({ handle: 'alice' });
    const dialog = document.querySelector('dialog[data-challenge-dialog]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelectorAll('select')).toHaveLength(2);
    expect(dialog?.textContent).toContain('alice');
  });

  it('posts a directed challenge addressed by target handle on send', () => {
    // Never resolves: the request body is set synchronously at the fetch call, so we
    // can assert it without triggering the navigation-on-success branch.
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    openChallengeDialog({ handle: 'bob' });
    const dialog = document.querySelector('dialog[data-challenge-dialog]');
    const send = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Send challenge',
    );
    send?.click();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/correspondence/seeks');
    const body = JSON.parse(init.body as string) as {
      targetHandle: string;
      daysPerMove: number;
      preferredColor: string;
    };
    expect(body.targetHandle).toBe('bob');
    expect(typeof body.daysPerMove).toBe('number');
    expect(['random', 'white', 'black']).toContain(body.preferredColor);
  });
});
