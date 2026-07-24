// 摄取服务（FastAPI :8794）类型

export type KbJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type KbStageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface KbJobSummary {
  id: string;
  domain: string;
  slug: string;
  filename: string;
  status: KbJobStatus;
  error: string | null;
  cost_usd: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface KbJobStage {
  name: string;
  status: KbStageStatus;
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

export interface KbIngestEvent {
  ts: number;
  stage: string;
  type: string;
  [key: string]: unknown;
}
