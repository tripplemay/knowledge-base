// FastAPI 摄取服务的服务端代理：浏览器只与 Next 同源通信，token 在服务端注入。
// 刻意用 Route Handler 而非 next.config 的 rewrites —— 后者会走 clonableBody，
// 超过 middlewareClientMaxBodySize(10MB) 后静默截断请求体，且带 30s proxyTimeout。
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.INGEST_API_URL ?? 'http://127.0.0.1:8794'; // 不带 NEXT_PUBLIC_
const TOKEN = process.env.KB_API_TOKEN ?? '';

// 接口白名单：catch-all 不能变成 FastAPI 的开放前门。新增前端接口时必须同步加条目。
const ALLOW: RegExp[] = [
  /^jobs$/,
  /^jobs\/[\w.-]+$/,
  /^jobs\/[\w.-]+\/(cancel|retry|events)$/,
  /^kg\/(graph|query)$/,
  /^review$/,
  /^review\/[\w.-]+\/(approve|reject)$/,
];

// 请求侧剥 hop-by-hop + host + cookie + accept-encoding（交给 undici 自协商）。
// 刻意不剥 content-type / content-length：multipart boundary 必须透传，
// 且 undici 会遵循 content-length 不降级 chunked。
// expect 必须剥：undici 不支持 Expect: 100-continue，会抛 NotSupportedError，
// 表现为大文件上传一律 502（curl 对 >1KB 的 body 会自动带上这个头）。
// x-kb-token 也必须剥：客户端自带的值不得越过服务端注入生效。
const DROP_REQ = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'expect',
  'proxy-authorization',
  'proxy-authenticate',
  'accept-encoding',
  'cookie',
  'x-kb-token',
]);

/**
 * 同源校验：代理会替请求注入 token，若不校验来源，CSRF 面只是从 :8794 搬到 :3456
 * （任何跨站页面都能借本代理之手触发 review approve → 改写 claims + git commit）。
 * Sec-Fetch-Site 是浏览器强制附加、页面无法伪造的头；非浏览器客户端（curl）不带
 * 该头也不带 Origin，予以放行以保留本机脚本调试能力。
 */
function isCrossSite(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.get('origin');
  if (!origin) return false; // 无 Origin：非浏览器发起
  try {
    return new URL(origin).host !== req.headers.get('host');
  } catch {
    return true;
  }
}
// 响应侧必须剥 content-encoding/content-length：undici 已解压正文但保留旧头，
// 不剥会让浏览器二次解码失败或截断。
const DROP_RES = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'content-encoding',
  'content-length',
]);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params; // Next 15：params 是 Promise
  const rel = path.join('/');
  const bad = path.some(
    (s) => s === '.' || s === '..' || s.includes('/') || s.includes('\\'),
  );
  if (bad || !ALLOW.some((re) => re.test(rel))) {
    console.warn('[api/v1 proxy] 未在白名单:', rel);
    return NextResponse.json(
      { success: false, data: null, error: '未知接口' },
      { status: 404 },
    );
  }
  if (isCrossSite(req)) {
    console.warn('[api/v1 proxy] 拒绝跨站请求:', rel);
    return NextResponse.json(
      { success: false, data: null, error: '拒绝跨站请求' },
      { status: 403 },
    );
  }

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!DROP_REQ.has(k)) headers.set(k, v);
  });
  if (TOKEN) headers.set('x-kb-token', TOKEN); // 服务端注入，浏览器永不持有

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/api/v1/${rel}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined, // 流式，不落内存
      duplex: 'half', // Node/undici 必需，否则直接抛错
      redirect: 'manual',
      cache: 'no-store',
      signal: req.signal, // 浏览器断开 → 上游一并取消（SSE 关键）
    } as RequestInit & { duplex: 'half' });
  } catch (err: any) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error('[api/v1 proxy]', rel, err);
    // 连接类错误才是"服务不可达"；请求本身不被 undici 支持时按 400 报出，
    // 否则排障会一直朝"后端挂了"的方向查
    const connectFailed =
      err?.cause?.code?.startsWith?.('ECONN') ||
      err?.cause?.code === 'ENOTFOUND' ||
      err?.cause?.code === 'EHOSTUNREACH' ||
      err?.name === 'TimeoutError';
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: connectFailed
          ? '摄取服务不可达'
          : `代理转发失败：${err?.message ?? String(err)}`,
      },
      { status: connectFailed ? 502 : 400 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!DROP_RES.has(k)) out.set(k, v);
  });
  if (
    (upstream.headers.get('content-type') ?? '').includes('text/event-stream')
  ) {
    // Next 对所有响应套了 Express compression，只有 Cache-Control 含 no-transform 才放弃压缩；
    // sse_starlette 只给 no-store，不加这行 SSE 会被缓冲成"最后一次性涌出"。
    out.set('cache-control', 'no-cache, no-transform');
    out.set('x-accel-buffering', 'no');
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
