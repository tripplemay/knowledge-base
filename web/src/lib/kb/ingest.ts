// 摄取服务前端客户端（统一封装；大文件直连 FastAPI 绕过 Next 代理的内存缓冲）
import type { KbApiResponse } from 'types/kb';
import type { KbJobDetail, KbJobSummary } from 'types/ingest';

export const INGEST_BASE =
  process.env.NEXT_PUBLIC_INGEST_API ?? 'http://localhost:8794';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${INGEST_BASE}${path}`, init);
  const body = (await res.json()) as KbApiResponse<T> & { detail?: string };
  if (!res.ok || body.success === false) {
    throw new Error(body.error ?? body.detail ?? `请求失败: ${path}`);
  }
  return body.data as T;
}

export function uploadDocument(
  file: File,
  domain: string,
  slug?: string,
  layout: boolean = true,
): Promise<{ id: string; sha256: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  form.append('domain', domain);
  if (slug) form.append('slug', slug);
  form.append('layout', String(layout));
  return request('/api/v1/jobs', { method: 'POST', body: form });
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
