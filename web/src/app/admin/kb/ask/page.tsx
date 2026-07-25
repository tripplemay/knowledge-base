'use client';
// 语义问答 —— LightRAG 图谱+向量混合检索，答案带来源引用
import { useEffect, useRef, useState } from 'react';
import Card from 'components/card';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import { KbError } from 'components/admin/kb/KbState';
import { fetchDomains } from 'lib/kb/client';
import { INGEST_BASE } from 'lib/kb/ingest';
import { useKbFetch } from 'lib/kb/useKbFetch';

/** 单次查询上限：页面文案标注 30-60 秒，留 2 倍余量 */
const QUERY_TIMEOUT_MS = 120_000;

const AskPage = () => {
  const {
    data: domains,
    loading: domainsLoading,
    error: domainsError,
  } = useKbFetch(fetchDomains, []);
  const [domain, setDomain] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domainList = domains ?? [];
  // 当前 domain 必须真实存在于下拉选项里，否则视为「未就绪」
  const domainReady = domainList.some((d) => d.id === domain);

  // 域列表到达后校正 state：初始为空、或旧域已不在列表中时落到第一个可用域
  useEffect(() => {
    if (!domains || domains.length === 0) return;
    if (domains.some((d) => d.id === domain)) return;
    setDomain(domains[0].id);
  }, [domains, domain]);

  const selectDomain = (next: string) => {
    setDomain(next);
    // 换域后旧答案/旧错误/在途请求都不再属于当前域：不中止的话，
    // 旧域那次 30-60 秒的查询回来仍会 setAnswer，出现「选着 B 却显示 A 的答案」
    acRef.current?.abort();
    setAnswer(null);
    setError(null);
  };

  // 同一个 controller 同时承载「新提问打断旧提问」「超时」「卸载中止」
  const acRef = useRef<AbortController | null>(null);
  useEffect(() => () => acRef.current?.abort(), []);

  const ask = async () => {
    if (question.trim().length < 4 || loading || !domainReady) return;
    acRef.current?.abort(); // 新提问打断旧提问
    const ac = new AbortController();
    acRef.current = ac;
    // 区分「超时中止」与「卸载/新提问中止」，两者文案不同
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, QUERY_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    // 只有 fetch 自身 reject 才算连接失败：不加这个标记的话，
    // try 块内任何 TypeError（如解析响应体）都会被误诊成「后端没启动」
    let networkFailed = false;
    try {
      const res = await fetch(`${INGEST_BASE}/api/v1/kg/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, question }),
        signal: ac.signal,
      }).catch((err: any) => {
        if (err?.name !== 'AbortError') networkFailed = true;
        throw err;
      });
      // 网关/代理返回 HTML（含 HTTP 200 的离线页、重写页）时，裸 res.json() 会抛 SyntaxError
      if (!(res.headers.get('content-type') ?? '').includes('json')) {
        throw new Error(
          res.ok
            ? '摄取服务返回了非 JSON 响应，请确认接口地址是否被代理改写'
            : `服务返回 ${res.status} ${res.statusText}`,
        );
      }
      const body = await res.json();
      if (!body.success)
        throw new Error(body.error ?? body.detail ?? '查询失败');
      setAnswer(body.data?.answer ?? '（服务未返回答案内容）');
    } catch (err: any) {
      if (timedOut) {
        setError(
          `查询超时（超过 ${QUERY_TIMEOUT_MS / 1000} 秒），请缩短问题后重试`,
        );
      } else if (err?.name === 'AbortError') {
        // 卸载或被新提问打断：无需提示
      } else if (networkFailed) {
        // fetch 连接被拒与跨域被拦截抛的是同一个 TypeError，无法区分，文案兼顾两因
        setError(
          '无法连接摄取服务：请确认后端已启动，且当前站点在其 CORS 白名单内',
        );
      } else {
        setError(err?.message ?? '查询失败');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <h5 className="mb-3 text-lg font-bold text-navy-700 dark:text-white">
          知识库问答
        </h5>
        <div className="flex w-full flex-wrap items-center gap-3">
          <select
            value={domain}
            onChange={(e) => selectDomain(e.target.value)}
            className="flex h-12 w-[200px] shrink-0 items-center rounded-xl border border-gray-200 bg-white/0 p-3 text-sm text-navy-700 outline-none dark:!border-white/10 dark:text-white [&>option]:dark:bg-navy-800"
          >
            {domainReady ? null : (
              <option value="">
                {domainsLoading
                  ? '知识域加载中…'
                  : domainsError
                  ? '知识域加载失败'
                  : '暂无可用知识域'}
              </option>
            )}
            {domainList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            type="text"
            placeholder="向知识库提问，例如：智能体失败的主要原因是什么？"
            className="flex h-12 w-full min-w-[10rem] flex-1 items-center rounded-xl border border-gray-200 bg-white/0 p-3 text-sm text-navy-700 outline-none dark:!border-white/10 dark:text-white"
          />
          <button
            onClick={ask}
            disabled={loading || !domainReady}
            className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            {loading ? '检索中…' : '提问'}
          </button>
        </div>
        <p className="mt-2 text-xs font-medium text-gray-600">
          图谱 + 向量混合检索，生成约需 30-60 秒，答案附来源文档引用
        </p>
      </Card>
      {domainsError ? (
        <KbError message={`知识域列表加载失败：${domainsError}`} />
      ) : null}
      {error ? <KbError message={error} /> : null}
      {answer ? (
        <Card extra="w-full mt-3 !p-6">
          <MarkdownReader markdown={answer} />
        </Card>
      ) : null}
    </div>
  );
};

export default AskPage;
