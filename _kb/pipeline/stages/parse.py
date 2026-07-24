"""parse：源文件 → source.en.md + 分块 chunks/NNNN.src.md（逻辑与 v0.2 ingest.py 等价）。"""
from __future__ import annotations

import re

from ..context import JobContext
from ..events import Emitter, PipelineError

STAGE = "parse"


def nonspace(text: str) -> int:
    return len(re.sub(r"\s", "", text))


def est_tokens(text: str) -> int:
    return len(text) // 4


def parse_to_markdown(ctx: JobContext) -> tuple[str, str]:
    src = ctx.source
    if src.suffix.lower() != ".pdf":
        return src.read_text(errors="replace"), "plain"
    import fitz
    import pymupdf4llm
    with fitz.open(str(src)) as doc:
        plain = "\n\n".join(page.get_text("text") for page in doc)
    rich = pymupdf4llm.to_markdown(str(src))
    coverage = nonspace(rich) / max(nonspace(plain), 1)
    if coverage >= 0.85:
        return rich, "pymupdf4llm"
    return plain, "pymupdf-plain"


def split_sections(markdown: str) -> list[str]:
    lines = markdown.splitlines()
    sections: list[list[str]] = [[]]
    for line in lines:
        if re.match(r"^#{1,6}\s", line):
            sections.append([line])
        else:
            sections[-1].append(line)
    return ["\n".join(sec).strip() for sec in sections if "\n".join(sec).strip()]


def build_chunks(markdown: str, target: int, maximum: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for section in split_sections(markdown):
        candidate = f"{current}\n\n{section}".strip() if current else section
        if est_tokens(candidate) <= target:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if est_tokens(section) <= maximum:
            current = section
        else:
            current = ""
            for para in re.split(r"\n\s*\n", section):
                candidate = f"{current}\n\n{para}".strip() if current else para
                if est_tokens(candidate) > maximum and current:
                    chunks.append(current)
                    current = para
                else:
                    current = candidate
    if current:
        chunks.append(current)
    return chunks


def run(ctx: JobContext, emit: Emitter) -> None:
    md_path = ctx.job_dir / "source.en.md"
    if md_path.exists() and ctx.src_chunks():
        emit.stage_done(STAGE, skipped=True, chunks=len(ctx.src_chunks()))
        return
    emit.stage_start(STAGE, file=ctx.source.name)
    if not ctx.source.exists():
        raise PipelineError(STAGE, f"源文件不存在: {ctx.source}")
    markdown, parser = parse_to_markdown(ctx)
    if parser == "pymupdf-plain":
        emit.warn(STAGE, "pymupdf4llm 覆盖率不足，回退到纯文本提取")
    tcfg = ctx.config["translation"]
    chunks = build_chunks(markdown, tcfg["chunk_target_tokens"], tcfg["chunk_max_tokens"])
    ctx.chunks_dir.mkdir(exist_ok=True)
    for idx, chunk in enumerate(chunks):
        (ctx.chunks_dir / f"{idx:04d}.src.md").write_text(chunk)
    md_path.write_text(markdown)
    (ctx.job_dir / "parser.txt").write_text(parser)
    emit.stage_done(STAGE, parser=parser, chars=len(markdown), chunks=len(chunks))
