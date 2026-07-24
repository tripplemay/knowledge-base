"""PDF 工具：qpdf 线性化（Fast Web View）——首页可在完整下载前渲染。"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def qpdf_bin() -> str | None:
    return shutil.which("qpdf") or (
        "/opt/homebrew/bin/qpdf" if Path("/opt/homebrew/bin/qpdf").exists() else None
    )


def linearize(pdf: Path) -> bool:
    """原地线性化；qpdf 不可用或失败时保持原文件不变，返回是否成功。"""
    qpdf = qpdf_bin()
    if qpdf is None or not pdf.exists():
        return False
    tmp = pdf.with_suffix(".linearized.tmp.pdf")
    try:
        subprocess.run(
            [qpdf, "--linearize", str(pdf), str(tmp)],
            check=True, capture_output=True, timeout=600,
        )
        tmp.replace(pdf)
        return True
    except subprocess.SubprocessError:
        tmp.unlink(missing_ok=True)
        return False
