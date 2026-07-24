// 阅读语言切换 —— 逐类复刻模板 course-page CourseInfo 的 tab 实现
// （非激活项用同宽白色底边占位，避免切换时内容跳动；激活项 brand 底边）
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
    <div className="mb-4 flex w-full items-center gap-8">
      {variants.map((v) => (
        <div
          key={v}
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
        </div>
      ))}
    </div>
  );
}

export default LangTabs;
