// Render user-authored plain text with bare URLs turned into links.
//
// Study descriptions, and the other author-written prose the site renders, go
// through `textContent` on purpose: it is the only assignment that cannot
// introduce markup, and the alternative (innerHTML with an escaping pass) puts
// an XSS hole one refactor away. The cost is that a URL an author typed is dead
// text, which makes a study unable to point at anything.
//
// This keeps the guarantee and drops the cost. The text is split on a URL
// pattern and reassembled out of text nodes and anchors, so every non-URL
// character still travels as a text node and no string is ever parsed as HTML.
// Only http(s) is linked: a `javascript:` or `data:` URL is left as text.

/** http(s) URLs, stopping before trailing punctuation that reads as prose. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Trailing characters a writer means as punctuation, not as part of the URL. */
const TRAILING = /[.,;:!?)\]}>'"]+$/;

export type LinkedTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * Split text into ordered text/link parts. Exported for tests and for callers
 * that need to build nodes themselves; most callers want `appendLinkedText`.
 */
export function splitLinkedText(text: string): LinkedTextPart[] {
  const parts: LinkedTextPart[] = [];
  let cursor = 0;
  // A fresh regex per call: the global flag carries lastIndex across calls.
  const pattern = new RegExp(URL_PATTERN.source, 'g');
  let match = pattern.exec(text);
  while (match) {
    const raw = match[0];
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    const href = trailing ? raw.slice(0, raw.length - trailing.length) : raw;
    // "https://" with nothing after it is punctuation, not a destination.
    if (/^https?:\/\/\S/.test(href)) {
      if (match.index > cursor) {
        parts.push({ kind: 'text', text: text.slice(cursor, match.index) });
      }
      parts.push({ kind: 'link', text: href, href });
      if (trailing) parts.push({ kind: 'text', text: trailing });
      cursor = match.index + raw.length;
    }
    match = pattern.exec(text);
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts;
}

/**
 * Append `text` to `target`, linking bare http(s) URLs. Nothing is ever assigned
 * to innerHTML, so markup in the source text stays literal.
 */
export function appendLinkedText(target: HTMLElement, text: string): void {
  for (const part of splitLinkedText(text)) {
    if (part.kind === 'text') {
      target.append(document.createTextNode(part.text));
      continue;
    }
    const anchor = document.createElement('a');
    anchor.href = part.href;
    anchor.textContent = part.text;
    // Author-supplied destinations are outbound and untrusted.
    anchor.rel = 'noopener noreferrer';
    target.append(anchor);
  }
}
