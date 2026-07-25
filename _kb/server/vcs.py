"""知识数据的版本控制：写入独立的数据仓 .kbdata.git，与公开的代码仓分离。

为什么这么做：AGENTS.md 的硬规则要求"git 管理全部知识历史、失效不删除"，
而代码仓要公开、不能带上语料与第三方版权 PDF。两者用**同一个工作区、不同 GIT_DIR**
即可各管各的——数据仓只跟踪 domains/、forge/、_kb/domains.yaml（见 info/exclude）。

初始化：_kb/deploy/init-data-repo.sh
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

KB_ROOT = Path(__file__).resolve().parents[2]
DATA_GIT_DIR = KB_ROOT / ".kbdata.git"


def data_repo_ready() -> bool:
    return (DATA_GIT_DIR / "HEAD").exists()


def _git(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", f"--git-dir={DATA_GIT_DIR}", f"--work-tree={KB_ROOT}", *args],
        cwd=KB_ROOT, capture_output=True, text=True, timeout=timeout,
    )


def commit(paths: list[str], message: str) -> bool:
    """把指定路径的变更提交进数据仓；失败只告警，绝不影响摄取流程。"""
    if not data_repo_ready():
        print(f"[warn] 数据仓未初始化（{DATA_GIT_DIR}），跳过知识提交："
              f"先跑 _kb/deploy/init-data-repo.sh", file=sys.stderr)
        return False
    try:
        # -f 必需：工作区的 .gitignore 属于代码仓、正把语料排除在外，
        # 而数据仓要跟踪的恰恰是这些路径
        add = _git(["add", "-f", "--", *paths])
        if add.returncode != 0:
            print(f"[warn] git add 失败: {add.stderr.strip()[:200]}", file=sys.stderr)
            return False
        # 无变更时 commit 返回 1，属正常情况，不当作错误
        done = _git(["commit", "-q", "-m", message])
        if done.returncode != 0 and "nothing to commit" not in (done.stdout + done.stderr):
            print(f"[warn] git commit 失败: {done.stderr.strip()[:200]}", file=sys.stderr)
            return False
        return True
    except subprocess.SubprocessError as err:
        print(f"[warn] 知识提交异常: {err}", file=sys.stderr)
        return False
