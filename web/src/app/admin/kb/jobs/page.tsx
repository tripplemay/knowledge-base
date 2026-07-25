'use client';
// 任务中心 —— 摄取任务列表（上一次请求完成后 5 秒再刷新，标签页隐藏时暂停）
import { useEffect, useState } from 'react';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import JobStatusBadge from 'components/admin/kb/jobs/JobStatusBadge';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { domainLabel, fetchJobs } from 'lib/kb/ingest';
import type { KbJobSummary } from 'types/ingest';

const REFRESH_MS = 5000;

function fmtTime(ts: number | null): string {
  return ts
    ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
    : '—';
}

const JobsPage = () => {
  const [jobs, setJobs] = useState<KbJobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;

    // 上一次请求结束后再排下一次，避免慢响应时请求堆叠
    // 排期前先清掉旧定时器，保证任意时刻只有一条定时器链（不会被切标签页拆成多条）
    const schedule = () => {
      clearTimeout(timer);
      if (!cancelled) timer = setTimeout(() => load(), REFRESH_MS);
    };

    // first=true 表示挂载后的首次加载：后台标签页也要拿到数据，不能停在「加载中…」
    const load = async (first = false) => {
      if (cancelled) return;
      // 在途请求未完成、或标签页不可见时跳过本轮（首次加载除外），只重新排期
      if (inFlight || (document.hidden && !first)) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        const data = await fetchJobs();
        if (!cancelled) {
          setJobs(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        inFlight = false;
        schedule();
      }
    };

    // 标签页切回前台时立刻补发一次
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        load();
      }
    };

    load(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 已有数据时轮询出错只做行内提示，不整页替换
  if (error && jobs === null) return <KbError message={error} />;
  if (jobs === null) return <KbLoading />;
  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <div className="flex items-center justify-between">
          <h5 className="text-lg font-bold text-navy-700 dark:text-white">
            摄取任务（{jobs.length}）
          </h5>
          <NavLink
            href="/admin/kb/upload"
            borderRadius="8px"
            className="linear bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            上传新文档
          </NavLink>
        </div>
        {error ? (
          <p className="mt-2 rounded-xl bg-red-100 px-3 py-2 text-sm font-bold text-red-500 dark:bg-red-50">
            刷新失败：{error}（下方为最近一次成功的数据）
          </p>
        ) : null}
        <div className="mt-4 overflow-x-scroll xl:overflow-x-hidden">
          <table className="w-full">
            <thead>
              <tr className="!border-px !border-gray-400">
                {['文件', '知识域', '状态', '成本', '创建时间', ''].map((h) => (
                  <th
                    key={h}
                    className="border-b border-gray-200 pb-2 pr-4 pt-4 text-start dark:border-white/30"
                  >
                    <p className="text-sm font-bold text-gray-600 dark:text-white">
                      {h}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-gray-200 dark:border-white/30"
                >
                  <td className="min-w-[150px] py-3 pr-4">
                    <NavLink
                      href={`/admin/kb/jobs/${job.id}`}
                      className="font-medium text-navy-700 hover:text-brand-500 dark:text-white dark:hover:text-brand-400"
                    >
                      {job.filename}
                      <p className="text-xs font-normal text-gray-600">
                        {job.slug}
                      </p>
                    </NavLink>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-sm font-bold text-navy-700 dark:text-white">
                      {domainLabel(job.domain)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-sm font-bold text-navy-700 dark:text-white">
                      ${(job.cost_usd ?? 0).toFixed(4)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-sm font-bold text-navy-700 dark:text-white">
                      {fmtTime(job.created_at)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <NavLink
                      href={`/admin/kb/jobs/${job.id}`}
                      className="font-medium text-brand-500 dark:text-brand-400"
                    >
                      详情
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default JobsPage;
