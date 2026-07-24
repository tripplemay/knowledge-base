// 文档元信息侧栏 —— 基于模板 Card 容器
import Card from 'components/card';
import type { KbDocSummary } from 'types/kb';

function MetaRow(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-sm font-bold text-navy-700 dark:text-white">{value}</p>
    </div>
  );
}

function DocMetaPanel(props: { meta: KbDocSummary }) {
  const { meta } = props;
  return (
    <Card extra="w-full !p-5">
      <p className="mb-2 text-lg font-bold text-navy-700 dark:text-white">
        文档信息
      </p>
      <div className="divide-y divide-gray-200 dark:divide-white/10">
        <MetaRow label="源文件" value={meta.sourceFile || '—'} />
        <MetaRow label="摄取时间" value={meta.ingestedAt.slice(0, 10) || '—'} />
        <MetaRow label="分块数" value={String(meta.chunks)} />
        <MetaRow label="术语数" value={String(meta.termCount)} />
        <MetaRow label="翻译成本" value={`$${meta.costUsd.toFixed(4)}`} />
      </div>
      {meta.summary ? (
        <>
          <p className="mb-1 mt-4 text-sm font-bold text-navy-700 dark:text-white">
            摘要
          </p>
          <p className="text-sm leading-6 text-gray-600 dark:text-white/70">
            {meta.summary}
          </p>
        </>
      ) : null}
    </Card>
  );
}

export default DocMetaPanel;
