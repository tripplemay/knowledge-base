"""知识库摄取流水线（stage 链架构，设计方案 v0.3）。

Stage 契约：
- 每个 stage 是 run(ctx: JobContext, emit: Emitter) -> None
- 产物驱动的幂等续传：stage 依据 job 目录内已有产物决定跳过/续跑
- 进度经 emit() 以 JSON 事件行输出，CLI 与服务端消费同一事件流
- 可用 `python -m pipeline.run --job-dir <dir> [--stage <name>]` 独立调用任意阶段
"""

PIPELINE_VERSION = "0.3"
