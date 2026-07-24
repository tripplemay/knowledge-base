"""事件发射：stage → JSON 行（机器）或人类可读输出（CLI）。"""
import json
import sys
import time


class Emitter:
    """默认发射器：stdout 输出 JSON 事件行（服务端 worker 消费此格式）。"""

    def emit(self, stage: str, type_: str, **payload) -> None:
        record = {"ts": round(time.time(), 3), "stage": stage, "type": type_, **payload}
        print(json.dumps(record, ensure_ascii=False), flush=True)

    # 便捷方法
    def stage_start(self, stage: str, **kw) -> None:
        self.emit(stage, "stage_start", **kw)

    def stage_done(self, stage: str, **kw) -> None:
        self.emit(stage, "stage_done", **kw)

    def progress(self, stage: str, current: int, total: int, msg: str = "") -> None:
        self.emit(stage, "progress", current=current, total=total, msg=msg)

    def usage(self, stage: str, model: str, input_tokens: int, output_tokens: int) -> None:
        self.emit(stage, "usage", model=model, input=input_tokens, output=output_tokens)

    def warn(self, stage: str, msg: str) -> None:
        self.emit(stage, "warn", msg=msg)


class PrettyEmitter(Emitter):
    """CLI 发射器：人类可读中文进度（stderr），保持旧 ingest.py 的使用体验。"""

    def emit(self, stage: str, type_: str, **payload) -> None:
        if type_ == "stage_start":
            print(f"[{stage}] 开始 …", file=sys.stderr, flush=True)
        elif type_ == "stage_done":
            extra = " ".join(f"{k}={v}" for k, v in payload.items())
            print(f"[{stage}] 完成 {extra}", file=sys.stderr, flush=True)
        elif type_ == "progress":
            msg = payload.get("msg", "")
            print(
                f"  {stage} {payload['current']}/{payload['total']} {msg}",
                file=sys.stderr, flush=True,
            )
        elif type_ == "warn":
            print(f"  ! {payload['msg']}", file=sys.stderr, flush=True)
        # usage 事件在 CLI 下静默（最终汇总在 meta.yaml）


class PipelineError(Exception):
    """带阶段归属的流水线错误。"""

    def __init__(self, stage: str, reason: str):
        self.stage = stage
        self.reason = reason
        super().__init__(f"[{stage}] {reason}")
