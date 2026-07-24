"""translate：分块翻译，块级 checkpoint（每块译完即落盘，重跑不重花 token）。"""
from __future__ import annotations

import json

from ..context import JobContext
from ..events import Emitter
from ..gateway import Gateway

STAGE = "translate"

TRANSLATE_SYSTEM = (
    "你是专业的技术文档翻译。将用户给出的英文 Markdown 片段翻译为准确、流畅的简体中文。\n"
    "规则：\n"
    "1. 严格保留 Markdown 结构（标题层级、列表、表格、粗斜体）。\n"
    "2. 代码块、行内代码、URL、公式、图片引用原样保留，不翻译。\n"
    "3. 人名、公司名、产品名保留英文；专业术语首次出现时可用「中文（English）」形式。\n"
    "4. 术语必须与给定术语表一致。\n"
    "5. 只输出译文本身，不要任何解释、前言或复述原文。\n"
)

STRUCTURE_HINT = (
    "\n## 结构还原（重要）\n"
    "输入是从 PDF 提取的无结构纯文本（原始排版已丢失）。请在忠实原文内容的前提下，"
    "根据语义推断并输出结构良好的 Markdown：合理的标题层级（#/##/###）、列表、表格、粗体强调。\n"
    "- 标题必须来自内容语义（章节名、趋势名、小节主题），绝不允许把数字当标题。\n"
    "- 孤立的数字行是页码：直接删除，不保留。页眉/页脚的重复短语也删除。\n"
    "- 因换行被打断的句子要合并成完整段落；目录页整理为列表。\n"
    "- 除页码与页眉页脚噪音外，不得发明、删减或改写任何内容，只做结构标注。\n"
)


def build_system(ctx: JobContext) -> str:
    parser = (ctx.job_dir / "parser.txt").read_text().strip()
    glossary_data = json.loads((ctx.job_dir / "glossary.json").read_text())
    glossary_text = "\n".join(
        f"- {g['en']} → {g['zh']}" for g in glossary_data["glossary"]
    ) or "（无）"
    return (
        f"{TRANSLATE_SYSTEM}"
        f"{STRUCTURE_HINT if parser == 'pymupdf-plain' else ''}"
        f"\n## 全文摘要（供理解上下文）\n{glossary_data['summary']}\n"
        f"\n## 术语表\n{glossary_text}"
    )


def run(ctx: JobContext, emit: Emitter) -> None:
    src_chunks = ctx.src_chunks()
    total = len(src_chunks)
    pending = [s for s in src_chunks if not ctx.zh_chunk_path(s).exists()]
    if not pending:
        emit.stage_done(STAGE, skipped=True, chunks=total)
        return
    emit.stage_start(STAGE, total=total, resumed_from=total - len(pending))

    system = build_system(ctx)
    tail_chars = ctx.config["translation"]["context_tail_chars"]
    model = ctx.config["models"]["translation"]
    gw = Gateway(ctx.env, ctx.config.get("pricing", {}), emit, STAGE)

    for src in src_chunks:
        zh_path = ctx.zh_chunk_path(src)
        idx = int(src.name.split(".")[0])
        if zh_path.exists():
            continue
        context = ""
        if idx > 0:
            prev_src = ctx.chunks_dir / f"{idx - 1:04d}.src.md"
            prev_zh = ctx.zh_chunk_path(prev_src)
            if prev_zh.exists():
                context = (
                    "## 衔接上下文（前一块结尾，勿重复翻译）\n"
                    f"原文结尾：…{prev_src.read_text()[-tail_chars:]}\n"
                    f"译文结尾：…{prev_zh.read_text()[-tail_chars:]}\n\n"
                )
        user = f"{context}## 待翻译片段\n{src.read_text()}"
        before = {m: dict(u) for m, u in gw.usage.items()}
        translated = gw.chat(model, system, user).strip()
        # 块级 checkpoint：译文 + 本块用量各自落盘
        zh_path.write_text(translated)
        delta_in = gw.usage.get(model, {}).get("input", 0) - before.get(model, {}).get("input", 0)
        delta_out = gw.usage.get(model, {}).get("output", 0) - before.get(model, {}).get("output", 0)
        ctx.usage_path(src).write_text(json.dumps(
            {"model": model, "input": delta_in, "output": delta_out}
        ))
        emit.emit(STAGE, "chunk_done", idx=idx, model=model,
                  input=delta_in, output=delta_out)
        emit.progress(STAGE, idx + 1, total)
    emit.stage_done(STAGE, chunks=total)
