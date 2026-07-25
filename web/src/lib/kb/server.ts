// 知识库数据访问层（仅服务端使用：读取 KB 文件系统）
// KB 根目录 = web/ 的上级（可用 KB_ROOT 环境变量覆盖）
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import type {
  KbDocContent,
  KbDocSummary,
  KbDocVariant,
  KbDomainInfo,
  KbDomainOrigin,
  KbPdfKind,
  KbSearchHit,
} from 'types/kb';

const KB_ROOT = process.env.KB_ROOT ?? path.resolve(process.cwd(), '..');
const DOMAINS_DIR = path.join(KB_ROOT, 'domains');
const CONFIG_PATH = path.join(KB_ROOT, '_kb', 'config.yaml');
/** 域注册表（机器托管，classify 阶段写入）；缺失时回退旧布局 config.yaml */
const REGISTRY_PATH = path.join(KB_ROOT, '_kb', 'domains.yaml');

const VARIANT_FILES: Record<KbDocVariant, string> = {
  zh: 'zh.md',
  bilingual: 'bilingual.md',
  en: 'source.en.md',
};

const SEARCH_HIT_LIMIT = 50;

function readYaml(file: string): any {
  return yaml.load(fs.readFileSync(file, 'utf-8'));
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** 校验并返回域目录名单，防止路径穿越 */
function listDomainIds(): string[] {
  if (!fs.existsSync(DOMAINS_DIR)) return [];
  return fs
    .readdirSync(DOMAINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

function assertDomain(domain: string): string {
  if (!listDomainIds().includes(domain)) {
    throw new Error(`未知知识域: ${domain}`);
  }
  return domain;
}

function listDocDirs(domain: string): string[] {
  const dir = path.join(DOMAINS_DIR, domain, 'sources');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .reverse();
}

function assertDoc(domain: string, slug: string): string {
  if (!listDocDirs(domain).includes(slug)) {
    throw new Error(`文档不存在: ${domain}/${slug}`);
  }
  return path.join(DOMAINS_DIR, domain, 'sources', slug);
}

function countTerms(docDir: string): number {
  const file = path.join(docDir, 'terms.csv');
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  return Math.max(lines.length - 1, 0);
}

function readDocSummary(domain: string, slug: string): KbDocSummary {
  const docDir = assertDoc(domain, slug);
  const meta = readYaml(path.join(docDir, 'meta.yaml')) ?? {};
  return {
    slug,
    domain,
    title: slugToTitle(slug),
    sourceFile: meta.source_file ?? '',
    ingestedAt: meta.ingested_at ?? '',
    chunks: meta.chunks ?? 0,
    termCount: countTerms(docDir),
    costUsd: meta.cost_usd ?? 0,
    summary: meta.summary ?? '',
  };
}

type DomainRegistryEntry = {
  name?: string;
  description?: string;
  origin?: KbDomainOrigin;
  created_at?: string;
};

function readDomainRegistry(): Record<string, DomainRegistryEntry> {
  if (fs.existsSync(REGISTRY_PATH)) {
    return (readYaml(REGISTRY_PATH)?.domains ?? {}) as Record<
      string,
      DomainRegistryEntry
    >;
  }
  return (readYaml(CONFIG_PATH)?.domains ?? {}) as Record<
    string,
    DomainRegistryEntry
  >;
}

export function listDomains(): KbDomainInfo[] {
  const registry = readDomainRegistry();
  return listDomainIds().map((id) => {
    const docs = listDocDirs(id).map((slug) => readDocSummary(id, slug));
    return {
      id,
      name: registry[id]?.name ?? id,
      description: registry[id]?.description ?? '',
      origin: registry[id]?.origin ?? 'manual',
      createdAt: registry[id]?.created_at ?? null,
      docCount: docs.length,
      totalCostUsd: Number(
        docs.reduce((sum, d) => sum + d.costUsd, 0).toFixed(4),
      ),
      lastIngestedAt: docs[0]?.ingestedAt ?? null,
    };
  });
}

export function listDocs(domain: string): KbDocSummary[] {
  assertDomain(domain);
  return listDocDirs(domain).map((slug) => readDocSummary(domain, slug));
}

export function getDocContent(
  domain: string,
  slug: string,
  variant: KbDocVariant,
): KbDocContent {
  assertDomain(domain);
  const docDir = assertDoc(domain, slug);
  const variants = (Object.keys(VARIANT_FILES) as KbDocVariant[]).filter((v) =>
    fs.existsSync(path.join(docDir, VARIANT_FILES[v])),
  );
  const chosen = variants.includes(variant) ? variant : variants[0];
  if (!chosen) throw new Error(`文档没有可读内容: ${domain}/${slug}`);
  return {
    meta: readDocSummary(domain, slug),
    variant: chosen,
    markdown: fs.readFileSync(
      path.join(docDir, VARIANT_FILES[chosen]),
      'utf-8',
    ),
    variants,
    pdfs: listPdfKinds(docDir),
    hasPages: fs.existsSync(path.join(docDir, 'pages.zh.json')),
  };
}

export function getPages(domain: string, slug: string): unknown {
  assertDomain(domain);
  const docDir = assertDoc(domain, slug);
  const file = path.join(docDir, 'pages.zh.json');
  if (!fs.existsSync(file))
    throw new Error(`无按页翻译数据: ${domain}/${slug}`);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const PDF_FILES: Record<KbPdfKind, string> = {
  source: 'source.pdf',
  zh: 'zh.pdf',
  dual: 'dual.pdf',
};

function listPdfKinds(docDir: string): KbPdfKind[] {
  return (Object.keys(PDF_FILES) as KbPdfKind[]).filter((kind) =>
    fs.existsSync(path.join(docDir, PDF_FILES[kind])),
  );
}

export function getPdfFile(
  domain: string,
  slug: string,
  kind: KbPdfKind,
): { path: string; filename: string } {
  assertDomain(domain);
  const docDir = assertDoc(domain, slug);
  const filename = PDF_FILES[kind];
  if (!filename || !fs.existsSync(path.join(docDir, filename))) {
    throw new Error(`PDF 不存在: ${domain}/${slug}/${kind}`);
  }
  return { path: path.join(docDir, filename), filename };
}

export function searchKb(query: string, domain?: string): KbSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const domains = domain ? [assertDomain(domain)] : listDomainIds();
  const hits: KbSearchHit[] = [];
  for (const d of domains) {
    for (const slug of listDocDirs(d)) {
      const file = path.join(DOMAINS_DIR, d, 'sources', slug, 'zh.md');
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].toLowerCase().includes(q)) continue;
        hits.push({
          domain: d,
          slug,
          title: slugToTitle(slug),
          line: i + 1,
          snippet: lines[i].trim().slice(0, 200),
        });
        if (hits.length >= SEARCH_HIT_LIMIT) return hits;
      }
    }
  }
  return hits;
}
