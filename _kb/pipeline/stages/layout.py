"""layout：保版式 PDF 翻译（pdf2zh/BabelDOC 子进程），PDF 且 job 开启时执行。

在 assemble 之后运行：产物 zh.pdf/dual.pdf 直接写入已入库的文档目录。
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import yaml

from ..context import JobContext
from ..events import Emitter, PipelineError
from ..pdfutil import linearize

STAGE = "layout"
MONO_TARGET = "zh.pdf"
DUAL_TARGET = "dual.pdf"


def enabled(ctx: JobContext) -> bool:
    if ctx.source.suffix.lower() != ".pdf":
        return False
    spec = yaml.safe_load((ctx.job_dir / "job.yaml").read_text())
    return bool(spec.get("layout", True))


def find_output(doc_dir, marker: str):
    candidates = [
        p for p in doc_dir.glob("*.pdf")
        if marker in p.name and p.name not in ("source.pdf", MONO_TARGET, DUAL_TARGET)
    ]
    if not candidates:
        raise PipelineError(STAGE, f"未找到 {marker} 输出: {doc_dir}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def run(ctx: JobContext, emit: Emitter) -> None:
    if not enabled(ctx):
        emit.stage_done(STAGE, skipped=True, reason="非 PDF 或未开启保版式翻译")
        return
    doc_dir = ctx.out_dir
    if (doc_dir / MONO_TARGET).exists() and (doc_dir / DUAL_TARGET).exists():
        emit.stage_done(STAGE, skipped=True)
        return
    emit.stage_start(STAGE)
    source = doc_dir / "source.pdf"
    if not source.exists():
        raise PipelineError(STAGE, f"文档未入库或无 source.pdf: {doc_dir}")
    pdf2zh = Path.home() / ".local" / "bin" / "pdf2zh"
    cmd = [
        str(pdf2zh) if pdf2zh.exists() else "pdf2zh", str(source),
        "--openai",
        "--openai-model", ctx.config["models"]["translation"],
        "--openai-base-url", ctx.env["AIGC_GATEWAY_BASE_URL"],
        "--openai-api-key", ctx.env["AIGC_GATEWAY_API_KEY"],
        "--lang-in", "en", "--lang-out", "zh-CN",
        "--watermark-output-mode", "no_watermark",
        "--qps", "4",
        "--output", str(doc_dir),
    ]
    terms = doc_dir / "terms.csv"
    if terms.exists():
        cmd += ["--glossaries", str(terms)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        raise PipelineError(STAGE, f"pdf2zh 失败: {(proc.stderr or '')[-300:]}")
    find_output(doc_dir, "mono").rename(doc_dir / MONO_TARGET)
    find_output(doc_dir, "dual").rename(doc_dir / DUAL_TARGET)
    linearize(doc_dir / MONO_TARGET)
    linearize(doc_dir / DUAL_TARGET)
    emit.stage_done(STAGE, mono=MONO_TARGET, dual=DUAL_TARGET)
