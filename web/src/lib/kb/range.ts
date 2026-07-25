// HTTP Range 请求头解析（RFC 7233 单段 bytes 范围；纯函数，无 IO，便于单测）
export type RangeResult =
  | { kind: 'full' } // Range 无法理解 → RFC 7233 §3.1 允许忽略，回 200
  | { kind: 'unsatisfiable' } // → 416 + Content-Range: bytes */size
  | { kind: 'partial'; start: number; end: number };

/** RFC 7233 单段 bytes 范围解析（多段/非法一律降级为 full） */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: 'full' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim()); // ^…$ 锚定，避免 'xbytes=0-1' 被匹到
  if (!m) return { kind: 'full' };
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return { kind: 'full' }; // 'bytes=-'

  if (rawStart === '') {
    const n = parseInt(rawEnd, 10); // 后缀范围：最后 N 字节
    // bytes=-0 必须 416；零长度资源上任何范围都不可满足
    if (n === 0 || size === 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(size - n, 0), end: size - 1 };
  }

  const start = parseInt(rawStart, 10);
  const end =
    rawEnd === '' ? size - 1 : Math.min(parseInt(rawEnd, 10), size - 1);
  if (start >= size || start > end) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end };
}
