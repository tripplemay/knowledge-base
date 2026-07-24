"""assemble：从 job 目录拼装七件套 → 临时目录原子落盘到 domains/。"""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import time

import yaml

from .. import PIPELINE_VERSION
from ..context import JobContext
from ..events import Emitter, PipelineError

STAGE = "assemble"


def accumulate_usage(ctx: JobContext) -> dict[str, dict[str, int]]:
    usage: dict[str, dict[str, int]] = {}
    glossary_data = json.loads((ctx.job_dir / "glossary.json").read_text())
    for model, u in glossary_data.get("usage", {}).items():
        bucket = usage.setdefault(model, {"input": 0, "output": 0})
        bucket["input"] += u["input"]
        bucket["output"] += u["output"]
    for src in ctx.src_chunks():
        upath = ctx.usage_path(src)
        if not upath.exists():
            continue
        u = json.loads(upath.read_text())
        bucket = usage.setdefault(u["model"], {"input": 0, "output": 0})
        bucket["input"] += u["input"]
        bucket["output"] += u["output"]
    return usage


def cost_usd(usage: dict, pricing: dict) -> float:
    total = 0.0
    for model, u in usage.items():
        price = pricing.get(model, {"input": 0, "output": 0})
        total += u["input"] / 1e6 * price["input"]
        total += u["output"] / 1e6 * price["output"]
    return round(total, 4)


def run(ctx: JobContext, emit: Emitter) -> None:
    # 重试幂等：目标已存在且 sha256 与本任务源文件一致 → 视为已完成（layout 失败重试时会走到这里）
    existing_meta = ctx.out_dir / "meta.yaml"
    if existing_meta.exists():
        meta = yaml.safe_load(existing_meta.read_text())
        src_sha = hashlib.sha256(ctx.source.read_bytes()).hexdigest()
        if meta.get("sha256") == src_sha:
            emit.stage_done(STAGE, skipped=True, out=str(ctx.out_dir))
            return
        raise PipelineError(STAGE, f"目标已存在且来源不同: {ctx.out_dir}")

    emit.stage_start(STAGE)
    src_chunks = ctx.src_chunks()
    missing = [s.name for s in src_chunks if not ctx.zh_chunk_path(s).exists()]
    if missing:
        raise PipelineError(STAGE, f"译文块缺失，translate 未完成: {missing[:3]}…")

    glossary_data = json.loads((ctx.job_dir / "glossary.json").read_text())
    parser = (ctx.job_dir / "parser.txt").read_text().strip()
    usage = accumulate_usage(ctx)

    originals = [s.read_text() for s in src_chunks]
    translations = [ctx.zh_chunk_path(s).read_text() for s in src_chunks]

    # 先写临时目录，全部成功后原子 rename（幂等纪律）
    tmp_dir = ctx.out_dir.with_name(ctx.out_dir.name + ".tmp")
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    shutil.copy2(ctx.source, tmp_dir / f"source{ctx.source.suffix.lower()}")
    (tmp_dir / "source.en.md").write_text((ctx.job_dir / "source.en.md").read_text())
    (tmp_dir / "zh.md").write_text("\n\n".join(translations) + "\n")

    bilingual = []
    for idx, (orig, trans) in enumerate(zip(originals, translations)):
        quoted = "\n".join(f"> {line}" for line in orig.splitlines())
        bilingual.append(f"<!-- blk:{idx:04d} -->\n{quoted}\n\n{trans}")
    (tmp_dir / "bilingual.md").write_text("\n\n---\n\n".join(bilingual) + "\n")

    with (tmp_dir / "terms.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["source", "target", "tgt_lng"])
        for term in glossary_data["glossary"]:
            writer.writerow([term["en"], term["zh"], "zh-CN"])

    meta = {
        "source_file": ctx.source.name,
        "sha256": hashlib.sha256(ctx.source.read_bytes()).hexdigest(),
        "domain": ctx.domain,
        "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "pipeline_version": PIPELINE_VERSION,
        "parser": parser,
        "models": ctx.config["models"],
        "chunks": len(src_chunks),
        "token_usage": usage,
        "cost_usd": cost_usd(usage, ctx.config.get("pricing", {})),
        "summary": glossary_data["summary"],
    }
    (tmp_dir / "meta.yaml").write_text(
        yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    )

    if ctx.out_dir.exists():
        raise PipelineError(STAGE, f"目标已存在: {ctx.out_dir}（换 slug 或删除后重跑）")
    tmp_dir.rename(ctx.out_dir)
    emit.stage_done(STAGE, out=str(ctx.out_dir), cost_usd=meta["cost_usd"])
