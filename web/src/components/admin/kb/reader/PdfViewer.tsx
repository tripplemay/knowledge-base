'use client';
// 虚拟化 PDF 阅读器 —— react-pdf(PDF.js)，只渲染视口附近页面，重图形 PDF 不再卡顿
// 工具栏样式沿用模板按钮目录小尺寸变体与 lightPrimary 底色
import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { MdAdd, MdRemove, MdOpenInNew } from 'react-icons/md';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const OVERSCAN = 2; // 视口外预渲染页数
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2];

function PdfViewer(props: {
  url: string;
  onPageChange?: (page: number) => void;
}) {
  const { url, onPageChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(1.414); // 高/宽，默认 A4
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [visible, setVisible] = useState<Set<number>>(new Set([1, 2]));

  const pageWidth = Math.max(containerWidth * ZOOM_STEPS[zoomIdx] - 16, 200);
  const pageHeight = pageWidth * aspect;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // url 变化即重置文档级 state（保留用户手调的 zoomIdx 与已测量的 containerWidth）
  useEffect(() => {
    setNumPages(0);
    setAspect(1.414);
    setVisible(new Set([1, 2]));
  }, [url]);

  // IntersectionObserver 维护可视页集合（±OVERSCAN 页）
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !numPages) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) {
              for (let p = page - OVERSCAN; p <= page + OVERSCAN; p++) {
                if (p >= 1 && p <= numPages) next.add(p);
              }
            } else {
              next.delete(page);
            }
          }
          return next;
        });
      },
      { root: el, rootMargin: '100% 0px' },
    );
    el.querySelectorAll('[data-page]').forEach((node) => io.observe(node));

    // 当前页跟踪：页面穿越容器中线时上报（对照阅读联动）
    const centerIo = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && onPageChange) {
            onPageChange(Number((entry.target as HTMLElement).dataset.page));
          }
        }
      },
      { root: el, rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-page]').forEach((node) =>
      centerIo.observe(node),
    );
    return () => {
      io.disconnect();
      centerIo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, pageHeight]);

  // 现有语料实测全部为 Identity-H 编码（pdf.js worker 内置短路，不需要外部 CMaps），故未配置 cMapUrl。
  // 若将来接收老旧/Distiller 产出的中文 PDF（Adobe-GB1 等预定义 CMap），需补 public/pdfjs/{cmaps,standard_fonts}
  // 并配 cMapUrl/cMapPacked/standardFontDataUrl，否则该字体所有字形不渲染（页面不崩，静默掉字）。
  const options = useMemo(() => ({ cMapUrl: undefined }), []);

  return (
    <div className="w-full">
      {/* 工具栏 */}
      <div className="mb-3 flex items-center justify-between rounded-xl bg-lightPrimary px-4 py-2 dark:!bg-navy-900">
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          {numPages ? `共 ${numPages} 页` : '加载中…'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))}
            disabled={zoomIdx === 0}
            className="linear flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            <MdRemove />
          </button>
          <p className="w-12 text-center text-sm font-bold text-navy-700 dark:text-white">
            {Math.round(ZOOM_STEPS[zoomIdx] * 100)}%
          </p>
          <button
            onClick={() =>
              setZoomIdx(Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1))
            }
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
            className="linear flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            <MdAdd />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="linear ml-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
            title="新标签打开"
          >
            <MdOpenInNew />
          </a>
        </div>
      </div>

      {/* 滚动容器：占位 div 固定高度，仅可视集内渲染真实 Page */}
      <div
        ref={containerRef}
        className="h-[80vh] w-full overflow-auto rounded-[20px] bg-gray-100 p-2 dark:!bg-navy-900"
      >
        <Document
          file={url}
          options={options}
          onLoadSuccess={async (doc) => {
            setNumPages(doc.numPages);
            const page = await doc.getPage(1);
            const [, , w, h] = page.view;
            setAspect(h / w);
          }}
          loading={
            <p className="py-10 text-center text-sm font-medium text-gray-600">
              解析 PDF …
            </p>
          }
          error={
            <p className="py-10 text-center text-sm font-bold text-red-500">
              PDF 加载失败
            </p>
          }
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => (
            <div
              key={pageNo}
              data-page={pageNo}
              style={{ height: pageHeight }}
              className="mx-auto mb-2 flex items-start justify-center"
            >
              {visible.has(pageNo) ? (
                <Page
                  pageNumber={pageNo}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  loading={
                    <div style={{ height: pageHeight, width: pageWidth }} />
                  }
                />
              ) : null}
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PdfViewer;
