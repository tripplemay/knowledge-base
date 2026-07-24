"""glossary：术语表 + 全文摘要（逻辑与 v0.2 ingest.py 等价）。"""
from __future__ import annotations

import json
import re

from ..context import JobContext
from ..events import Emitter
from ..gateway import Gateway

STAGE = "glossary"

TERMS_SYSTEM = (
    "你是技术文档分析助手。阅读给定的英文文档（可能是节选），输出 JSON："
    '{"summary": "200字以内的中文全文摘要", "glossary": [{"en": "术语", "zh": "统一中文译名"}, ...]}。'
    "术语表收录：反复出现的专业术语、缩写、框架/协议名（产品名译名保留英文原文即可不必收录）。"
    "最多 40 条。只输出 JSON。"
)

SAMPLE_CHARS = 40000  # 样本过大易触发网关 504


def parse_terms_json(raw: str) -> tuple[str, list[dict[str, str]]]:
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned.strip(), flags=re.MULTILINE)
    start = cleaned.find("{")
    if start < 0:
        raise ValueError("输出中没有 JSON")
    data = json.loads(cleaned[start:cleaned.rfind("}") + 1])
    glossary = [g for g in data.get("glossary", []) if g.get("en") and g.get("zh")]
    summary = str(data.get("summary", "")).strip()
    if len(summary) < 20:
        raise ValueError(f"摘要过短，疑似解析错位: {summary!r}")
    return summary, glossary


def run(ctx: JobContext, emit: Emitter) -> None:
    out_path = ctx.job_dir / "glossary.json"
    if out_path.exists():
        emit.stage_done(STAGE, skipped=True)
        return
    emit.stage_start(STAGE)
    markdown = (ctx.job_dir / "source.en.md").read_text()
    gw = Gateway(ctx.env, ctx.config.get("pricing", {}), emit, STAGE)
    model = ctx.config["models"]["terms"]
    summary, glossary = "", []
    for attempt in range(2):
        raw = gw.chat(model, TERMS_SYSTEM, markdown[:SAMPLE_CHARS], json_mode=True)
        try:
            summary, glossary = parse_terms_json(raw)
            break
        except (json.JSONDecodeError, ValueError) as err:
            emit.warn(STAGE, f"术语表解析失败（{err}），重试 {attempt + 1}/2")
    else:
        emit.warn(STAGE, "术语表两次失败，继续无术语表翻译")
    out_path.write_text(json.dumps(
        {"summary": summary, "glossary": glossary, "usage": gw.usage},
        ensure_ascii=False, indent=1,
    ))
    emit.stage_done(STAGE, terms=len(glossary))
