#!/usr/bin/env python3
"""知识库摄取流水线 Phase 1：解析 → 术语表 → 分块翻译 → 双语拼接 → meta。

用法:
    .venv/bin/python scripts/ingest.py <file.pdf|.md|.txt> --domain ai-engineering [--slug my-doc]

产物: domains/<域>/sources/<日期-slug>/{source.*, source.en.md, zh.md, bilingual.md, terms.csv, meta.yaml}
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import time
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
import yaml

KB_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = KB_ROOT / "_kb" / "config.yaml"
ENV_PATH = KB_ROOT / "_kb" / ".env"

TRANSLATE_SYSTEM = (
    "你是专业的技术文档翻译。将用户给出的英文 Markdown 片段翻译为准确、流畅的简体中文。\n"
    "规则：\n"
    "1. 严格保留 Markdown 结构（标题层级、列表、表格、粗斜体）。\n"
    "2. 代码块、行内代码、URL、公式、图片引用原样保留，不翻译。\n"
    "3. 人名、公司名、产品名保留英文；专业术语首次出现时可用「中文（English）」形式。\n"
    "4. 术语必须与给定术语表一致。\n"
    "5. 只输出译文本身，不要任何解释、前言或复述原文。\n"
)

TERMS_SYSTEM = (
    "你是技术文档分析助手。阅读给定的英文文档（可能是节选），输出 JSON："
    '{"summary": "200字以内的中文全文摘要", "glossary": [{"en": "术语", "zh": "统一中文译名"}, ...]}。'
    "术语表收录：反复出现的专业术语、缩写、框架/协议名（产品名译名保留英文原文即可不必收录）。"
    "最多 40 条。只输出 JSON。"
)


def load_env() -> Dict[str, str]:
    env: Dict[str, str] = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    missing = {"AIGC_GATEWAY_BASE_URL", "AIGC_GATEWAY_API_KEY"} - env.keys()
    if missing:
        sys.exit(f"缺少环境变量: {missing} (检查 {ENV_PATH})")
    return env


def load_config() -> dict:
    return yaml.safe_load(CONFIG_PATH.read_text())


class Gateway:
    """aigc-gateway OpenAI 兼容客户端，累计 token 用量。"""

    def __init__(self, env: Dict[str, str], pricing: Dict[str, dict]):
        self.base_url = env["AIGC_GATEWAY_BASE_URL"].rstrip("/")
        self.api_key = env["AIGC_GATEWAY_API_KEY"]
        self.pricing = pricing
        self.usage: Dict[str, Dict[str, int]] = {}

    def chat(self, model: str, system: str, user: str,
             json_mode: bool = False, retries: int = 3) -> str:
        payload: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        last_err: Optional[Exception] = None
        for attempt in range(retries):
            try:
                resp = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                    timeout=600,
                )
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage", {})
                bucket = self.usage.setdefault(model, {"input": 0, "output": 0})
                bucket["input"] += usage.get("prompt_tokens", 0)
                bucket["output"] += usage.get("completion_tokens", 0)
                return data["choices"][0]["message"]["content"]
            except Exception as err:  # noqa: BLE001 — 统一重试网络/解析错误
                last_err = err
                wait = 5 * (attempt + 1)
                print(f"  ! API 调用失败 ({err})，{wait}s 后重试 {attempt + 1}/{retries}")
                time.sleep(wait)
        raise RuntimeError(f"API 连续失败: {last_err}")

    def cost_usd(self) -> float:
        total = 0.0
        for model, used in self.usage.items():
            price = self.pricing.get(model, {"input": 0, "output": 0})
            total += used["input"] / 1e6 * price["input"]
            total += used["output"] / 1e6 * price["output"]
        return round(total, 4)


def nonspace(text: str) -> int:
    return len(re.sub(r"\s", "", text))


def parse_to_markdown(src: Path) -> Tuple[str, str]:
    """返回 (markdown, parser)。pymupdf4llm 覆盖率不足时回退到 PyMuPDF 纯文本。

    某些设计复杂的 PDF（如多层图形排版）会让 pymupdf4llm 丢失大量正文，
    以纯文本提取的非空白字符数为基准，覆盖率 < 85% 即回退。
    """
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
    print(f"  ! pymupdf4llm 覆盖率仅 {coverage:.0%}，回退到纯文本提取")
    return plain, "pymupdf-plain"


def est_tokens(text: str) -> int:
    return len(text) // 4


def split_sections(markdown: str) -> List[str]:
    """按标题行切成节；无标题的长文本按空行段落切。"""
    lines = markdown.splitlines()
    sections: List[List[str]] = [[]]
    for line in lines:
        if re.match(r"^#{1,6}\s", line):
            sections.append([line])
        else:
            sections[-1].append(line)
    return ["\n".join(sec).strip() for sec in sections if "\n".join(sec).strip()]


def build_chunks(markdown: str, target: int, maximum: int) -> List[str]:
    chunks: List[str] = []
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
        else:  # 单节超限：按段落硬切
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


def parse_terms_json(raw: str) -> Tuple[str, List[Dict[str, str]]]:
    """从模型输出中提取术语 JSON；容忍思考文本、代码围栏等噪音。"""
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


def extract_terms(gw: Gateway, model: str, markdown: str) -> Tuple[str, List[Dict[str, str]]]:
    sample = markdown[:40000]  # 样本过大易触发网关 504
    for attempt in range(2):
        raw = gw.chat(model, TERMS_SYSTEM, sample, json_mode=True)
        try:
            return parse_terms_json(raw)
        except (json.JSONDecodeError, ValueError) as err:
            print(f"  ! 术语表解析失败（{err}），重试 {attempt + 1}/2")
    print("  ! 术语表两次失败，继续无术语表翻译")
    return "", []


STRUCTURE_HINT = (
    "\n## 结构还原（重要）\n"
    "输入是从 PDF 提取的无结构纯文本（原始排版已丢失）。请在忠实原文内容的前提下，"
    "根据语义推断并输出结构良好的 Markdown：合理的标题层级（#/##/###）、列表、表格、粗体强调。\n"
    "- 标题必须来自内容语义（章节名、趋势名、小节主题），绝不允许把数字当标题。\n"
    "- 孤立的数字行是页码：直接删除，不保留。页眉/页脚的重复短语也删除。\n"
    "- 因换行被打断的句子要合并成完整段落；目录页整理为列表。\n"
    "- 除页码与页眉页脚噪音外，不得发明、删减或改写任何内容，只做结构标注。\n"
)


def translate_chunks(gw: Gateway, model: str, chunks: List[str], summary: str,
                     glossary: List[Dict[str, str]], tail_chars: int,
                     infer_structure: bool = False) -> List[str]:
    glossary_text = "\n".join(f"- {g['en']} → {g['zh']}" for g in glossary) or "（无）"
    system = (
        f"{TRANSLATE_SYSTEM}"
        f"{STRUCTURE_HINT if infer_structure else ''}"
        f"\n## 全文摘要（供理解上下文）\n{summary}\n"
        f"\n## 术语表\n{glossary_text}"
    )
    results: List[str] = []
    for idx, chunk in enumerate(chunks):
        context = ""
        if results:
            context = (
                "## 衔接上下文（前一块结尾，勿重复翻译）\n"
                f"原文结尾：…{chunks[idx - 1][-tail_chars:]}\n"
                f"译文结尾：…{results[-1][-tail_chars:]}\n\n"
            )
        user = f"{context}## 待翻译片段\n{chunk}"
        started = time.time()
        results.append(gw.chat(model, system, user).strip())
        print(f"  块 {idx + 1}/{len(chunks)} 完成 ({time.time() - started:.0f}s)")
    return results


def write_outputs(out_dir: Path, src: Path, markdown: str, chunks: List[str],
                  translations: List[str], summary: str,
                  glossary: List[Dict[str, str]], meta: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, out_dir / f"source{src.suffix.lower()}")
    (out_dir / "source.en.md").write_text(markdown)
    (out_dir / "zh.md").write_text("\n\n".join(translations) + "\n")

    bilingual: List[str] = []
    for idx, (orig, trans) in enumerate(zip(chunks, translations)):
        quoted = "\n".join(f"> {line}" for line in orig.splitlines())
        bilingual.append(f"<!-- blk:{idx:04d} -->\n{quoted}\n\n{trans}")
    (out_dir / "bilingual.md").write_text("\n\n---\n\n".join(bilingual) + "\n")

    with (out_dir / "terms.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["source", "target", "tgt_lng"])
        for term in glossary:
            writer.writerow([term["en"], term["zh"], "zh-CN"])

    (out_dir / "meta.yaml").write_text(
        yaml.safe_dump({**meta, "summary": summary}, allow_unicode=True, sort_keys=False)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="知识库文档摄取")
    parser.add_argument("file", type=Path)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--slug", default=None)
    args = parser.parse_args()

    config = load_config()
    if args.domain not in config["domains"]:
        sys.exit(f"未注册的知识域: {args.domain}（先在 _kb/config.yaml 注册）")
    src: Path = args.file.resolve()
    if not src.exists():
        sys.exit(f"文件不存在: {src}")

    slug = args.slug or re.sub(r"[^a-z0-9]+", "-", src.stem.lower()).strip("-")[:60]
    out_dir = KB_ROOT / "domains" / args.domain / "sources" / f"{date.today()}-{slug}"
    if out_dir.exists():
        sys.exit(f"目标已存在: {out_dir}（换个 --slug 或删除后重跑）")

    gw = Gateway(load_env(), config.get("pricing", {}))
    tcfg = config["translation"]
    started = time.time()

    print(f"[1/4] 解析 {src.name} …")
    markdown, parser = parse_to_markdown(src)
    chunks = build_chunks(markdown, tcfg["chunk_target_tokens"], tcfg["chunk_max_tokens"])
    print(f"      {len(markdown)} 字符 → {len(chunks)} 块（parser: {parser}）")

    print("[2/4] 抽取术语表与摘要 …")
    summary, glossary = extract_terms(gw, config["models"]["terms"], markdown)
    print(f"      术语 {len(glossary)} 条")

    print(f"[3/4] 逐块翻译（{config['models']['translation']}）…")
    translations = translate_chunks(
        gw, config["models"]["translation"], chunks, summary, glossary,
        tcfg["context_tail_chars"],
        infer_structure=(parser == "pymupdf-plain"),
    )

    print("[4/4] 写入产物 …")
    meta = {
        "source_file": src.name,
        "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
        "domain": args.domain,
        "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "pipeline_version": "0.2",
        "parser": parser,
        "models": config["models"],
        "chunks": len(chunks),
        "token_usage": gw.usage,
        "cost_usd": gw.cost_usd(),
        "duration_s": round(time.time() - started),
    }
    write_outputs(out_dir, src, markdown, chunks, translations, summary, glossary, meta)
    print(f"完成 → {out_dir}\n成本 ${gw.cost_usd()}，耗时 {meta['duration_s']}s")


if __name__ == "__main__":
    main()
