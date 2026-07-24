'use client';
// 知识图谱可视化 —— LightRAG 实体关系图（按度数取前 N），点击节点看出处
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Card from 'components/card';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { INGEST_BASE } from 'lib/kb/ingest';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
});

const TYPE_COLORS: Record<string, string> = {
  concept: '#4318FF',
  organization: '#05CD99',
  person: '#FFB547',
  technology: '#39B8FF',
  event: '#EE5D50',
};

const GraphPage = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    fetch(`${INGEST_BASE}/api/v1/kg/graph?domain=ai-engineering&max_nodes=300`)
      .then((r) => r.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? '加载失败');
        setData(body.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  if (error) return <KbError message={error} />;
  if (!data) return <KbLoading />;
  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="lg:col-span-8" ref={containerRef}>
        <Card extra="w-full !p-4">
          <p className="mb-2 text-sm font-medium text-gray-600">
            展示度数前 {data.nodes.length} 个实体（全图 {data.total_nodes} 实体 /{' '}
            {data.total_edges} 关系）· 点击节点查看详情
          </p>
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
        </Card>
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
