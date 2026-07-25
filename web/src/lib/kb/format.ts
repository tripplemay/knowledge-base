// KB 展示层的格式化工具 —— Server / Client 组件共用（纯函数、不碰浏览器 API 与本地时区）

/** 摄取时间展示：ISO 取日期部分；非 ISO 原样回显；空/非法回 '—' */
export function fmtDate(value: unknown): string {
  if (value == null || value === '') return '—';
  // js-yaml 默认 schema 会把合法 YAML 时间戳解析成 Date，RSC 下原样传到组件；
  // 统一走 UTC 的 ISO 形式，避免 toLocaleDateString 那种 SSR/CSR 时区不一致的水合差异
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? '—'
      : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}
