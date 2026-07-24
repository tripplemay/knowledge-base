// 知识库共享类型（前后端统一）

export interface KbDomainInfo {
  id: string;
  name: string;
  description: string;
  docCount: number;
  totalCostUsd: number;
  lastIngestedAt: string | null;
}

export interface KbDocSummary {
  slug: string;
  domain: string;
  title: string;
  sourceFile: string;
  ingestedAt: string;
  chunks: number;
  termCount: number;
  costUsd: number;
  summary: string;
}

export type KbDocVariant = 'zh' | 'bilingual' | 'en';

export interface KbDocContent {
  meta: KbDocSummary;
  variant: KbDocVariant;
  markdown: string;
  variants: KbDocVariant[];
}

export interface KbSearchHit {
  domain: string;
  slug: string;
  title: string;
  line: number;
  snippet: string;
}

export interface KbApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}
