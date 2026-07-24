'use client';
// 文档阅读器 —— 模板 course-page 双栏布局
// 视图：对照阅读（原版 PDF + 按页中文，零版式失真）/ 文本三档 / PDF 三档
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from 'components/card';
import DocMetaPanel from 'components/admin/kb/reader/DocMetaPanel';
import LangTabs from 'components/admin/kb/reader/LangTabs';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import PdfViewer from 'components/admin/kb/reader/PdfViewer';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDoc, fetchPages } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';
import type { KbDocVariant, KbPdfKind, KbReaderView } from 'types/kb';

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
  const [currentPage, setCurrentPage] = useState(1);

  const pdfKind = PDF_VIEW_TO_KIND[view];
  const isCompare = view === 'compare';
  const textVariant: KbDocVariant =
    pdfKind || isCompare ? 'zh' : (view as KbDocVariant);
  const { data, loading, error } = useKbFetch(
    () => fetchDoc(domain, doc, textVariant),
    [domain, doc, textVariant],
  );
  const pagesState = useKbFetch(
    () => (isCompare ? fetchPages(domain, doc) : Promise.resolve(null)),
    [domain, doc, isCompare],
  );

  const views: KbReaderView[] = data
    ? [
        ...(data.hasPages && data.pdfs.includes('source')
          ? (['compare'] as KbReaderView[])
          : []),
        ...data.variants,
        ...PDF_VIEWS.filter((p) => data.pdfs.includes(p.kind)).map(
          (p) => p.view,
        ),
      ]
    : [];

  const fileUrl = (kind: KbPdfKind) =>
    `/api/kb/file?domain=${encodeURIComponent(domain)}&slug=${encodeURIComponent(
      doc,
    )}&file=${kind}`;

  if (error) return <KbError message={error} />;

  // 对照阅读：左原版 PDF（零失真）+ 右按页中文，翻页联动
  if (isCompare) {
    const pageZh =
      pagesState.data?.find((p) => p.page === currentPage)?.zh ?? '';
    return (
      <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card extra="w-full !p-4">
            {data ? (
              <LangTabs views={views} active={view} onChange={setView} />
            ) : null}
            <PdfViewer url={fileUrl('source')} onPageChange={setCurrentPage} />
          </Card>
        </div>
        <div className="lg:col-span-5">
          <Card extra="w-full !p-5 sticky top-3">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-lg font-bold text-navy-700 dark:text-white">
                第 {currentPage} 页 · 中文
              </h5>
            </div>
            <div className="h-[76vh] overflow-auto pr-1">
              {pagesState.loading ? (
                <p className="text-sm font-medium text-gray-600">加载中…</p>
              ) : pageZh ? (
                <MarkdownReader markdown={pageZh} />
              ) : (
                <p className="text-sm font-medium text-gray-600">
                  本页无正文（图形/空白页）
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-11">
      <div className="lg:col-span-7">
        <Card extra="w-full !p-6">
          {data ? (
            <LangTabs views={views} active={view} onChange={setView} />
          ) : null}
          {pdfKind ? (
            <PdfViewer url={fileUrl(pdfKind)} />
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
