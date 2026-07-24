"""流水线运行器：全链或单阶段执行。

用法（stage 契约的 python -m 入口）：
    .venv/bin/python -m pipeline.run --job-dir _kb/work/<job> [--stage translate] [--pretty]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .context import JobContext
from .events import Emitter, PipelineError, PrettyEmitter
from .stages import STAGE_NAMES, STAGES


def run_pipeline(job_dir: Path, emitter: Emitter, only_stage: str | None = None) -> None:
    ctx = JobContext(job_dir)
    for name, fn in STAGES:
        if only_stage and name != only_stage:
            continue
        try:
            fn(ctx, emitter)
        except PipelineError:
            raise
        except Exception as err:  # noqa: BLE001 — 归属到当前阶段
            raise PipelineError(name, str(err)) from err


def main() -> None:
    parser = argparse.ArgumentParser(description="知识库流水线运行器")
    parser.add_argument("--job-dir", required=True, type=Path)
    parser.add_argument("--stage", choices=STAGE_NAMES, default=None)
    parser.add_argument("--pretty", action="store_true", help="人类可读输出（默认 JSON 事件行）")
    args = parser.parse_args()

    emitter = PrettyEmitter() if args.pretty else Emitter()
    try:
        run_pipeline(args.job_dir, emitter, args.stage)
    except PipelineError as err:
        emitter.emit(err.stage, "error", msg=err.reason)
        sys.exit(1)


if __name__ == "__main__":
    main()
