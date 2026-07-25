#!/usr/bin/env python3
"""知识库摄取 CLI（薄壳）：创建 job 并运行完整流水线。

用法:
    _kb/.venv/bin/python _kb/scripts/ingest.py <file.pdf|.md|.txt> [--domain ai-engineering] [--slug my-doc]

--domain 省略即 auto：classify 阶段按文档内容判定知识域，不属于已知域时自动建域。

实际逻辑在 _kb/pipeline/（stage 链，块级 checkpoint，中断后重跑同一 job 目录即续传）。
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.context import AUTO_DOMAIN, WORK_ROOT, create_job, load_config  # noqa: E402
from pipeline.events import PipelineError, PrettyEmitter  # noqa: E402
from pipeline.run import run_pipeline  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="知识库文档摄取")
    parser.add_argument("file", type=Path)
    parser.add_argument("--domain", default="auto",
                        help="知识域 id；auto = 按文档内容自动判定（未知领域自动建域）")
    parser.add_argument("--slug", default=None)
    parser.add_argument("--keep-work", action="store_true", help="成功后保留 job 工作目录")
    args = parser.parse_args()

    config = load_config()
    domain = AUTO_DOMAIN if args.domain in ("auto", AUTO_DOMAIN) else args.domain
    if domain != AUTO_DOMAIN and domain not in config["domains"]:
        sys.exit(f"未注册的知识域: {domain}（先在 _kb/domains.yaml 注册，或用 --domain auto 自动判定）")
    src = args.file.resolve()
    if not src.exists():
        sys.exit(f"文件不存在: {src}")

    slug = args.slug or re.sub(r"[^a-z0-9]+", "-", src.stem.lower()).strip("-")[:60]

    # 同名 job 目录已存在则续跑（断点续传），否则新建
    existing = sorted(WORK_ROOT.glob(f"*-{slug}-*")) if WORK_ROOT.exists() else []
    job_dir = existing[-1] if existing else create_job(src, domain, slug)
    if existing:
        print(f"发现未完成 job，续跑: {job_dir}", file=sys.stderr)

    try:
        run_pipeline(job_dir, PrettyEmitter())
    except PipelineError as err:
        sys.exit(f"失败于 [{err.stage}]: {err.reason}\n工作目录已保留，可修复后重跑续传: {job_dir}")

    if not args.keep_work:
        shutil.rmtree(job_dir, ignore_errors=True)  # 磁盘纪律：终态即清中间产物
    print("完成")


if __name__ == "__main__":
    main()
