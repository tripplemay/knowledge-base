// 知识库共享类型（前后端统一）

/** 域来源：人工创建 / classify 自动创建 / 系统兜底域 */
export type KbDomainOrigin = 'manual' | 'auto' | 'system';

export interface KbDomainInfo {
  id: string;
  name: string;
  description: string;
  origin: KbDomainOrigin;
  createdAt: string | null;
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

/** 文档目录下可用的 PDF 产物：原件 / 保版式中文 / 保版式双语 */
export type KbPdfKind = 'source' | 'zh' | 'dual';

/** 阅读器视图：文本三档 + PDF 三档 + 对照阅读 */
export type KbReaderView =
  | KbDocVariant
  | 'pdf'
  | 'zhpdf'
  | 'dualpdf'
  | 'compare';

/** 阅读器骨架：驱动 LangTabs / DocMetaPanel，不含正文 */
export interface KbDocMeta {
  meta: KbDocSummary;
  variants: KbDocVariant[];
  pdfs: KbPdfKind[];
  hasPages: boolean;
}

/** 正文接口返回体 = 骨架 + 选中档正文（字段与旧版一致，向后兼容） */
export type KbDocContent = KbDocMeta & {
  variant: KbDocVariant;
  markdown: string;
};

export interface KbPageZh {
  page: number;
  zh: string;
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

/** 知识图谱实体节点（LightRAG 导出） */
export interface KgNode {
  id: string;
  type?: string;
  degree: number;
  description?: string;
  source?: string; // 后端用 '<SEP>' 连接多个出处
}

/** 知识图谱关系边 */
export interface KgLink {
  source: string;
  target: string;
}

/** 图谱接口返回体：按度数截断后的子图 + 全图规模 */
export interface KgGraph {
  nodes: KgNode[];
  links: KgLink[];
  total_nodes: number;
  total_edges: number;
}
