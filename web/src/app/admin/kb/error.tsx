'use client';
// KB 子树的错误边界 —— 接管子树渲染抛出的异常（与页面内 if (error) 的数据错误互不冲突）
// 签名由 Next 固定为 { error, reset }
import { KbError } from 'components/admin/kb/KbState';

// 不叫 Error，避免遮蔽全局 Error 类型
export default function KbRouteError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { error, reset } = props;
  return (
    <div className="mt-3 flex w-full flex-col items-center gap-4">
      <KbError message={error.message || '页面加载失败'} />
      <button
        type="button"
        onClick={reset}
        className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
      >
        重试
      </button>
    </div>
  );
}
