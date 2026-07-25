// 加载中 / 错误 / 空态 的统一展示（基于模板 Card），所有 KB 页面共用
import type { ReactNode } from 'react';
import Card from 'components/card';

export function KbLoading() {
  return (
    <Card extra="w-full mt-3 flex items-center justify-center !p-10">
      <p className="text-sm font-medium text-gray-600">加载中…</p>
    </Card>
  );
}

export function KbError(props: { message: string }) {
  const { message } = props;
  return (
    <Card extra="w-full mt-3 flex items-center justify-center !p-10">
      <p className="text-sm font-bold text-red-500">{message}</p>
    </Card>
  );
}

export function KbEmpty(props: {
  message: string;
  hint?: string;
  action?: ReactNode;
  /** true = 不套 Card，供表格 <td> 内联使用 */
  inline?: boolean;
}) {
  const { message, hint, action, inline } = props;
  const body = (
    <>
      <p className="text-base font-bold text-navy-700 dark:text-white">
        {message}
      </p>
      {hint ? (
        <p className="mt-1 text-sm font-medium text-gray-600">{hint}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </>
  );
  // 表格里已经有 Card 外壳，再套一层会出现卡中卡
  if (inline) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        {body}
      </div>
    );
  }
  return (
    <Card extra="w-full mt-3 flex flex-col items-center justify-center !p-10 text-center">
      {body}
    </Card>
  );
}
