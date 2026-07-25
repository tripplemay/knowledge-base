// 文件/目录级缓存：以 (mtimeNs,size,ino) 为版本键。
// 语料由 Python 流水线在进程外写入（registry.py 原子替换 domains.yaml、
// assemble.py 把 tmp_dir 一次性 rename 进 sources/、layout/pages 阶段往 doc 目录追加文件），
// Node 收不到任何通知，所以不能用 unstable_cache / TTL 兜底，必须每次 stat 校验。
import { stat } from 'fs/promises';

type Entry = { version: string; value: unknown };

const store = new Map<string, Entry>();

/**
 * 容量上限：文档被删除后其 meta.yaml / terms.csv / pages.zh.json 等条目
 * 再也没人 stat（走不到下面的 store.delete），无上限会随语料增长单调膨胀。
 * Map 迭代序即插入序，超限时淘汰最早写入的一批（FIFO 足够，缓存本身很廉价）。
 */
const MAX_ENTRIES = 2000;

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES;
  let i = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++i >= overflow) break;
  }
}

/**
 * 目标的版本指纹；目标不存在返回 null。
 * 只有 ENOENT/ENOTDIR 才算"不存在"——EACCES、KB_ROOT 配错等故障必须抛出去，
 * 否则上层会把它当成空数据，页面显示"还没有知识域"而真实原因被吞掉。
 */
async function versionOf(target: string): Promise<string | null> {
  try {
    const st = await stat(target, { bigint: true }); // ns 精度，避免同毫秒改写漏判
    return `${st.mtimeNs}:${st.size}:${st.ino}`; // BigInt 只做字符串拼接，不参与算术
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }
}

/**
 * 命中返回缓存值；target 不存在返回 null 并清理条目。
 * load 抛错则不写缓存 —— pages.py 直接写 pages.zh.json（全流程唯一非原子写），
 * 读侧 JSON.parse 可能读到截断内容，绝不能把这次失败固化下来。
 */
export async function cached<T>(
  target: string,
  load: () => Promise<T>,
): Promise<T | null> {
  const version = await versionOf(target);
  if (version === null) {
    store.delete(target);
    return null;
  }
  const hit = store.get(target);
  if (hit && hit.version === version) return hit.value as T;
  const value = await load();
  store.set(target, { version, value });
  evictIfNeeded();
  return value;
}

/** 清空全部缓存（测试/调试用） */
export function clearKbCache() {
  store.clear();
}
