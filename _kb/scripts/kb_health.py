#!/usr/bin/env python3
"""kb-health 知识库体检（Phase 4）：结构性检查，无 LLM 成本。

检查项：悬空 [[链接]]、frontmatter 合法性、孤儿笔记、断言时效统计、待裁决积压、
知识域注册表一致性（自动建域后的域爆炸/空域告警）。
报告写入 _kb/reports/health-<date>.md。夜间由 launchd 调度（com.kb.health）。
"""
import json
import re
import sys
import time
from pathlib import Path

import yaml

KB_ROOT = Path(__file__).resolve().parents[2]
REPORTS = KB_ROOT / "_kb" / "reports"
REGISTRY_PATH = KB_ROOT / "_kb" / "domains.yaml"
CLASSIFY_LOG = REPORTS / "classify-log.jsonl"


def check_registry() -> list[str]:
    """注册表 ↔ domains/ 目录一致性 + 自动建域的健康度。"""
    lines = ["## 知识域注册表"]
    registered = (yaml.safe_load(REGISTRY_PATH.read_text()) or {}).get("domains", {}) \
        if REGISTRY_PATH.exists() else {}
    on_disk = {
        d.name for d in (KB_ROOT / "domains").iterdir()
        if d.is_dir() and not d.name.startswith(".")
    }
    for missing in sorted(set(registered) - on_disk):
        lines.append(f"- ❌ 注册了但没有目录: {missing}")
    for orphan in sorted(on_disk - set(registered)):
        lines.append(f"- ❌ 有目录但未注册: {orphan}（Web 会显示为无名域）")

    auto = [d for d, e in registered.items() if e.get("origin") == "auto"]
    empty = [
        d for d in registered
        if not any((KB_ROOT / "domains" / d / "sources").glob("*/"))
    ]
    lines.append(f"- 统计：共 {len(registered)} 个域（自动创建 {len(auto)} 个）")
    if empty:
        lines.append(f"- ⚠️ 无文档的空域 {len(empty)} 个: {', '.join(sorted(empty)[:6])}")
    if len(auto) >= 15:
        lines.append("- ⚠️ 自动建域数量偏多，检查是否需要合并近义域（config.yaml: max_auto_domains）")

    if CLASSIFY_LOG.exists():
        records = [
            json.loads(line) for line in
            CLASSIFY_LOG.read_text().strip().splitlines()[-200:] if line.strip()
        ]
        review = [r for r in records if r.get("needs_review")]
        lines.append(f"- 判定日志：近 {len(records)} 次，其中建议人工复核 {len(review)} 次")
        for r in review[-5:]:
            lines.append(f"  - ⚠️ {r.get('slug')} → {r.get('domain')}"
                         f"（置信度 {r.get('confidence')}，{r.get('reason', '')[:40]}）")
    return lines


def check_domain(domain_dir: Path) -> list[str]:
    lines = [f"## 域 {domain_dir.name}"]
    notes_dir, claims_dir = domain_dir / "notes", domain_dir / "claims"
    notes = list(notes_dir.glob("*.md")) if notes_dir.exists() else []
    claims = list(claims_dir.glob("*.md")) if claims_dir.exists() else []
    slugs = {p.stem for p in notes}
    problems = 0

    linked: set[str] = set()
    for p in notes:
        text = p.read_text()
        if not re.match(r"^---\n.*?\n---", text, re.DOTALL):
            lines.append(f"- ❌ frontmatter 缺失: notes/{p.name}")
            problems += 1
            continue
        try:
            yaml.safe_load(re.match(r"^---\n(.*?)\n---", text, re.DOTALL).group(1))
        except yaml.YAMLError:
            lines.append(f"- ❌ frontmatter 不合法: notes/{p.name}")
            problems += 1
        for target in re.findall(r"\[\[([a-z0-9\-]+)\]\]", text):
            linked.add(target)
            if target not in slugs:
                lines.append(f"- ⚠️ 悬空链接 [[{target}]] in notes/{p.name}")
                problems += 1

    orphans = slugs - linked
    if orphans:
        lines.append(f"- ℹ️ 无入链笔记 {len(orphans)} 篇: {', '.join(sorted(orphans)[:6])}…")

    active = superseded = 0
    for p in claims:
        text = p.read_text()
        match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
        try:
            meta = yaml.safe_load(match.group(1)) if match else {}
        except yaml.YAMLError:
            meta = {}
        if not meta.get("id"):
            lines.append(f"- ❌ claim 缺 id: claims/{p.name}")
            problems += 1
        elif meta.get("invalid_at"):
            superseded += 1
        else:
            active += 1

    lines.append(f"- 统计：笔记 {len(notes)} / 断言 有效 {active} + 已失效 {superseded}")
    lines.append(f"- 结构问题：{problems} 个")
    return lines


def main() -> None:
    date = time.strftime("%Y-%m-%d")
    report = [f"# 知识库体检报告 {date}", ""]
    for domain_dir in sorted((KB_ROOT / "domains").iterdir()):
        if domain_dir.is_dir():
            report.extend(check_domain(domain_dir))
            report.append("")

    queue = KB_ROOT / "forge" / "review-queue"
    pending = [
        f for f in queue.glob("*.yaml")
        if yaml.safe_load(f.read_text()).get("status") == "pending"
    ] if queue.exists() else []
    report.extend(check_registry())
    report.append("")
    report.append(f"## 全局\n- 待裁决积压：{len(pending)} 项")

    REPORTS.mkdir(exist_ok=True)
    out = REPORTS / f"health-{date}.md"
    out.write_text("\n".join(report) + "\n")
    print("\n".join(report))
    print(f"\n报告: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
