import { describe, expect, it } from 'vitest';
import { parseSourceUrls } from './xiangqi-broadcast-ops.js';

describe('parseSourceUrls', () => {
  it('splits one URL per line, trimming blanks', () => {
    const raw = '  https://a.test/1.html \n\nhttps://a.test/2.html\n  ';
    expect(parseSourceUrls(raw)).toEqual(['https://a.test/1.html', 'https://a.test/2.html']);
  });

  it('also tolerates space- and comma-separated URLs', () => {
    expect(
      parseSourceUrls('https://a.test/1.html, https://a.test/2.html https://a.test/3.html'),
    ).toEqual(['https://a.test/1.html', 'https://a.test/2.html', 'https://a.test/3.html']);
  });

  it('de-duplicates in first-seen order', () => {
    const raw = 'https://a.test/1.html\nhttps://a.test/2.html\nhttps://a.test/1.html';
    expect(parseSourceUrls(raw)).toEqual(['https://a.test/1.html', 'https://a.test/2.html']);
  });

  it('returns a single URL unchanged (back-compat with the old single-input flow)', () => {
    expect(parseSourceUrls('http://www.dpxq.com/hldcg/search/view_m_140500.html')).toEqual([
      'http://www.dpxq.com/hldcg/search/view_m_140500.html',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseSourceUrls('   \n  ')).toEqual([]);
  });
});
