#!/usr/bin/env python3
"""为已入库文档回填 pages.zh.json（对照阅读数据）。

用法: _kb/.venv/bin/python _kb/scripts/backfill_pages.py <doc目录> [<doc目录>...]
"""
import csv
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.context import load_config, load_env  # noqa: E402
from pipeline.events import Emitter  # noqa: E402
from pipeline.gateway import Gateway  # noqa: E402
from pipeline.pagetrans import translate_pages  # noqa: E402


def backfill(doc_dir: Path, config: dict, env: dict) -> None:
    source = doc_dir / "source.pdf"
    out_json = doc_dir / "pages.zh.json"
    if not source.exists():
        print(f"跳过（无 source.pdf）: {doc_dir}")
        return
    if out_json.exists():
        print(f"跳过（已有 pages.zh.json）: {doc_dir}")
        return
    meta = yaml.safe_load((doc_dir / "meta.yaml").read_text())
    glossary = []
    terms_file = doc_dir / "terms.csv"
    if terms_file.exists():
        with terms_file.open() as fh:
            glossary = [
                {"en": row["source"], "zh": row["target"]}
                for row in csv.DictReader(fh)
            ]
    gw = Gateway(env, config.get("pricing", {}), Emitter(), "pages")
    gw.page_model = config["models"]["translation"]
    print(f"按页翻译 {source} …")
    count = translate_pages(
        source, out_json, doc_dir / ".pages-ckpt",
        gw, meta.get("summary", ""), glossary,
        progress_cb=lambda cur, total: print(f"  页 {cur}/{total}", flush=True),
    )
    import shutil
    shutil.rmtree(doc_dir / ".pages-ckpt", ignore_errors=True)
    print(f"完成 {count} 页，成本 ${gw.cost_usd()}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    config, env = load_config(), load_env()
    for arg in sys.argv[1:]:
        backfill(Path(arg).resolve(), config, env)


if __name__ == "__main__":
    main()
