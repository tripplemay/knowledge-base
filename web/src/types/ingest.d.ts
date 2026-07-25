// 摄取服务（FastAPI :8794）类型

export type KbJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type KbStageStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped';
/** 任务类型：摄取 | 知识蒸馏（_kb/server/db.py 的 jobs.kind，缺省 ingest） */
export type KbJobKind = 'ingest' | 'distill';

export interface KbJobSummary {
  id: string;
  domain: string;
  slug: string;
  filename: string;
  status: KbJobStatus;
  error: string | null;
  /** jobs.cost_usd 建表时未加 NOT NULL（REAL DEFAULT 0），消费端保留 ?? 0 兜底 */
  cost_usd: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  kind: KbJobKind;
}

export interface KbJobStage {
  name: string;
  status: KbStageStatus;
  /** stage_done 的 JSON 载荷；error 事件写入的是纯文本原因，故解析需容错 */
  detail: string | null;
  started_at: number | null;
  finished_at: number | null;
}

export interface KbJobChunk {
  idx: number;
  status: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
}

export interface KbJobDetail extends KbJobSummary {
  stages: KbJobStage[];
  chunks: KbJobChunk[];
}

/** classify 阶段 stage_done 的 detail 载荷（_kb/pipeline/stages/classify.py） */
export interface KbClassifyDetail {
  domain: string;
  /** match | create | fallback */
  action?: string;
  created?: boolean;
  confidence?: number;
  needs_review?: boolean;
  /** 续跑定案或用户已指定域时为 true */
  skipped?: boolean;
  note?: string;
}

/** 事件公共字段：ts 由流水线 Emitter 补齐，蒸馏 Job 由 worker 直写 DB，无 ts */
interface KbEventBase {
  ts?: number;
  stage: string;
}

/**
 * SSE 事件（GET /api/v1/jobs/{id}/events 的 message 帧），逐条对齐
 * _kb/pipeline/events.py 的 Emitter 与 _kb/server/tasks.py 的 emit。
 * 注：终止帧是 SSE 具名事件 end（data 为 {status}），不在此判别联合内。
 */
export type KbIngestEvent =
  | (KbEventBase & {
      type: 'stage_start';
      /** parse 带 file；translate 带 total 与 resumed_from */
      file?: string;
      total?: number;
      resumed_from?: number;
    })
  // stage_done 的其余字段随阶段而异，落库后即 KbJobStage.detail（classify 见 KbClassifyDetail）
  | (KbEventBase & { type: 'stage_done'; skipped?: boolean })
  | (KbEventBase & {
      type: 'progress';
      current: number;
      total: number;
      /** 蒸馏 Job 的 progress 不带 msg */
      msg?: string;
    })
  | (KbEventBase & {
      type: 'chunk_done';
      idx: number;
      model: string;
      input: number;
      output: number;
    })
  | (KbEventBase & {
      type: 'usage';
      model: string;
      input: number;
      output: number;
    })
  | (KbEventBase & { type: 'warn'; msg: string })
  | (KbEventBase & { type: 'error'; msg: string })
  | (KbEventBase & {
      type: 'domain_resolved';
      domain: string;
      action?: string;
      created?: boolean;
      confidence?: number;
      reason?: string;
      needs_review?: boolean;
    })
  | (KbEventBase & {
      type: 'domain_created';
      domain: string;
      name: string;
      description: string;
    });
