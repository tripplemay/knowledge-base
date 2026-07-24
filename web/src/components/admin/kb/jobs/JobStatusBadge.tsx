// 任务状态徽标 —— 沿用模板 order-list 的状态胶囊写法
import type { KbJobStatus, KbStageStatus } from 'types/ingest';

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  queued: { bg: 'bg-gray-100 dark:bg-gray-50', text: 'text-gray-700', label: '排队中' },
  running: { bg: 'bg-blue-100 dark:bg-blue-50', text: 'text-blue-500', label: '处理中' },
  done: { bg: 'bg-green-100 dark:bg-green-50', text: 'text-green-500', label: '完成' },
  failed: { bg: 'bg-red-100 dark:bg-red-50', text: 'text-red-500', label: '失败' },
  canceled: { bg: 'bg-orange-100 dark:bg-orange-50', text: 'text-orange-500', label: '已取消' },
  pending: { bg: 'bg-gray-100 dark:bg-gray-50', text: 'text-gray-700', label: '待执行' },
  skipped: { bg: 'bg-teal-100 dark:bg-teal-50', text: 'text-teal-500', label: '跳过' },
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
