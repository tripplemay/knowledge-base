#!/usr/bin/env python3
"""kb-health 知识库体检（Phase 4）：结构性检查，无 LLM 成本。

检查项：悬空 [[链接]]、frontmatter 合法性、孤儿笔记、断言时效统计、待裁决积压。
报告写入 _kb/reports/health-<date>.md。夜间由 launchd 调度（com.kb.health）。
"""
import re
import sys
import time
from pathlib import Path

import yaml

KB_ROOT = Path(__file__).resolve().parents[2]
REPORTS = KB_ROOT / "_kb" / "reports"


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
    report.append(f"## 全局\n- 待裁决积压：{len(pending)} 项")

    REPORTS.mkdir(exist_ok=True)
    out = REPORTS / f"health-{date}.md"
    out.write_text("\n".join(report) + "\n")
    print("\n".join(report))
    print(f"\n报告: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
