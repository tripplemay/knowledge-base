'use client';
// 演化裁决台 —— INVALIDATE 仲裁项的人工批准/驳回（失效不删除，批准才生效）
import { useCallback, useEffect, useState } from 'react';
import Card from 'components/card';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { INGEST_BASE } from 'lib/kb/ingest';

interface ReviewItem {
  id: string;
  status: string;
  domain: string;
  created: string;
  old_claim: string;
  old_statement: string;
  new_claim: string;
  new_statement: string;
  rationale: string;
}

const ReviewPage = () => {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${INGEST_BASE}/api/v1/review?status=all`)
      .then((r) => r.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? '加载失败');
        setItems(body.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const res = await fetch(`${INGEST_BASE}/api/v1/review/${id}/${action}`, {
        method: 'POST',
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? body.detail ?? '操作失败');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (error && !items) return <KbError message={error} />;
  if (!items) return <KbLoading />;
  const pending = items.filter((i) => i.status === 'pending');
  const decided = items.filter((i) => i.status !== 'pending');

  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <h5 className="text-lg font-bold text-navy-700 dark:text-white">
          待裁决（{pending.length}）
        </h5>
        <p className="mt-1 text-sm font-medium text-gray-600">
          新知识与既有断言矛盾时进入此队列；批准后旧断言标记失效（保留历史，不删除）
        </p>
        {pending.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-gray-600">暂无待裁决项</p>
        ) : null}
        {pending.map((item) => (
          <div key={item.id} className="mt-4 rounded-xl border border-gray-200 p-4 dark:!border-white/10">
            <p className="text-xs font-medium text-gray-600">
              {item.domain} · {item.created} · {item.id}
            </p>
            <div className="mt-2 rounded-xl bg-red-100 p-3 dark:bg-red-50">
              <p className="text-xs font-bold text-red-500">既有断言（拟失效）{item.old_claim}</p>
              <p className="mt-1 text-sm font-medium text-navy-700">{item.old_statement}</p>
            </div>
            <div className="mt-2 rounded-xl bg-green-100 p-3 dark:bg-green-50">
              <p className="text-xs font-bold text-green-600">新断言 {item.new_claim}</p>
              <p className="mt-1 text-sm font-medium text-navy-700">{item.new_statement}</p>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-600">仲裁理由：{item.rationale}</p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => act(item.id, 'approve')}
                disabled={busy === item.id}
                className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 dark:bg-brand-400 dark:text-white"
              >
                批准失效
              </button>
              <button
                onClick={() => act(item.id, 'reject')}
                disabled={busy === item.id}
                className="linear rounded-lg border border-gray-400 bg-[transparent] px-3 py-2.5 text-sm font-medium text-navy-700 transition duration-200 dark:border-white dark:text-white"
              >
                驳回（两者共存）
              </button>
            </div>
          </div>
        ))}
      </Card>
      {decided.length > 0 ? (
        <Card extra="w-full mt-3 !p-6">
          <h5 className="text-lg font-bold text-navy-700 dark:text-white">
            已裁决（{decided.length}）
          </h5>
          {decided.map((item) => (
            <div key={item.id} className="mt-2 flex items-center justify-between px-1 py-2">
              <p className="text-sm font-medium text-gray-600">
                {item.old_claim} → {item.new_claim}
              </p>
              <p className={`text-sm font-bold ${item.status === 'approved' ? 'text-green-500' : 'text-orange-500'}`}>
                {item.status === 'approved' ? '已批准' : '已驳回'}
              </p>
            </div>
          ))}
        </Card>
      ) : null}
      {error ? <KbError message={error} /> : null}
    </div>
  );
};

export default ReviewPage;
