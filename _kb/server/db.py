"""SQLite 运行态索引（可丢弃重建；文件系统才是唯一事实源）。"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "tasks.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  slug TEXT NOT NULL,
  filename TEXT NOT NULL,
  source_path TEXT NOT NULL,
  job_dir TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued|running|done|failed|canceled
  error TEXT,
  pid INTEGER,
  cost_usd REAL DEFAULT 0,
  created_at REAL NOT NULL,
  started_at REAL,
  finished_at REAL
);
CREATE TABLE IF NOT EXISTS stages (
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed|skipped
  detail TEXT,
  started_at REAL,
  finished_at REAL,
  PRIMARY KEY (job_id, name)
);
CREATE TABLE IF NOT EXISTS chunks (
  job_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  PRIMARY KEY (job_id, idx)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts REAL NOT NULL,
  stage TEXT,
  type TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_job ON events (job_id, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    try:  # v0.4: 任务类型（ingest | distill）
        conn.execute("ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'ingest'")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # 列已存在
    return conn


def insert_job(conn: sqlite3.Connection, job: dict) -> None:
    conn.execute(
        "INSERT INTO jobs (id, domain, slug, filename, source_path, job_dir, status, created_at, kind)"
        " VALUES (:id, :domain, :slug, :filename, :source_path, :job_dir, 'queued', :now, :kind)",
        {"kind": "ingest", **job, "now": time.time()},
    )
    conn.commit()


def set_job_status(conn: sqlite3.Connection, job_id: str, status: str,
                   error: str | None = None, pid: int | None = None) -> None:
    fields = {"status": status, "id": job_id}
    sql = "UPDATE jobs SET status=:status"
    if status == "running":
        sql += ", started_at=" + str(time.time())
    if status in ("done", "failed", "canceled"):
        sql += ", finished_at=" + str(time.time())
    if error is not None:
        sql += ", error=:error"
        fields["error"] = error
    if pid is not None:
        sql += ", pid=:pid"
        fields["pid"] = pid
    conn.execute(sql + " WHERE id=:id", fields)
    conn.commit()


def record_event(conn: sqlite3.Connection, job_id: str, event: dict) -> None:
    """事件入库并派生更新 stages/chunks/jobs 表。"""
    stage = event.get("stage")
    etype = event.get("type")
    conn.execute(
        "INSERT INTO events (job_id, ts, stage, type, payload) VALUES (?,?,?,?,?)",
        (job_id, event.get("ts", time.time()), stage, etype,
         json.dumps(event, ensure_ascii=False)),
    )
    if etype == "stage_start":
        conn.execute(
            "INSERT INTO stages (job_id,name,status,started_at) VALUES (?,?,'running',?)"
            " ON CONFLICT(job_id,name) DO UPDATE SET status='running', started_at=excluded.started_at",
            (job_id, stage, event.get("ts", time.time())),
        )
    elif etype == "stage_done":
        status = "skipped" if event.get("skipped") else "done"
        detail = json.dumps({k: v for k, v in event.items()
                             if k not in ("ts", "stage", "type")}, ensure_ascii=False)
        conn.execute(
            "INSERT INTO stages (job_id,name,status,detail,finished_at) VALUES (?,?,?,?,?)"
            " ON CONFLICT(job_id,name) DO UPDATE SET status=excluded.status,"
            " detail=excluded.detail, finished_at=excluded.finished_at",
            (job_id, stage, status, detail, event.get("ts", time.time())),
        )
    elif etype == "chunk_done":
        conn.execute(
            "INSERT INTO chunks (job_id, idx, status, model, input_tokens, output_tokens)"
            " VALUES (?,?,'done',?,?,?)"
            " ON CONFLICT(job_id,idx) DO UPDATE SET status='done', model=excluded.model,"
            " input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens",
            (job_id, event.get("idx", 0), event.get("model"),
             event.get("input", 0), event.get("output", 0)),
        )
    elif etype == "usage":
        conn.execute(
            "UPDATE jobs SET cost_usd = cost_usd + ? WHERE id=?",
            (estimate_cost(event), job_id),
        )
    elif etype == "error":
        conn.execute(
            "UPDATE stages SET status='failed', detail=? WHERE job_id=? AND name=?",
            (event.get("msg", ""), job_id, stage),
        )
    conn.commit()


_PRICING_CACHE: dict | None = None


def estimate_cost(event: dict) -> float:
    global _PRICING_CACHE
    if _PRICING_CACHE is None:
        import yaml
        cfg_path = Path(__file__).resolve().parents[1] / "config.yaml"
        _PRICING_CACHE = (yaml.safe_load(cfg_path.read_text()) or {}).get("pricing", {})
    price = _PRICING_CACHE.get(event.get("model", ""), {"input": 0, "output": 0})
    return (event.get("input", 0) / 1e6 * price["input"]
            + event.get("output", 0) / 1e6 * price["output"])


def get_job(conn: sqlite3.Connection, job_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        return None
    job = dict(row)
    job["stages"] = [dict(r) for r in conn.execute(
        "SELECT name,status,detail,started_at,finished_at FROM stages WHERE job_id=?", (job_id,))]
    job["chunks"] = [dict(r) for r in conn.execute(
        "SELECT idx,status,model,input_tokens,output_tokens FROM chunks WHERE job_id=? ORDER BY idx", (job_id,))]
    return job


def list_jobs(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT id,domain,slug,filename,status,error,cost_usd,created_at,started_at,finished_at,kind"
        " FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))]
