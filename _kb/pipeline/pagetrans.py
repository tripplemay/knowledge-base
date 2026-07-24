"""按页翻译：为「原版 PDF + 译文对照层」阅读模式生成 pages.zh.json。

每页独立翻译（页级 checkpoint，4 线程并行），产物：
    [{"page": 1, "zh": "..."}, ...]
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .gateway import Gateway

PAGE_SYSTEM = (
    "你是专业的技术文档翻译。输入是从 PDF 单页提取的纯文本（可能含断行、页眉页脚、页码）。\n"
    "输出该页对应的流畅简体中文：\n"
    "1. 合并被断行打断的句子；删除页码与页眉页脚噪音。\n"
    "2. 按语义组织为可读段落（可用 Markdown 标题/列表）。\n"
    "3. 代码、URL、人名、产品名保留原样；术语与术语表一致。\n"
    "4. 只输出译文；若该页没有可翻译正文（纯图形/空白页），输出空字符串。\n"
)

MIN_PAGE_CHARS = 20  # 低于此字符数的页面视为无正文


def extract_pages(source_pdf: Path) -> list[str]:
    import fitz
    with fitz.open(str(source_pdf)) as doc:
        return [page.get_text("text").strip() for page in doc]


def translate_pages(source_pdf: Path, out_json: Path, checkpoint_dir: Path,
                    gw: Gateway, summary: str, glossary: list[dict],
                    workers: int = 4,
                    progress_cb=None) -> int:
    """返回翻译的页数。checkpoint_dir 内按页缓存，重跑跳过已完成页。"""
    texts = extract_pages(source_pdf)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    glossary_text = "\n".join(f"- {g['en']} → {g['zh']}" for g in glossary) or "（无）"
    system = f"{PAGE_SYSTEM}\n## 全文摘要\n{summary}\n\n## 术语表\n{glossary_text}"

    def do_page(idx: int) -> None:
        ckpt = checkpoint_dir / f"{idx:03d}.zh.txt"
        if ckpt.exists():
            return
        text = texts[idx]
        if len(text) < MIN_PAGE_CHARS:
            ckpt.write_text("")
            return
        zh = gw.chat(gw_model, system, f"## 第 {idx + 1} 页原文\n{text}").strip()
        ckpt.write_text(zh)
        if progress_cb:
            progress_cb(idx + 1, len(texts))

    gw_model = getattr(gw, "page_model", None) or "deepseek-v4-flash"
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(do_page, range(len(texts))))

    pages = []
    for idx in range(len(texts)):
        zh = (checkpoint_dir / f"{idx:03d}.zh.txt").read_text()
        pages.append({"page": idx + 1, "zh": zh})
    tmp = out_json.with_suffix(".tmp")
    tmp.write_text(json.dumps(pages, ensure_ascii=False, indent=1))
    tmp.replace(out_json)
    return len([p for p in pages if p["zh"]])
