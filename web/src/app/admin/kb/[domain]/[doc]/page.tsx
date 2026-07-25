'use client';
// 文档阅读器 —— 模板 course-page 双栏布局
// 视图：对照阅读（原版 PDF + 按页中文，零版式失真）/ 文本三档 / PDF 三档
// 取数拆两条：骨架（meta，切视图不重拉）+ 正文（仅文本视图才拉）
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from 'components/card';
import DocMetaPanel from 'components/admin/kb/reader/DocMetaPanel';
import LangTabs from 'components/admin/kb/reader/LangTabs';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import PdfViewer from 'components/admin/kb/reader/PdfViewer';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDoc, fetchDocMeta, fetchPages } from 'lib/kb/client';
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

  // ① 骨架：deps 不含 view → 切 tab 永不 refetch，LangTabs 永不消失
  const {
    data: docMeta,
    loading: metaLoading,
    error: metaError,
  } = useKbFetch(() => fetchDocMeta(domain, doc), [domain, doc]);

  // ② 正文：只有文本视图才发请求（PDF / 对照阅读的正文来自别处，拉整篇是白拉）
  const textVariant: KbDocVariant | null =
    pdfKind || isCompare ? null : (view as KbDocVariant);
  const textState = useKbFetch(
    () =>
      textVariant ? fetchDoc(domain, doc, textVariant) : Promise.resolve(null),
    [domain, doc, textVariant],
    { keepPreviousData: true },
  );

  const pagesState = useKbFetch(
    () => (isCompare ? fetchPages(domain, doc) : Promise.resolve(null)),
    [domain, doc, isCompare],
  );

  const views: KbReaderView[] = docMeta
    ? [
        ...(docMeta.hasPages && docMeta.pdfs.includes('source')
          ? (['compare'] as KbReaderView[])
          : []),
        ...docMeta.variants,
        ...PDF_VIEWS.filter((p) => docMeta.pdfs.includes(p.kind)).map(
          (p) => p.view,
        ),
      ]
    : [];

  const fileUrl = (kind: KbPdfKind) =>
    `/api/kb/file?domain=${encodeURIComponent(
      domain,
    )}&slug=${encodeURIComponent(doc)}&file=${kind}`;

  if (metaError) return <KbError message={metaError} />;

  // 对照阅读：左原版 PDF（零失真）+ 右按页中文，翻页联动
  if (isCompare) {
    const pageZh =
      pagesState.data?.find((p) => p.page === currentPage)?.zh ?? '';
    return (
      <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card extra="w-full !p-4">
            {docMeta ? (
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
          {docMeta ? (
            <LangTabs views={views} active={view} onChange={setView} />
          ) : null}
          {/* error 先于 data 判定：keepPreviousData 在失败时会保留上一档正文，
              若先判 data，切档失败会静默显示上一档内容而 LangTabs 高亮已在新档；
              data 先于 loading 判定，否则 keepPreviousData 的收益会被加载态吃掉 */}
          {pdfKind ? (
            <PdfViewer url={fileUrl(pdfKind)} />
          ) : textState.error ? (
            <p className="py-10 text-center text-sm font-bold text-red-500">
              正文加载失败：{textState.error}
            </p>
          ) : textState.data ? (
            <MarkdownReader markdown={textState.data.markdown} />
          ) : (
            <p className="py-10 text-center text-sm font-medium text-gray-600">
              加载中…
            </p>
          )}
        </Card>
      </div>
      <div className="lg:col-span-4">
        {metaLoading && !docMeta ? <KbLoading /> : null}
        {docMeta ? <DocMetaPanel meta={docMeta.meta} /> : null}
      </div>
    </div>
  );
};

export default DocReaderPage;
