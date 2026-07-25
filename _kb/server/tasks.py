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

# 流水线跑在子进程里，需要一个解释器路径：本机开发用 venv，容器里没有 venv
# （依赖装在系统 site-packages），退回当前解释器即可。KB_PYTHON 可显式覆盖。
def _resolve_python() -> Path:
    override = os.environ.get("KB_PYTHON")
    if override:
        return Path(override)
    venv_python = KB_DIR / ".venv" / "bin" / "python"
    return venv_python if venv_python.exists() else Path(sys.executable)


PYTHON = _resolve_python()

huey = SqliteHuey(filename=os.environ.get("KB_HUEY_DB") or str(KB_DIR / "huey.db"))


def _git_commit(paths: list[str], message: str) -> None:
    """知识提交写进数据仓 .kbdata.git（代码仓是公开的，不含语料）。"""
    from .vcs import commit
    commit(paths, message)


@huey.task()
def run_ingest(job_id: str) -> None:
    conn = db.connect()
    job = db.get_job(conn, job_id)
    if job is None or job["status"] == "canceled":
        return
    job_dir = Path(job["job_dir"])

    # detached 进程组 + pid 落盘（取消/清扫按进程组 kill）
    try:
        proc = subprocess.Popen(
            [str(PYTHON), "-m", "pipeline.run", "--job-dir", str(job_dir)],
            cwd=KB_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True,
        )
    except OSError as err:
        # 拉不起子进程（解释器路径错、权限不足…）时必须落终态，
        # 否则任务永远停在 queued，界面上看不出任何异常
        db.set_job_status(conn, job_id, "failed", error=f"无法启动流水线进程: {err}")
        return
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
    # 域可能被 classify 阶段改写（上传时选了自动判定），提交与派发前必须重读
    job = db.get_job(conn, job_id) or job

    if proc.returncode == 0:
        db.set_job_status(conn, job_id, "done")
        # 磁盘纪律：成功即清 work 目录与上传暂存
        _git_commit(["_kb/domains.yaml", f"domains/{job['domain']}"],
                    f"ingest: {job['slug']} → {job['domain']}（web 上传）")
        subprocess.run(["rm", "-rf", str(job_dir)], timeout=60)
        upload_dir = Path(job["source_path"]).parent
        if upload_dir.parent == KB_DIR / "uploads":
            subprocess.run(["rm", "-rf", str(upload_dir)], timeout=60)
        # 后继 Job：知识演化（claim 抽取 + 仲裁），设计方案 v0.3 挂接模式
        enqueue_distill(conn, job)
    else:
        stderr_tail = (proc.stderr.read() or "")[-500:]
        db.set_job_status(conn, job_id, "failed",
                          error=error_msg or stderr_tail or f"exit={proc.returncode}")


def enqueue_distill(conn, ingest_job: dict) -> None:
    doc_slug = None
    doc_root = KB_ROOT / "domains" / ingest_job["domain"] / "sources"
    for d in sorted(doc_root.iterdir(), reverse=True):
        if d.name.endswith(ingest_job["slug"]):
            doc_slug = d.name
            break
    if not doc_slug:
        return
    distill_id = f"distill-{ingest_job['id']}"
    if conn.execute("SELECT 1 FROM jobs WHERE id=?", (distill_id,)).fetchone():
        return
    conn.execute(
        "INSERT INTO jobs (id, domain, slug, filename, source_path, job_dir, status, created_at, kind)"
        " VALUES (?,?,?,?,?,?,'queued',?, 'distill')",
        (distill_id, ingest_job["domain"], doc_slug, ingest_job["filename"],
         str(doc_root / doc_slug), str(doc_root / doc_slug), __import__("time").time()),
    )
    conn.commit()
    run_distill(distill_id)


@huey.task()
def run_distill(job_id: str) -> None:
    """演化 Job：claim 抽取 → 仲裁 → 应用/人审队列（in-worker，事件直写 DB）。"""
    import sys as _sys
    _sys.path.insert(0, str(KB_DIR))
    from pipeline import evolve
    from pipeline.context import load_config, load_env
    from pipeline.gateway import Gateway

    conn = db.connect()
    job = db.get_job(conn, job_id)
    if job is None or job["status"] == "canceled":
        return
    db.set_job_status(conn, job_id, "running")
    config, env = load_config(), load_env()

    def emit(stage: str, type_: str, **kw) -> None:
        db.record_event(conn, job_id, {"stage": stage, "type": type_, **kw})

    try:
        emit("extract", "stage_start")
        gw = Gateway(env, config.get("pricing", {}))
        claims = evolve.extract_claims(
            Path(job["job_dir"]), gw, config["models"]["arbitration"],
            progress_cb=lambda c, t: emit("extract", "progress", current=c, total=t),
        )
        emit("extract", "stage_done", claims=len(claims))

        emit("arbitrate", "stage_start")
        stats = evolve.arbitrate(
            job["domain"], claims, job["slug"], gw, config, env,
            progress_cb=lambda c, t: emit("arbitrate", "progress", current=c, total=t),
        )
        emit("arbitrate", "stage_done", **stats)
        conn.execute("UPDATE jobs SET cost_usd = ? WHERE id=?", (gw.cost_usd(), job_id))
        _git_commit(
            [f"domains/{job['domain']}/claims", "forge/review-queue"],
            f"evolve: {job['slug']} 仲裁 +{stats['added']} ~{stats['updated']} ?{stats['queued']}",
        )
        db.set_job_status(conn, job_id, "done")
    except Exception as err:  # noqa: BLE001
        db.set_job_status(conn, job_id, "failed", error=str(err)[:500])


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
