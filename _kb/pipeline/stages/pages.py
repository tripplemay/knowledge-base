"""pages：按页翻译 → pages.zh.json（对照阅读模式的数据源）。PDF 专属。"""
from __future__ import annotations

import json

from ..context import JobContext
from ..events import Emitter
from ..gateway import Gateway
from ..pagetrans import translate_pages

STAGE = "pages"


def run(ctx: JobContext, emit: Emitter) -> None:
    if ctx.source.suffix.lower() != ".pdf":
        emit.stage_done(STAGE, skipped=True, reason="非 PDF")
        return
    out_json = ctx.out_dir / "pages.zh.json"
    if out_json.exists():
        emit.stage_done(STAGE, skipped=True)
        return
    emit.stage_start(STAGE)
    glossary_data = json.loads((ctx.job_dir / "glossary.json").read_text())
    gw = Gateway(ctx.env, ctx.config.get("pricing", {}), emit, STAGE)
    gw.page_model = ctx.config["models"]["translation"]
    translated = translate_pages(
        ctx.out_dir / "source.pdf", out_json, ctx.job_dir / "pages",
        gw, glossary_data["summary"], glossary_data["glossary"],
        progress_cb=lambda cur, total: emit.progress(STAGE, cur, total),
    )
    emit.stage_done(STAGE, pages=translated)
