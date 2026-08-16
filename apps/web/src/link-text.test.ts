import { describe, expect, it } from 'vitest';
import { appendLinkedText, splitLinkedText } from './link-text.js';

describe('splitLinkedText', () => {
  it('leaves text with no URL as a single part', () => {
    expect(splitLinkedText('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
  });

  it('links a bare https URL and keeps the surrounding text', () => {
    expect(splitLinkedText('see https://example.com/a for more')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: ' for more' },
    ]);
  });

  it('keeps sentence punctuation out of the href', () => {
    // The common authoring case: a URL ending a sentence. A trailing period
    // inside the href 404s, so it has to travel as text.
    expect(splitLinkedText('read https://example.com/post/.')).toEqual([
      { kind: 'text', text: 'read ' },
      { kind: 'link', text: 'https://example.com/post/', href: 'https://example.com/post/' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('finds every URL, not just the first', () => {
    const parts = splitLinkedText('https://a.example https://b.example');
    expect(parts.filter((p) => p.kind === 'link').map((p) => p.text)).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('does not carry regex state between calls', () => {
    // A module-level /g regex keeps lastIndex, so the second call would start
    // mid-string and silently miss the link.
    const once = splitLinkedText('go https://example.com now');
    const twice = splitLinkedText('go https://example.com now');
    expect(twice).toEqual(once);
  });

  it('leaves non-http schemes as plain text', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
    ]) {
      expect(splitLinkedText(hostile)).toEqual([{ kind: 'text', text: hostile }]);
    }
  });

  it('leaves a bare scheme with no host as text', () => {
    expect(splitLinkedText('https://')).toEqual([{ kind: 'text', text: 'https://' }]);
  });
});

describe('appendLinkedText', () => {
  it('builds an anchor for the URL and text nodes for the rest', () => {
    const host = document.createElement('p');
    appendLinkedText(host, 'read https://example.com/x today');
    const anchors = host.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('href')).toBe('https://example.com/x');
    expect(anchors[0].rel).toBe('noopener noreferrer');
    expect(host.textContent).toBe('read https://example.com/x today');
  });

  it('never parses the source text as markup', () => {
    // The whole reason the callers used textContent. If this regresses, an
    // author-supplied description becomes an injection point.
    const host = document.createElement('p');
    appendLinkedText(host, '<img src=x onerror=alert(1)> and <b>bold</b>');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toBe('<img src=x onerror=alert(1)> and <b>bold</b>');
  });
});
