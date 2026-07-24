// 阅读语言切换 —— 沿用模板 course-page CourseInfo 的 tab 样式（底部高亮条）
import type { KbDocVariant } from 'types/kb';

const LABELS: Record<KbDocVariant, string> = {
  zh: '中文全文',
  bilingual: '双语对照',
  en: '英文原文',
};

function LangTabs(props: {
  variants: KbDocVariant[];
  active: KbDocVariant;
  onChange: (v: KbDocVariant) => void;
}) {
  const { variants, active, onChange } = props;
  return (
    <div className="mb-2 flex w-full items-center gap-6 border-b border-gray-200 dark:border-white/10">
      {variants.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`pb-3 text-sm font-bold transition duration-200 ${
            active === v
              ? 'border-b-[4px] border-brand-500 text-navy-700 dark:border-brand-400 dark:text-white'
              : 'text-gray-600 hover:text-navy-700 dark:hover:text-white'
          }`}
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}

export default LangTabs;
