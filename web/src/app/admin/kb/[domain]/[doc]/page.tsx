'use client';
// 文档阅读器 —— 沿用模板 course-page 的双栏布局（内容 7 栏 + 侧栏 4 栏）
// 视图：中文全文 / 双语对照 / 英文提取文本 / PDF 原件（iframe 嵌入，同 course-page 媒体区写法）
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from 'components/card';
import DocMetaPanel from 'components/admin/kb/reader/DocMetaPanel';
import LangTabs from 'components/admin/kb/reader/LangTabs';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDoc } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';
import type { KbDocVariant, KbReaderView } from 'types/kb';

const DocReaderPage = () => {
  const params = useParams<{ domain: string; doc: string }>();
  const domain = params?.domain ?? '';
  const doc = params?.doc ?? '';
  const [view, setView] = useState<KbReaderView>('zh');

  // PDF 视图不需要文本内容；保持上一次文本请求即可
  const textVariant: KbDocVariant = view === 'pdf' ? 'zh' : view;
  const { data, loading, error } = useKbFetch(
    () => fetchDoc(domain, doc, textVariant),
    [domain, doc, textVariant],
  );

  const views: KbReaderView[] = data
    ? [
        ...data.variants,
        ...(data.meta.sourceFile.toLowerCase().endsWith('.pdf')
          ? (['pdf'] as KbReaderView[])
          : []),
      ]
    : [];

  if (error) return <KbError message={error} />;
  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-11">
      <div className="lg:col-span-7">
        <Card extra="w-full !p-6">
          {data ? (
            <LangTabs views={views} active={view} onChange={setView} />
          ) : null}
          {view === 'pdf' ? (
            <iframe
              className="h-[80vh] w-full rounded-[20px]"
              src={`/api/kb/file?domain=${encodeURIComponent(
                domain,
              )}&slug=${encodeURIComponent(doc)}`}
              title="PDF 原件"
            />
          ) : loading ? (
            <p className="py-10 text-center text-sm font-medium text-gray-600">
              加载中…
            </p>
          ) : (
            <MarkdownReader markdown={data.markdown} />
          )}
        </Card>
      </div>
      <div className="lg:col-span-4">
        {loading && !data ? <KbLoading /> : null}
        {data ? <DocMetaPanel meta={data.meta} /> : null}
      </div>
    </div>
  );
};

export default DocReaderPage;
