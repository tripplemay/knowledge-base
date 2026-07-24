"""Huey worker：以子进程运行流水线，JSON 事件行实时入库。

启动: cd _kb && .venv/bin/huey_consumer server.tasks.huey -w 1 -k thread
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from pathlib import Path

from huey import SqliteHuey

from . import db

KB_ROOT = Path(__file__).resolve().parents[2]
KB_DIR = KB_ROOT / "_kb"
PYTHON = KB_DIR / ".venv" / "bin" / "python"

huey = SqliteHuey(filename=str(KB_DIR / "huey.db"))


def _git_commit(paths: list[str], message: str) -> None:
    try:
        subprocess.run(["git", "add", *paths], cwd=KB_ROOT, check=True,
                       capture_output=True, timeout=60)
        subprocess.run(["git", "commit", "-q", "-m", message], cwd=KB_ROOT,
                       check=True, capture_output=True, timeout=60)
    except subprocess.SubprocessError as err:
        print(f"[warn] git commit 失败: {err}", file=sys.stderr)


@huey.task()
def run_ingest(job_id: str) -> None:
    conn = db.connect()
    job = db.get_job(conn, job_id)
    if job is None or job["status"] == "canceled":
        return
    job_dir = Path(job["job_dir"])

    # detached 进程组 + pid 落盘（取消/清扫按进程组 kill）
    proc = subprocess.Popen(
        [str(PYTHON), "-m", "pipeline.run", "--job-dir", str(job_dir)],
        cwd=KB_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, start_new_session=True,
    )
    (job_dir / "pid").write_text(str(proc.pid))
    db.set_job_status(conn, job_id, "running", pid=proc.pid)

    error_msg: str | None = None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        db.record_event(conn, job_id, event)
        if event.get("type") == "error":
            error_msg = f"[{event.get('stage')}] {event.get('msg')}"
        # 取消检查：状态被 API 置为 canceled 时杀进程组
        status = conn.execute(
            "SELECT status FROM jobs WHERE id=?", (job_id,)
        ).fetchone()["status"]
        if status == "canceled":
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            proc.wait(timeout=30)
            return

    proc.wait()
    (job_dir / "pid").unlink(missing_ok=True)

    if proc.returncode == 0:
        db.set_job_status(conn, job_id, "done")
        # 磁盘纪律：成功即清 work 目录与上传暂存
        out_rel = f"domains/{job['domain']}/sources/{job_dir.name.rsplit('-', 1)[0]}"
        _git_commit([f"domains/{job['domain']}"], f"ingest: {job['slug']}（web 上传）")
        subprocess.run(["rm", "-rf", str(job_dir)], timeout=60)
        upload_dir = Path(job["source_path"]).parent
        if upload_dir.parent == KB_DIR / "uploads":
            subprocess.run(["rm", "-rf", str(upload_dir)], timeout=60)
    else:
        stderr_tail = (proc.stderr.read() or "")[-500:]
        db.set_job_status(conn, job_id, "failed",
                          error=error_msg or stderr_tail or f"exit={proc.returncode}")


def cleanup_on_boot() -> None:
    """启动清扫：僵尸 running 任务复位为 failed，孤儿进程组回收。"""
    conn = db.connect()
    for row in conn.execute("SELECT id, job_dir FROM jobs WHERE status='running'"):
        pid_file = Path(row["job_dir"]) / "pid"
        if pid_file.exists():
            try:
                os.killpg(int(pid_file.read_text().strip()), signal.SIGTERM)
            except (ProcessLookupError, ValueError, PermissionError):
                pass
            pid_file.unlink(missing_ok=True)
        db.set_job_status(conn, row["id"], "failed", error="服务重启时任务中断（可重试续传）")


cleanup_on_boot()
