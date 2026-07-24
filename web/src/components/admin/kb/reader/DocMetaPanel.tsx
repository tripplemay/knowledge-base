// 文档元信息侧栏 —— 基于模板 Card 容器；行间不加分隔线（模板列表惯例：间距分隔）
import Card from 'components/card';
import type { KbDocSummary } from 'types/kb';

function MetaRow(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div className="mt-2 flex items-center justify-between px-1">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-sm font-bold text-navy-700 dark:text-white">{value}</p>
    </div>
  );
}

function DocMetaPanel(props: { meta: KbDocSummary }) {
  const { meta } = props;
  return (
    <Card extra="w-full !p-5">
      <h5 className="text-lg font-bold text-navy-700 dark:text-white">
        文档信息
      </h5>
      <MetaRow label="源文件" value={meta.sourceFile || '—'} />
      <MetaRow label="摄取时间" value={meta.ingestedAt.slice(0, 10) || '—'} />
      <MetaRow label="分块数" value={String(meta.chunks)} />
      <MetaRow label="术语数" value={String(meta.termCount)} />
      <MetaRow label="翻译成本" value={`$${meta.costUsd.toFixed(4)}`} />
      {meta.summary ? (
        <>
          <h5 className="mt-4 text-lg font-bold text-navy-700 dark:text-white">
            摘要
          </h5>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
            {meta.summary}
          </p>
        </>
      ) : null}
    </Card>
  );
}

export default DocMetaPanel;
