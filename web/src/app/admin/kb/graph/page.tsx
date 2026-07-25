'use client';
// 知识图谱可视化 —— LightRAG 实体关系图（按度数取前 N），点击节点看出处
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Card from 'components/card';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { INGEST_BASE } from 'lib/kb/ingest';
import { fetchDomains } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';
import type { KgGraph, KgNode } from 'types/kb';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
});

// 取自模板调色板：#4318FF=blueSecondary、#FFB547=horizonOrange-500、#868CFF=brandLinear
// #05CD99 / #EE5D50 = tailwind.config 里 green-50 / red-50 的不透明原色
// #39B8FF = 模板 variables/charts.ts 的图表副色
const TYPE_COLORS: Record<string, string> = {
  concept: '#4318FF',
  organization: '#05CD99',
  person: '#FFB547',
  technology: '#39B8FF',
  event: '#EE5D50',
};

/** 单次取图上限：300 节点的大图后端约需 5-10 秒，留数倍余量 */
const GRAPH_TIMEOUT_MS = 30_000;

const GraphPage = () => {
  const [domain, setDomain] = useState('ai-engineering');
  const { data: domains, error: domainsError } = useKbFetch(fetchDomains, []);
  const [data, setData] = useState<KgGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KgNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    // 切域时旧请求可能仍在途，必须能中止；同时给 30s 兜底超时
    // cancelled 守卫与 lib/kb/useKbFetch.ts 一致：响应已 resolve 但 cleanup 已跑时不再 setState
    let cancelled = false;
    let timedOut = false;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, GRAPH_TIMEOUT_MS);
    // 换域先清掉上一域的错误与选中实体，否则错误卡会一直挂着、详情与图不同域
    setError(null);
    setSelected(null);
    fetch(
      `${INGEST_BASE}/api/v1/kg/graph?domain=${encodeURIComponent(
        domain,
      )}&max_nodes=300`,
      { signal: ac.signal },
    )
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.success)
          throw new Error(body.error ?? body.detail ?? '加载失败');
        // 取图期间旧图仍可点，新图落地时再清一次选中，避免详情停留在旧域实体
        setSelected(null);
        setData(body.data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        // 超时也走 AbortError，必须与 cleanup 中止区分开，否则静默卡在加载中
        if (timedOut) setError('图谱加载超时（超过 30 秒），请稍后重试');
        else if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ac.abort();
    };
  }, [domain]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="lg:col-span-8" ref={containerRef}>
        <Card extra="w-full !p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-600">
              {/* 条件与下方图容器保持一致，否则出错时表头会描述一张并不存在的图 */}
              {data && !error
                ? `展示度数前 ${data.nodes.length} 个实体（全图 ${data.total_nodes} 实体 / ${data.total_edges} 关系）· 点击节点查看详情`
                : '知识图谱实体关系'}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {domainsError ? (
                <span
                  className="text-xs font-medium text-red-500"
                  title={domainsError}
                >
                  域列表加载失败
                </span>
              ) : null}
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="flex h-12 w-[200px] shrink-0 items-center rounded-xl border border-gray-200 bg-white/0 p-3 text-sm text-navy-700 outline-none dark:!border-white/10 dark:text-white [&>option]:dark:bg-navy-800"
              >
                {/* 域列表为空（加载中或失败）时兜底一个当前域，避免下拉显示空白框 */}
                {(domains ?? []).length === 0 ? (
                  <option value={domain}>{domain}</option>
                ) : null}
                {(domains ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* 错误/加载不做整页早返回，否则 select 一起卸载、用户无法切回可用域 */}
          {data && !error ? (
            <div className="overflow-hidden rounded-[20px] bg-gray-100 dark:!bg-navy-900">
              <ForceGraph2D
                graphData={data}
                width={width - 48}
                height={640}
                nodeLabel={(n: any) => n.id}
                nodeVal={(n: any) => Math.max(2, n.degree / 6)}
                nodeColor={(n: any) => TYPE_COLORS[n.type] ?? '#868CFF'}
                linkColor={() => 'rgba(135,140,255,0.25)'}
                onNodeClick={(n: any) => setSelected(n)}
              />
            </div>
          ) : null}
        </Card>
        {error ? <KbError message={error} /> : null}
        {!data && !error ? <KbLoading /> : null}
      </div>
      <div className="lg:col-span-4">
        <Card extra="w-full !p-5">
          <h5 className="text-lg font-bold text-navy-700 dark:text-white">
            {selected ? selected.id : '实体详情'}
          </h5>
          {selected ? (
            <>
              <p className="mt-2 text-sm font-medium text-gray-600">
                类型 {selected.type || '—'} · 连接度 {selected.degree}
              </p>
              <p className="mt-3 text-sm leading-6 text-navy-700 dark:text-white">
                {selected.description || '（无描述）'}
              </p>
              <p className="mt-3 text-xs font-medium text-gray-600">
                来源：{String(selected.source).split('<SEP>').join('、') || '—'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-medium text-gray-600">
              点击图中节点查看描述与出处
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default GraphPage;
