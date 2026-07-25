'use client';
// 任务详情 —— Stage 时间线 + 块进度（模板 Progress）+ SSE 实时事件 + 取消/重试
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import Progress from 'components/progress';
import JobStatusBadge from 'components/admin/kb/jobs/JobStatusBadge';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import {
  cancelJob,
  domainLabel,
  fetchJob,
  jobEventsUrl,
  retryJob,
} from 'lib/kb/ingest';
import type { KbJobDetail, KbJobStage } from 'types/ingest';

const STAGE_LABELS: Record<string, string> = {
  parse: '解析分块',
  glossary: '术语表与摘要',
  classify: '知识域判定',
  translate: '分块翻译',
  assemble: '拼装入库',
  layout: '保版式 PDF',
};

const STAGE_ORDER = [
  'parse',
  'glossary',
  'classify',
  'translate',
  'assemble',
  'layout',
];

/** chunk_done 高频事件的刷新节流间隔 */
const RELOAD_THROTTLE_MS = 2000;

/** stage_done 载荷（classify 用于展示判定理由） */
function stageDetail(stage: Pick<KbJobStage, 'detail'>): any {
  try {
    return stage.detail ? JSON.parse(stage.detail) : null;
  } catch {
    return null;
  }
}

/** 知识域判定小结：新建域 / 兜底待复核 / 置信度 */
function classifyNote(detail: any): string | null {
  if (!detail) return null;
  if (detail.note) return detail.note;
  if (detail.skipped) return `已定案：${detail.domain}`;
  const bits = [`归入 ${detail.domain}`];
  if (detail.created) bits.push('新建域');
  if (typeof detail.confidence === 'number')
    bits.push(`置信度 ${detail.confidence}`);
  if (detail.needs_review) bits.push('建议人工复核');
  return bits.join(' · ');
}

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
  const [translateDone, setTranslateDone] = useState(0);
  /** 上一次 reload 的「发起时刻」，节流基线 */
  const lastReload = useRef(0);
  /** 请求序号：只接受最新一次请求的结果，防止慢响应把旧快照写回 */
  const reqSeq = useRef(0);
  /** 当前任务 id：取消/重试的回调会捕获旧 jobId 的 reload，跨任务导航后必须作废 */
  const activeJobId = useRef(jobId);

  const reload = useCallback(() => {
    // 基线统一取发起时刻（写在 .then 里会让实际窗口变成 2s + 一次 RTT）
    lastReload.current = Date.now();
    const seq = ++reqSeq.current;
    const id = jobId;
    const accept = () => seq === reqSeq.current && id === activeJobId.current;
    fetchJob(id)
      .then((data) => {
        if (!accept()) return;
        setJob(data);
        setError(null);
      })
      .catch((err: Error) => {
        if (!accept()) return;
        setError(err.message);
      });
  }, [jobId]);

  /** 分块完成事件每块一发，节流后再拉详情，避免逐块全量刷新 */
  const reloadThrottled = useCallback(() => {
    if (Date.now() - lastReload.current < RELOAD_THROTTLE_MS) return;
    reload();
  }, [reload]);

  useEffect(() => {
    if (!jobId) return;
    activeJobId.current = jobId;
    // 切任务时清掉上一个任务残留的块计数与节流基线
    setTranslateTotal(0);
    setTranslateDone(0);
    lastReload.current = 0;
    // 这一发 reload 会按新任务的发起时刻重新落基线，
    // 且序号自增使上一个任务的在途请求作废
    reload();
    const es = new EventSource(jobEventsUrl(jobId));
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (event.type === 'progress' && event.stage === 'translate') {
          setTranslateTotal(event.total ?? 0);
          setTranslateDone(event.current ?? 0);
        }
        // stage 边界与出错时刷新详情（classify 的判定理由只在 stage_done 落库）
        if (['stage_start', 'stage_done', 'error'].includes(event.type)) {
          reload();
        }
        // 分块完成走节流，「分块用量」保持准实时即可
        if (event.type === 'chunk_done') {
          reloadThrottled();
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
  }, [jobId, reload, reloadThrottled]);

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

  // 中途进入页面时已错过 progress 事件，用 chunks 落库数兜底
  const doneChunks = Math.max(
    translateDone,
    job.chunks.filter((c) => c.status === 'done').length,
  );
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
                {domainLabel(job.domain)} · {job.slug}
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
                  <div>
                    <p className="text-base font-bold text-navy-700 dark:text-white">
                      {STAGE_LABELS[stage.name] ?? stage.name}
                    </p>
                    {stage.name === 'classify' ? (
                      <p className="text-xs font-medium text-gray-600">
                        {classifyNote(stageDetail(stage)) ?? ''}
                      </p>
                    ) : null}
                  </div>
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
                className="linear rounded-lg bg-red-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-red-600 active:bg-red-700 dark:bg-red-400 dark:text-white dark:hover:bg-red-300 dark:active:bg-red-200"
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
                borderRadius="8px"
                className="linear bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
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
