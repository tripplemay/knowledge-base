'use client';
// 任务详情 —— Stage 时间线 + 块进度（模板 Progress）+ SSE 实时事件 + 取消/重试
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import Progress from 'components/progress';
import JobStatusBadge from 'components/admin/kb/jobs/JobStatusBadge';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { cancelJob, fetchJob, jobEventsUrl, retryJob } from 'lib/kb/ingest';
import type { KbJobDetail } from 'types/ingest';

const STAGE_LABELS: Record<string, string> = {
  parse: '解析分块',
  glossary: '术语表与摘要',
  translate: '分块翻译',
  assemble: '拼装入库',
  layout: '保版式 PDF',
};

const STAGE_ORDER = ['parse', 'glossary', 'translate', 'assemble', 'layout'];

function duration(s: {
  started_at: number | null;
  finished_at: number | null;
}): string {
  if (!s.started_at) return '';
  const end = s.finished_at ?? Date.now() / 1000;
  return `${Math.round(end - s.started_at)}s`;
}

const JobDetailPage = () => {
  const params = useParams<{ job: string }>();
  const jobId = params?.job ?? '';
  const [job, setJob] = useState<KbJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translateTotal, setTranslateTotal] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const reload = useCallback(() => {
    fetchJob(jobId)
      .then((data) => {
        setJob(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    reload();
    const es = new EventSource(jobEventsUrl(jobId));
    esRef.current = es;
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (event.type === 'progress' && event.stage === 'translate') {
          setTranslateTotal(event.total ?? 0);
        }
        // stage 边界与 chunk 完成时刷新详情
        if (
          ['stage_start', 'stage_done', 'chunk_done', 'error'].includes(
            event.type,
          )
        ) {
          reload();
        }
      } catch {
        /* 忽略非 JSON 心跳 */
      }
    };
    es.addEventListener('end', () => {
      es.close();
      reload();
    });
    es.onerror = () => {
      /* EventSource 自动重连（Last-Event-ID 补发） */
    };
    return () => es.close();
  }, [jobId, reload]);

  const act = async (fn: (id: string) => Promise<unknown>) => {
    try {
      await fn(jobId);
      reload();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (error && !job) return <KbError message={error} />;
  if (!job) return <KbLoading />;

  const doneChunks = job.chunks.filter((c) => c.status === 'done').length;
  const totalChunks = Math.max(translateTotal, job.chunks.length);
  const stages = STAGE_ORDER.map(
    (name) =>
      job.stages.find((s) => s.name === name) ?? {
        name,
        status: 'pending' as const,
        detail: null,
        started_at: null,
        finished_at: null,
      },
  );

  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-11">
      <div className="lg:col-span-7">
        <Card extra="w-full !p-6">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="text-lg font-bold text-navy-700 dark:text-white">
                {job.filename}
              </h5>
              <p className="text-sm font-medium text-gray-600">
                {job.domain} · {job.slug}
              </p>
            </div>
            <JobStatusBadge status={job.status} />
          </div>

          <div className="mt-6">
            {stages.map((stage) => (
              <div
                key={stage.name}
                className="mt-2 flex items-center justify-between px-1 py-2"
              >
                <div className="flex items-center gap-3">
                  <JobStatusBadge status={stage.status} />
                  <p className="text-base font-bold text-navy-700 dark:text-white">
                    {STAGE_LABELS[stage.name] ?? stage.name}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {stage.name === 'translate' && totalChunks > 0 ? (
                    <>
                      <Progress
                        value={(doneChunks / totalChunks) * 100}
                        width="w-[108px]"
                      />
                      <p className="text-sm font-medium text-gray-600">
                        {doneChunks}/{totalChunks} 块
                      </p>
                    </>
                  ) : null}
                  <p className="text-sm font-medium text-gray-600">
                    {duration(stage)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {job.error ? (
            <p className="mt-4 rounded-xl bg-red-100 p-3 text-sm font-medium text-red-500 dark:bg-red-50">
              {job.error}
            </p>
          ) : null}

          <div className="mt-5 flex gap-3">
            {['queued', 'running'].includes(job.status) ? (
              <button
                onClick={() => act(cancelJob)}
                className="linear rounded-lg bg-red-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-red-600 active:bg-red-700"
              >
                取消任务
              </button>
            ) : null}
            {['failed', 'canceled'].includes(job.status) ? (
              <button
                onClick={() => act(retryJob)}
                className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
              >
                重试（续传）
              </button>
            ) : null}
            {job.status === 'done' ? (
              <NavLink
                href={`/admin/kb/${job.domain}`}
                className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
              >
                查看文档
              </NavLink>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-4">
        <Card extra="w-full !p-5">
          <h5 className="text-lg font-bold text-navy-700 dark:text-white">
            任务信息
          </h5>
          <div className="mt-2 flex items-center justify-between px-1 py-2">
            <p className="text-sm font-medium text-gray-600">累计成本</p>
            <p className="text-sm font-bold text-navy-700 dark:text-white">
              ${(job.cost_usd ?? 0).toFixed(4)}
            </p>
          </div>
          <div className="flex items-center justify-between px-1 py-2">
            <p className="text-sm font-medium text-gray-600">任务 ID</p>
            <p className="text-xs font-bold text-navy-700 dark:text-white">
              {job.id}
            </p>
          </div>
          {job.chunks.length > 0 ? (
            <>
              <h5 className="mt-4 text-lg font-bold text-navy-700 dark:text-white">
                分块用量
              </h5>
              {job.chunks.map((c) => (
                <div
                  key={c.idx}
                  className="mt-1 flex items-center justify-between px-1 py-1"
                >
                  <p className="text-sm font-medium text-gray-600">
                    块 {String(c.idx).padStart(4, '0')}
                  </p>
                  <p className="text-sm font-medium text-gray-600">
                    {c.input_tokens}→{c.output_tokens} tok
                  </p>
                </div>
              ))}
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
};

export default JobDetailPage;
