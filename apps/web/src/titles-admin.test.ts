import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountTitlesAdmin } from './titles-admin.js';

const pendingRequest = {
  id: 'titlereq_1',
  title: 'xgm',
  evidence: 'WXF profile: example.org/players/1\nReal name: Wei Chen',
  status: 'pending',
  decidedAt: null,
  createdAt: '2026-07-10T00:00:00.000Z',
  handle: 'weichen',
  displayName: 'Wei Chen',
  currentTitle: null,
};

const decidedRequest = {
  id: 'titlereq_0',
  title: 'gm',
  evidence: 'FIDE profile',
  status: 'approved',
  decidedAt: '2026-07-09T00:00:00.000Z',
  createdAt: '2026-07-08T00:00:00.000Z',
  handle: 'anna',
  displayName: 'Anna',
  currentTitle: 'gm',
};

describe('titles admin page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('renders the pending queue with evidence and the decided history', async () => {
    vi.stubGlobal('fetch', vi.fn(routeFetch()));
    const root = mountRoot();
    await mountTitlesAdmin(root);

    expect(root.textContent).toContain('Pending (1)');
    expect(root.textContent).toContain('XGM (Xiangqi Grandmaster)');
    expect(root.querySelector('.titles-admin-evidence')?.textContent).toContain(
      'Real name: Wei Chen',
    );
    const who = root.querySelector<HTMLAnchorElement>('.titles-admin-row-head a');
    expect(who?.getAttribute('href')).toBe('/@/weichen');

    expect(root.textContent).toContain('Recent decisions');
    expect(root.textContent).toContain('Approved');
    expect(root.textContent).toContain('@anna');
  });

  it('approves a request via the admin endpoint and refreshes the queue', async () => {
    let pending = [pendingRequest];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/titles/requests?status=pending') {
        return jsonResponse({ requests: pending });
      }
      if (url === '/api/admin/titles/requests?status=decided') {
        return jsonResponse({ requests: [decidedRequest] });
      }
      if (url === '/api/admin/titles/requests/titlereq_1/approve' && init?.method === 'POST') {
        pending = [];
        return jsonResponse({ request: { ...pendingRequest, status: 'approved' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountTitlesAdmin(root);

    const approve = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Approve');
    if (!approve) throw new Error('missing approve button');
    approve.click();
    await flushDom();

    const approveCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/admin/titles/requests/titlereq_1/approve',
    );
    expect(approveCall?.[1]?.method).toBe('POST');
    expect(root.textContent).toContain('Pending (0)');
    expect(root.textContent).toContain('No pending requests.');
  });

  it('maps 403 to the admin-required message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'admin_required' }, 403)),
    );
    const root = mountRoot();
    await mountTitlesAdmin(root);

    expect(root.textContent).toContain('Admin access required.');
    expect(root.querySelector('.titles-admin-list')).toBeNull();
  });
});

function routeFetch() {
  return async (url: string) => {
    if (url === '/api/admin/titles/requests?status=pending') {
      return jsonResponse({ requests: [pendingRequest] });
    }
    if (url === '/api/admin/titles/requests?status=decided') {
      return jsonResponse({ requests: [decidedRequest] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
