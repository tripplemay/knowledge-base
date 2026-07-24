'use client';
// 文档阅读器 —— 沿用模板 course-page 的双栏布局（内容 7 栏 + 侧栏 4 栏）
// 视图：中文全文 / 双语对照 / 英文提取文本 / 中文 PDF / 双语 PDF / PDF 原件
// PDF 视图用 iframe 嵌入（同 course-page 媒体区写法）
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from 'components/card';
import DocMetaPanel from 'components/admin/kb/reader/DocMetaPanel';
import LangTabs from 'components/admin/kb/reader/LangTabs';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import PdfViewer from 'components/admin/kb/reader/PdfViewer';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDoc } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';
import type { KbDocVariant, KbPdfKind, KbReaderView } from 'types/kb';

/** PDF 产物 → 阅读器视图 的顺序即 tab 展示顺序 */
const PDF_VIEWS: { kind: KbPdfKind; view: KbReaderView }[] = [
  { kind: 'zh', view: 'zhpdf' },
  { kind: 'dual', view: 'dualpdf' },
  { kind: 'source', view: 'pdf' },
];

const PDF_VIEW_TO_KIND: Partial<Record<KbReaderView, KbPdfKind>> = {
  zhpdf: 'zh',
  dualpdf: 'dual',
  pdf: 'source',
};

const DocReaderPage = () => {
  const params = useParams<{ domain: string; doc: string }>();
  const domain = params?.domain ?? '';
  const doc = params?.doc ?? '';
  const [view, setView] = useState<KbReaderView>('zh');

  // PDF 视图不需要文本内容；保持上一次文本请求即可
  const pdfKind = PDF_VIEW_TO_KIND[view];
  const textVariant: KbDocVariant = pdfKind ? 'zh' : (view as KbDocVariant);
  const { data, loading, error } = useKbFetch(
    () => fetchDoc(domain, doc, textVariant),
    [domain, doc, textVariant],
  );

  const views: KbReaderView[] = data
    ? [
        ...data.variants,
        ...PDF_VIEWS.filter((p) => data.pdfs.includes(p.kind)).map(
          (p) => p.view,
        ),
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
          {pdfKind ? (
            <PdfViewer
              url={`/api/kb/file?domain=${encodeURIComponent(
                domain,
              )}&slug=${encodeURIComponent(doc)}&file=${pdfKind}`}
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
