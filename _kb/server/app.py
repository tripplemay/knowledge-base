"""FastAPI 摄取服务：上传 / jobs / SSE 进度 / 取消重试。

启动: cd _kb && .venv/bin/uvicorn server.app:app --port 8794
鉴权: 设置 KB_API_TOKEN 环境变量（_kb/.env）即要求 X-KB-Token 头；未设置则放行（单用户期 no-op）。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import signal
import time
from pathlib import Path

import aiofiles
from fastapi import Depends, FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from pipeline.context import create_job, load_config, load_env
from . import db
from .tasks import run_ingest

KB_DIR = Path(__file__).resolve().parents[1]
UPLOAD_ROOT = KB_DIR / "uploads"
ALLOWED_EXT = {".pdf", ".md", ".txt"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
CHUNK = 1024 * 1024

app = FastAPI(title="KnowledgeBase Ingest API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3456"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_token(x_kb_token: str | None = Header(default=None)) -> None:
    expected = load_env().get("KB_API_TOKEN") or os.environ.get("KB_API_TOKEN")
    if expected and x_kb_token != expected:
        raise HTTPException(401, "无效 token")


def envelope(data=None, error: str | None = None) -> dict:
    return {"success": error is None, "data": data, "error": error}


@app.post("/api/v1/jobs", dependencies=[Depends(require_token)])
async def create_ingest_job(file: UploadFile, domain: str = Form(...),
                            slug: str | None = Form(default=None),
                            layout: bool = Form(default=True)) -> dict:
    config = load_config()
    if domain not in config["domains"]:
        raise HTTPException(400, f"未注册的知识域: {domain}")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的文件类型: {suffix}（允许 {sorted(ALLOWED_EXT)}）")

    # 流式落盘 + 同步计算 sha256
    safe_name = re.sub(r"[^\w.\-一-鿿]", "_", Path(file.filename).name)
    tmp_path = UPLOAD_ROOT / f".uploading-{int(time.time() * 1000)}"
    UPLOAD_ROOT.mkdir(exist_ok=True)
    hasher = hashlib.sha256()
    size = 0
    async with aiofiles.open(tmp_path, "wb") as out:
        while chunk := await file.read(CHUNK):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                await out.close()
                tmp_path.unlink(missing_ok=True)
                raise HTTPException(413, "文件超过 200MB 上限")
            hasher.update(chunk)
            await out.write(chunk)
    sha = hasher.hexdigest()
    dest_dir = UPLOAD_ROOT / sha
    dest_dir.mkdir(exist_ok=True)
    source_path = dest_dir / safe_name
    tmp_path.rename(source_path)

    slug = slug or re.sub(r"[^a-z0-9]+", "-", Path(safe_name).stem.lower()).strip("-")[:60]
    job_dir = create_job(source_path, domain, slug, layout=layout)
    job_id = job_dir.name

    conn = db.connect()
    if conn.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone():
        raise HTTPException(409, f"任务已存在: {job_id}")
    db.insert_job(conn, {
        "id": job_id, "domain": domain, "slug": slug,
        "filename": safe_name, "source_path": str(source_path),
        "job_dir": str(job_dir),
    })
    run_ingest(job_id)
    return envelope({"id": job_id, "sha256": sha, "size": size})


@app.get("/api/v1/jobs", dependencies=[Depends(require_token)])
def get_jobs() -> dict:
    return envelope(db.list_jobs(db.connect()))


@app.get("/api/v1/jobs/{job_id}", dependencies=[Depends(require_token)])
def get_job(job_id: str) -> dict:
    job = db.get_job(db.connect(), job_id)
    if job is None:
        raise HTTPException(404, "任务不存在")
    return envelope(job)


@app.post("/api/v1/jobs/{job_id}/cancel", dependencies=[Depends(require_token)])
def cancel_job(job_id: str) -> dict:
    conn = db.connect()
    job = db.get_job(conn, job_id)
    if job is None:
        raise HTTPException(404, "任务不存在")
    if job["status"] not in ("queued", "running"):
        raise HTTPException(400, f"当前状态不可取消: {job['status']}")
    db.set_job_status(conn, job_id, "canceled")
    if job.get("pid"):
        try:
            os.killpg(job["pid"], signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    return envelope({"id": job_id, "status": "canceled"})


@app.post("/api/v1/jobs/{job_id}/retry", dependencies=[Depends(require_token)])
def retry_job(job_id: str) -> dict:
    conn = db.connect()
    job = db.get_job(conn, job_id)
    if job is None:
        raise HTTPException(404, "任务不存在")
    if job["status"] not in ("failed", "canceled"):
        raise HTTPException(400, f"当前状态不可重试: {job['status']}")
    if not Path(job["job_dir"]).exists():
        raise HTTPException(410, "工作目录已清理，请重新上传")
    db.set_job_status(conn, job_id, "queued")
    run_ingest(job_id)
    return envelope({"id": job_id, "status": "queued"})


@app.get("/api/v1/kg/graph", dependencies=[Depends(require_token)])
def kg_graph(domain: str, max_nodes: int = 300) -> dict:
    from . import kg
    try:
        return envelope(kg.load_graph(domain, min(max_nodes, 800)))
    except FileNotFoundError as err:
        raise HTTPException(404, str(err)) from err


@app.post("/api/v1/kg/query", dependencies=[Depends(require_token)])
async def kg_query(payload: dict) -> dict:
    from . import kg
    domain = payload.get("domain", "")
    question = str(payload.get("question", "")).strip()
    if not domain or len(question) < 4:
        raise HTTPException(400, "需要 domain 与至少 4 字符的 question")
    answer = await kg.semantic_query(domain, question)
    return envelope({"answer": answer})


@app.get("/api/v1/jobs/{job_id}/events", dependencies=[Depends(require_token)])
async def job_events(job_id: str, last_event_id: str | None = Header(default=None)):
    """SSE：断线用 Last-Event-ID 补发；任务终态后发送 done 并结束。"""
    conn = db.connect()
    if not conn.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone():
        raise HTTPException(404, "任务不存在")
    cursor = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

    async def stream():
        nonlocal cursor
        while True:
            rows = conn.execute(
                "SELECT id, payload FROM events WHERE job_id=? AND id>? ORDER BY id LIMIT 100",
                (job_id, cursor),
            ).fetchall()
            for row in rows:
                cursor = row["id"]
                yield {"id": str(row["id"]), "event": "message", "data": row["payload"]}
            status = conn.execute(
                "SELECT status FROM jobs WHERE id=?", (job_id,)
            ).fetchone()["status"]
            if status in ("done", "failed", "canceled") and not rows:
                yield {"event": "end", "data": json.dumps({"status": status})}
                return
            await asyncio.sleep(1)

    return EventSourceResponse(stream())
