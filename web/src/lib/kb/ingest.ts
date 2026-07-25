// 摄取服务前端客户端：统一走 Next 同源代理 /api/v1/*（服务端注入 X-KB-Token）
// 注：Route Handler 转发 request.body 是流式的，不存在内存缓冲
import type { KbApiResponse } from 'types/kb';
import type { KbJobDetail, KbJobSummary } from 'types/ingest';

// 同源相对路径；basePath 启用时 fetch/EventSource 不会自动带前缀，故用它兜底
export const INGEST_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** 上传整体时限：大 PDF 走本机 loopback 也不该超过 10 分钟 */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${INGEST_BASE}${path}`, init);
  // 网关/代理返回 HTML 时裸 res.json() 会抛「Unexpected token '<'」，先兜住
  let body: (KbApiResponse<T> & { detail?: string }) | null = null;
  try {
    body = (await res.json()) as KbApiResponse<T> & { detail?: string };
  } catch {
    throw new Error(`服务返回 ${res.status} ${res.statusText}（非 JSON 响应）`);
  }
  if (!res.ok || body.success === false) {
    throw new Error(body.error ?? body.detail ?? `请求失败: ${path}`);
  }
  return body.data as T;
}

/** job.yaml / jobs.domain 中的"待判定"哨兵（后端 pipeline.context.AUTO_DOMAIN） */
export const AUTO_DOMAIN = '__auto__';

/** 任务列表/详情的域展示：判定完成前显示占位文案 */
export function domainLabel(domain: string): string {
  return domain === AUTO_DOMAIN ? '判定中…' : domain;
}

export type KbUploadResult = { id: string; sha256: string; size: number };

export async function uploadDocument(
  file: File,
  domain: string,
  slug?: string,
  layout: boolean = true,
): Promise<KbUploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('domain', domain || 'auto'); // 空值 = 交给 classify 阶段自动判定
  if (slug) form.append('slug', slug);
  form.append('layout', String(layout));
  // 不用 AbortSignal.timeout：它需要 Chrome 103+/Safari 16+，窄于 package.json 的
  // browserslist，且是运行时 API 无法被 SWC 转译——不支持的浏览器会直接抛 TypeError
  // 让上传整体失败。与 review 页的处理保持同一口径。
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, UPLOAD_TIMEOUT_MS);
  try {
    return await request<KbUploadResult>('/api/v1/jobs', {
      method: 'POST',
      body: form,
      signal: ac.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(
        `上传超时（超过 ${
          UPLOAD_TIMEOUT_MS / 60_000
        } 分钟），请重试或换用更小的文件`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchJobs(): Promise<KbJobSummary[]> {
  return request('/api/v1/jobs');
}

export function fetchJob(id: string): Promise<KbJobDetail> {
  return request(`/api/v1/jobs/${encodeURIComponent(id)}`);
}

export function cancelJob(id: string): Promise<unknown> {
  return request(`/api/v1/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export function retryJob(id: string): Promise<unknown> {
  return request(`/api/v1/jobs/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
}

export function jobEventsUrl(id: string): string {
  return `${INGEST_BASE}/api/v1/jobs/${encodeURIComponent(id)}/events`;
}
