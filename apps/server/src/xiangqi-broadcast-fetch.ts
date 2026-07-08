// Charset-aware fetch for broadcast sources. Chinese xiangqi sites (dpxq.com and
// its mirrors) serve gb2312/GBK, not UTF-8. The move data is ASCII either way,
// but player and event names mojibake if we decode gb2312 bytes as UTF-8. The
// default fetch reads raw bytes and decodes with the source's real charset
// (from the Content-Type header, else a <meta charset> sniff), falling back to
// UTF-8 for unknown labels.

import type { XiangqiBroadcastSourceFetch } from './xiangqi-broadcast-poller.js';

function charsetFromContentType(contentType: string | null): string | undefined {
  const match = contentType?.match(/charset=["']?([\w-]+)/i);
  return match?.[1]?.toLowerCase();
}

function charsetFromMetaSniff(bytes: Uint8Array): string | undefined {
  // Meta charset declarations are ASCII, so a latin1 view of the head is enough
  // to read them without first knowing the encoding.
  const head = Buffer.from(bytes.subarray(0, 2048)).toString('latin1');
  const match =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? head.match(/charset=["']?([\w-]+)["']?/i);
  return match?.[1]?.toLowerCase();
}

export function detectSourceCharset(bytes: Uint8Array, contentType: string | null): string {
  return charsetFromContentType(contentType) ?? charsetFromMetaSniff(bytes) ?? 'utf-8';
}

export function decodeSourceBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = detectSourceCharset(bytes, contentType);
  try {
    // WHATWG maps gb2312 -> GBK; TextDecoder throws RangeError on unknown labels.
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export const defaultXiangqiBroadcastFetch: XiangqiBroadcastSourceFetch = async (url, init) => {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    async text() {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return decodeSourceBody(bytes, response.headers.get('content-type'));
    },
  };
};
