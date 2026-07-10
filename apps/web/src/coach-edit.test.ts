import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountCoachEdit } from './coach-edit.js';

const myTitledEmpty = { titled: true, handle: 'xim-coach', profile: null };

describe('coach edit page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('prompts signed-out visitors to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'not_signed_in' }, 401)),
    );
    const root = mountRoot();
    await mountCoachEdit(root);

    expect(root.textContent).toContain('Sign in to offer coaching');
    expect(root.querySelector('form.coach-form')).toBeNull();
  });

  it('points untitled users at /verify-title instead of the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ titled: false, handle: 'student', profile: null })),
    );
    const root = mountRoot();
    await mountCoachEdit(root);

    expect(root.textContent).toContain('Coaching is for verified titled players');
    const cta = root.querySelector<HTMLAnchorElement>('.coach-untitled-cta a');
    expect(cta?.getAttribute('href')).toBe('/verify-title');
    expect(cta?.textContent).toBe('Verify your title');
    expect(root.querySelector('form.coach-form')).toBeNull();
  });

  it('renders the form for a titled user and publishes a profile', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/coaches/me' && init?.method === 'PUT') {
        return jsonResponse({
          profile: {
            headline: 'XIM lessons',
            about: 'About me.',
            languages: 'English',
            rate: '$25 / hour',
            contact: 'coach@example.com',
            acceptingStudents: true,
            published: true,
          },
        });
      }
      if (url === '/api/coaches/me') return jsonResponse(myTitledEmpty);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountCoachEdit(root);

    const form = root.querySelector<HTMLFormElement>('form.coach-form');
    expect(form).not.toBeNull();
    setInput(root, 'headline', 'XIM lessons');
    setTextarea(root, 'about', 'About me.');
    setInput(root, 'languages', 'English');
    setInput(root, 'rate', '$25 / hour');
    setInput(root, 'contact', 'coach@example.com');
    setCheckbox(root, 'published', true);
    submitForm(root);
    await flushDom();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({
      headline: 'XIM lessons',
      about: 'About me.',
      languages: 'English',
      rate: '$25 / hour',
      contact: 'coach@example.com',
      acceptingStudents: true,
      published: true,
    });
    const status = root.querySelector('.coach-form-status');
    expect(status?.textContent).toContain('Saved. Your profile is live in the directory.');
    const view = status?.querySelector<HTMLAnchorElement>('a');
    expect(view?.getAttribute('href')).toBe('/coach/xim-coach');
  });

  it('prefills the form from an existing profile and reports a draft save', async () => {
    const existing = {
      headline: 'Old headline',
      about: 'Old about.',
      languages: 'Mandarin',
      rate: '$30 / hour',
      contact: 'old@example.com',
      acceptingStudents: false,
      published: true,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/coaches/me' && init?.method === 'PUT') {
        return jsonResponse({ profile: { ...existing, published: false } });
      }
      if (url === '/api/coaches/me') {
        return jsonResponse({ titled: true, handle: 'xim-coach', profile: existing });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountCoachEdit(root);

    expect(root.querySelector<HTMLInputElement>('input[name="headline"]')?.value).toBe(
      'Old headline',
    );
    expect(root.querySelector<HTMLTextAreaElement>('textarea[name="about"]')?.value).toBe(
      'Old about.',
    );
    expect(root.querySelector<HTMLInputElement>('input[name="acceptingStudents"]')?.checked).toBe(
      false,
    );
    expect(root.querySelector<HTMLInputElement>('input[name="published"]')?.checked).toBe(true);

    setCheckbox(root, 'published', false);
    submitForm(root);
    await flushDom();

    expect(root.querySelector('.coach-form-status')?.textContent).toContain(
      'Saved as a draft. Publish it when you are ready.',
    );
  });

  it('blocks an empty headline client-side and surfaces server rejections', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/coaches/me' && init?.method === 'PUT') {
        return jsonResponse({ error: 'title_required' }, 403);
      }
      if (url === '/api/coaches/me') return jsonResponse(myTitledEmpty);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountCoachEdit(root);

    submitForm(root);
    await flushDom();
    expect(root.querySelector('.coach-form-status')?.textContent).toBe('A headline is required.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    setInput(root, 'headline', 'A headline');
    submitForm(root);
    await flushDom();
    expect(root.querySelector('.coach-form-status')?.textContent).toBe(
      'Publishing needs a verified title. Verify your title first.',
    );
  });
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function setInput(root: HTMLElement, name: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`missing input ${name}`);
  input.value = value;
}

function setTextarea(root: HTMLElement, name: string, value: string): void {
  const textarea = root.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`);
  if (!textarea) throw new Error(`missing textarea ${name}`);
  textarea.value = value;
}

function setCheckbox(root: HTMLElement, name: string, checked: boolean): void {
  const checkbox = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!checkbox) throw new Error(`missing checkbox ${name}`);
  checkbox.checked = checked;
}

function submitForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('form.coach-form');
  if (!form) throw new Error('missing coach form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
