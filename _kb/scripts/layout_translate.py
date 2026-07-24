#!/usr/bin/env python3
"""保版式 PDF 翻译（轨 A）：调用 pdf2zh-next(BabelDOC) 生成 zh.pdf 与 dual.pdf。

用法:
    python3 _kb/scripts/layout_translate.py <doc目录> [<doc目录>...]

依赖: `uv tool install pdf2zh-next`（提供 pdf2zh 命令）；
复用文档目录内的 terms.csv 作为术语表，模型走 aigc-gateway。
"""
import subprocess
import sys
from pathlib import Path

KB_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = KB_ROOT / "_kb" / ".env"

MONO_TARGET = "zh.pdf"
DUAL_TARGET = "dual.pdf"


def load_env() -> dict:
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def find_output(doc_dir: Path, marker: str) -> Path:
    candidates = [
        p for p in doc_dir.glob("*.pdf")
        if marker in p.name and p.name not in ("source.pdf", MONO_TARGET, DUAL_TARGET)
    ]
    if not candidates:
        raise FileNotFoundError(f"未找到 {marker} 输出: {doc_dir}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def translate(doc_dir: Path, env: dict) -> None:
    source = doc_dir / "source.pdf"
    if not source.exists():
        print(f"跳过（无 source.pdf）: {doc_dir}")
        return
    if (doc_dir / MONO_TARGET).exists() and (doc_dir / DUAL_TARGET).exists():
        print(f"跳过（已有 zh.pdf/dual.pdf）: {doc_dir}")
        return
    cmd = [
        "pdf2zh", str(source),
        "--openai",
        "--openai-model", "deepseek-v4-flash",
        "--openai-base-url", env["AIGC_GATEWAY_BASE_URL"],
        "--openai-api-key", env["AIGC_GATEWAY_API_KEY"],
        "--lang-in", "en", "--lang-out", "zh-CN",
        "--watermark-output-mode", "no_watermark",
        "--primary-font-family", "sans-serif",
        "--qps", "4",
        "--output", str(doc_dir),
    ]
    terms = doc_dir / "terms.csv"
    if terms.exists():
        cmd += ["--glossaries", str(terms)]
    print(f"翻译 {source} …")
    subprocess.run(cmd, check=True)
    find_output(doc_dir, "mono").rename(doc_dir / MONO_TARGET)
    find_output(doc_dir, "dual").rename(doc_dir / DUAL_TARGET)
    print(f"完成 → {doc_dir}/{MONO_TARGET} + {DUAL_TARGET}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    env = load_env()
    for arg in sys.argv[1:]:
        translate(Path(arg).resolve(), env)


if __name__ == "__main__":
    main()
