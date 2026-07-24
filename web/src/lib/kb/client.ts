// 知识库前端数据访问（统一 fetch 封装，供所有页面复用）
import type {
  KbApiResponse,
  KbDocContent,
  KbDocSummary,
  KbDocVariant,
  KbDomainInfo,
  KbPageZh,
  KbSearchHit,
} from 'types/kb';

async function fetchKb<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json()) as KbApiResponse<T>;
  if (!body.success || body.data === null) {
    throw new Error(body.error ?? `请求失败: ${url}`);
  }
  return body.data;
}

export function fetchDomains(): Promise<KbDomainInfo[]> {
  return fetchKb('/api/kb/domains');
}

export function fetchDocs(domain: string): Promise<KbDocSummary[]> {
  return fetchKb(`/api/kb/docs?domain=${encodeURIComponent(domain)}`);
}

export function fetchDoc(
  domain: string,
  slug: string,
  variant: KbDocVariant,
): Promise<KbDocContent> {
  const params = new URLSearchParams({ domain, slug, variant });
  return fetchKb(`/api/kb/doc?${params}`);
}

export function fetchPages(domain: string, slug: string): Promise<KbPageZh[]> {
  const params = new URLSearchParams({ domain, slug });
  return fetchKb(`/api/kb/pages?${params}`);
}

export function fetchSearch(
  q: string,
  domain?: string,
): Promise<KbSearchHit[]> {
  const params = new URLSearchParams({ q });
  if (domain) params.set('domain', domain);
  return fetchKb(`/api/kb/search?${params}`);
}
