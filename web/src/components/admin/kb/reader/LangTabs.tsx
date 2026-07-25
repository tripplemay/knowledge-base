// 阅读视图切换 —— 逐类复刻模板 course-page CourseInfo 的 tab 实现
// （非激活项用同宽白色底边占位，避免切换时内容跳动；激活项 brand 底边）
// 相对模板 CourseInfo 的唯一偏离：div→button 以支持键盘（类名一字未改，视觉零变化）
import type { KbReaderView } from 'types/kb';

const LABELS: Record<KbReaderView, string> = {
  compare: '对照阅读',
  zh: '中文全文',
  bilingual: '双语对照',
  en: '英文提取文本',
  zhpdf: '中文 PDF',
  dualpdf: '双语 PDF',
  pdf: 'PDF 原件',
};

function LangTabs(props: {
  views: KbReaderView[];
  active: KbReaderView;
  onChange: (v: KbReaderView) => void;
}) {
  const { views, active, onChange } = props;
  return (
    <div className="mb-4 flex w-full items-center gap-8" role="tablist">
      {views.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={active === v}
          className={
            active === v
              ? 'flex items-center gap-3 border-b-[4px] border-brand-500 pb-3 hover:cursor-pointer dark:border-brand-400'
              : 'flex items-center gap-3 border-b-[4px] border-white pb-3 hover:cursor-pointer dark:!border-navy-800'
          }
          onClick={() => onChange(v)}
        >
          <p className="text-[18px] font-medium text-navy-700 dark:text-white">
            {LABELS[v]}
          </p>
        </button>
      ))}
    </div>
  );
}

export default LangTabs;
