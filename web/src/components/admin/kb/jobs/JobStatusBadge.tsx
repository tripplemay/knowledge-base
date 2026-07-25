// 任务状态徽标 —— 沿用模板 order-list 的状态胶囊写法
import type { KbJobStatus, KbStageStatus } from 'types/ingest';

// 暗色底色的取值规则（改前请先看 tailwind.config.js 的实际色值）：
// 模板只给 red.50 (#ee5d501a) 与 green.50 (#05cd991a) 配了半透明值，是专为暗色设计的；
// 而 gray.50 / blue.50 / orange.50 / teal.50 都是近白实色，直接 dark: 上去会在 navy-800 卡片上糊出亮白块。
// 因此 done / failed 保持模板原生的 x-50，其余状态改用半透明蒙版：
// 中性状态用模板惯例 white/10，有色状态用 x-500/20，均已按 WCAG 实算过 4.5:1 以上。
const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  queued: {
    bg: 'bg-gray-100 dark:bg-white/10',
    text: 'text-gray-700 dark:text-white',
    label: '排队中',
  },
  running: {
    bg: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-500 dark:text-blue-400',
    label: '处理中',
  },
  done: {
    bg: 'bg-green-100 dark:bg-green-50',
    text: 'text-green-500',
    label: '完成',
  },
  failed: {
    bg: 'bg-red-100 dark:bg-red-50',
    text: 'text-red-500',
    label: '失败',
  },
  canceled: {
    bg: 'bg-orange-100 dark:bg-orange-500/20',
    text: 'text-orange-500',
    label: '已取消',
  },
  pending: {
    bg: 'bg-gray-100 dark:bg-white/10',
    text: 'text-gray-700 dark:text-white',
    label: '待执行',
  },
  skipped: {
    bg: 'bg-teal-100 dark:bg-teal-500/20',
    text: 'text-teal-500',
    label: '跳过',
  },
};

function JobStatusBadge(props: { status: KbJobStatus | KbStageStatus }) {
  const style = STYLES[props.status] ?? STYLES.pending;
  return (
    <div
      className={`flex h-7 w-[90px] items-center justify-center rounded-[10px] text-sm font-bold ${style.bg}`}
    >
      <div className={style.text}>{style.label}</div>
    </div>
  );
}

export default JobStatusBadge;
