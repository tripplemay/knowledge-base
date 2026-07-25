// 知识库数据访问层（仅服务端使用：读取 KB 文件系统）
// KB 根目录 = web/ 的上级（可用 KB_ROOT 环境变量覆盖）
// 全部 fs 走异步 API（不阻塞事件循环），目录/文件读取经 fs-cache 按 mtime 缓存
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { cached } from 'lib/kb/fs-cache';
import type {
  KbDocContent,
  KbDocMeta,
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
/**
 * 域注册表（机器托管，classify 阶段写入）；缺失时回退旧布局 config.yaml。
 * 容器部署时用 KB_REGISTRY 指到挂载卷内，须与后端 pipeline/registry.py 同值。
 */
const REGISTRY_PATH =
  process.env.KB_REGISTRY ?? path.join(KB_ROOT, '_kb', 'domains.yaml');

const VARIANT_FILES: Record<KbDocVariant, string> = {
  zh: 'zh.md',
  bilingual: 'bilingual.md',
  en: 'source.en.md',
};

const PDF_FILES: Record<KbPdfKind, string> = {
  source: 'source.pdf',
  zh: 'zh.pdf',
  dual: 'dual.pdf',
};

const SEARCH_HIT_LIMIT = 50;

/** 语料规模观测阈值：超过此体量再考虑建倒排索引（当前全库 200KB，全文扫描 <5ms） */
const SEARCH_INDEX_HINT_BYTES = 20e6;

async function readYaml(file: string): Promise<any> {
  return cached(file, async () => yaml.load(await readFile(file, 'utf-8')));
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** 校验并返回域目录名单，防止路径穿越 */
async function listDomainIds(): Promise<string[]> {
  return (
    (await cached(DOMAINS_DIR, async () =>
      (await readdir(DOMAINS_DIR, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name),
    )) ?? []
  );
}

/**
 * 「目标不存在」专用错误：与"读取失败"（YAML 损坏、权限、IO）区分开。
 * 页面据此决定 notFound() 还是抛给 error.tsx —— 一律 notFound() 会把真实故障
 * 伪装成 404，排障时看不到任何线索。
 */
export class KbNotFoundError extends Error {}

async function assertDomain(domain: string): Promise<string> {
  if (!(await listDomainIds()).includes(domain)) {
    throw new KbNotFoundError(`未知知识域: ${domain}`);
  }
  return domain;
}

function sourcesDirOf(domain: string): string {
  return path.join(DOMAINS_DIR, domain, 'sources');
}

async function listDocDirs(domain: string): Promise<string[]> {
  const dir = sourcesDirOf(domain);
  return (
    (await cached(dir, async () =>
      (
        await readdir(dir, { withFileTypes: true })
      )
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort()
        .reverse(),
    )) ?? []
  );
}

async function assertDoc(domain: string, slug: string): Promise<string> {
  if (!(await listDocDirs(domain)).includes(slug)) {
    throw new KbNotFoundError(`文档不存在: ${domain}/${slug}`);
  }
  return path.join(sourcesDirOf(domain), slug);
}

/**
 * doc 目录下的文件名集合：一次 readdir 取代此前 7 处 existsSync，
 * 且天然受 doc 目录 mtime 保护（layout/pages 阶段追加文件会改目录 mtime）。
 * 返回的 Set 为共享缓存对象，调用方只读、不得修改。
 */
async function listDocFiles(docDir: string): Promise<Set<string>> {
  return (
    (await cached(docDir, async () => new Set(await readdir(docDir)))) ??
    new Set<string>()
  );
}

async function countTerms(docDir: string): Promise<number> {
  const file = path.join(docDir, 'terms.csv');
  return (
    (await cached(file, async () => {
      const lines = (await readFile(file, 'utf-8')).trim().split('\n');
      return Math.max(lines.length - 1, 0);
    })) ?? 0
  );
}

/** docDir 由调用方传入（已 assert 过），避免此处再 readdir 一次 sources/ */
async function readDocSummary(
  domain: string,
  slug: string,
  docDir: string,
): Promise<KbDocSummary> {
  const meta = (await readYaml(path.join(docDir, 'meta.yaml'))) ?? {};
  return {
    slug,
    domain,
    title: slugToTitle(slug),
    sourceFile: meta.source_file ?? '',
    ingestedAt: meta.ingested_at ?? '',
    chunks: meta.chunks ?? 0,
    termCount: await countTerms(docDir),
    costUsd: meta.cost_usd ?? 0,
    summary: meta.summary ?? '',
  };
}

/** 某域下全部文档摘要（域已 assert；sources/ 只 readdir 一次） */
async function listDocSummaries(domain: string): Promise<KbDocSummary[]> {
  const sourcesDir = sourcesDirOf(domain);
  const slugs = await listDocDirs(domain);
  return Promise.all(
    slugs.map((slug) =>
      readDocSummary(domain, slug, path.join(sourcesDir, slug)),
    ),
  );
}

type DomainRegistryEntry = {
  name?: string;
  description?: string;
  origin?: KbDomainOrigin;
  created_at?: string;
};

async function readDomainRegistry(): Promise<
  Record<string, DomainRegistryEntry>
> {
  // cached 对不存在的目标返回 null，以此区分「文件缺失」（回退 config.yaml）与「文件为空」
  const registry = await readYaml(REGISTRY_PATH);
  const source = registry !== null ? registry : await readYaml(CONFIG_PATH);
  return (source?.domains ?? {}) as Record<string, DomainRegistryEntry>;
}

export async function listDomains(): Promise<KbDomainInfo[]> {
  const registry = await readDomainRegistry();
  const ids = await listDomainIds();
  return Promise.all(
    ids.map(async (id) => {
      const docs = await listDocSummaries(id);
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
    }),
  );
}

export async function listDocs(domain: string): Promise<KbDocSummary[]> {
  await assertDomain(domain);
  return listDocSummaries(domain);
}

/** 阅读器骨架：docDir 已 assert 过，供 getDocMeta / getDocContent 共用 */
async function readDocMeta(
  domain: string,
  slug: string,
  docDir: string,
): Promise<KbDocMeta> {
  const files = await listDocFiles(docDir);
  return {
    meta: await readDocSummary(domain, slug, docDir),
    variants: (Object.keys(VARIANT_FILES) as KbDocVariant[]).filter((v) =>
      files.has(VARIANT_FILES[v]),
    ),
    pdfs: (Object.keys(PDF_FILES) as KbPdfKind[]).filter((kind) =>
      files.has(PDF_FILES[kind]),
    ),
    hasPages: files.has('pages.zh.json'),
  };
}

/** 只取阅读器骨架（LangTabs / DocMetaPanel），不读正文 */
export async function getDocMeta(
  domain: string,
  slug: string,
): Promise<KbDocMeta> {
  await assertDomain(domain);
  return readDocMeta(domain, slug, await assertDoc(domain, slug));
}

export async function getDocContent(
  domain: string,
  slug: string,
  variant: KbDocVariant,
): Promise<KbDocContent> {
  await assertDomain(domain);
  const docDir = await assertDoc(domain, slug);
  const docMeta = await readDocMeta(domain, slug, docDir);
  // 回退语义原样保留：请求档不存在时退到第一个可用档，否则只有 en 的文档会拿到空正文
  const chosen = docMeta.variants.includes(variant)
    ? variant
    : docMeta.variants[0];
  if (!chosen) throw new Error(`文档没有可读内容: ${domain}/${slug}`);
  return {
    ...docMeta,
    variant: chosen,
    markdown: await readFile(path.join(docDir, VARIANT_FILES[chosen]), 'utf-8'),
  };
}

export async function getPages(domain: string, slug: string): Promise<unknown> {
  await assertDomain(domain);
  const docDir = await assertDoc(domain, slug);
  const file = path.join(docDir, 'pages.zh.json');
  // pages.zh.json 是非原子写，读到截断内容时 JSON.parse 抛错 —— cached 不会把失败写进缓存
  const data = await cached(file, async () =>
    JSON.parse(await readFile(file, 'utf-8')),
  );
  if (data === null) throw new Error(`无按页翻译数据: ${domain}/${slug}`);
  return data;
}

export async function getPdfFile(
  domain: string,
  slug: string,
  kind: KbPdfKind,
): Promise<{ path: string; filename: string }> {
  await assertDomain(domain);
  const docDir = await assertDoc(domain, slug);
  const filename = PDF_FILES[kind];
  if (!filename || !(await listDocFiles(docDir)).has(filename)) {
    throw new Error(`PDF 不存在: ${domain}/${slug}/${kind}`);
  }
  return { path: path.join(docDir, filename), filename };
}

type ScanHit = { line: number; snippet: string };

/** 兜底：逐行小写比较（与旧实现逐字节一致），仅在 scanContent 判定整篇扫描不安全时启用 */
function scanByLine(content: string, q: string, limit: number): ScanHit[] {
  const lines = content.split('\n');
  const out: ScanHit[] = [];
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    if (!lines[i].toLowerCase().includes(q)) continue;
    out.push({ line: i + 1, snippet: lines[i].trim().slice(0, 200) });
  }
  return out;
}

/**
 * 单文件扫描：整篇 toLowerCase 一次 + indexOf 推进，行号靠增量数换行。
 * 每行至多一条命中（与旧实现等价）。旧实现逐行 toLowerCase，
 * 对 ~3000 行的文件每次查询产生 3000 次临时字符串分配，这里降为 1 次。
 */
function scanContent(content: string, q: string, limit: number): ScanHit[] {
  const hay = content.toLowerCase();
  // 两种情况退回逐行扫描，保证与旧实现逐字节等价：
  // ① q 含换行：整篇扫描会跨行命中，而旧实现按行比较必然 0 命中
  // ② 极少数字符小写后长度会变（如 U+0130），此时 hay 与 content 索引错位
  if (q.includes('\n') || hay.length !== content.length)
    return scanByLine(content, q, limit);
  const out: ScanHit[] = [];
  let idx = hay.indexOf(q);
  let lineNo = 1;
  let scanned = 0;
  while (idx !== -1 && out.length < limit) {
    for (let i = scanned; i < idx; i++) if (hay.charCodeAt(i) === 10) lineNo++;
    scanned = idx;
    const start = content.lastIndexOf('\n', idx) + 1;
    let end = content.indexOf('\n', idx);
    if (end === -1) end = content.length;
    out.push({
      line: lineNo,
      snippet: content.slice(start, end).trim().slice(0, 200),
    });
    idx = hay.indexOf(q, end + 1); // 跳到下一行再找，保持「每行一条」
  }
  return out;
}

export async function searchKb(
  query: string,
  domain?: string,
): Promise<KbSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const domains = domain ? [await assertDomain(domain)] : await listDomainIds();
  const hits: KbSearchHit[] = [];
  let totalBytes = 0;
  // 保持串行读取：语料小，不值得为并发牺牲结果顺序的确定性
  for (const d of domains) {
    for (const slug of await listDocDirs(d)) {
      const file = path.join(sourcesDirOf(d), slug, 'zh.md');
      let content: string;
      try {
        // try/catch 取代 existsSync：省一次 syscall，且消除 TOCTOU
        content = await readFile(file, 'utf-8');
      } catch {
        continue;
      }
      totalBytes += Buffer.byteLength(content, 'utf-8');
      for (const hit of scanContent(content, q, SEARCH_HIT_LIMIT - hits.length))
        hits.push({
          domain: d,
          slug,
          title: slugToTitle(slug),
          line: hit.line,
          snippet: hit.snippet,
        });
      // 文档层提前退出（旧实现只在行内层退出）
      if (hits.length >= SEARCH_HIT_LIMIT) return hits;
    }
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    totalBytes > SEARCH_INDEX_HINT_BYTES
  ) {
    console.warn('[kb/search] 语料已超 20MB，考虑建索引');
  }
  return hits;
}
