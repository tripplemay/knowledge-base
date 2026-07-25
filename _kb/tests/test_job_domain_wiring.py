"""待定域的端到端接线：job.yaml 哨兵 → classify 回写 → SQLite 任务行更新。"""
from __future__ import annotations

import json

import pytest
import yaml

from pipeline.context import AUTO_DOMAIN, JobContext, create_job


@pytest.fixture
def job_dir(tmp_path, monkeypatch):
    from pipeline import context

    monkeypatch.setattr(context, "WORK_ROOT", tmp_path / "work")
    source = tmp_path / "paper.pdf"
    source.write_text("x")
    return create_job(source, AUTO_DOMAIN, "paper", job_id="job-1")


def test_context_accepts_pending_domain(job_dir, monkeypatch):
    """哨兵域不做注册表校验，否则 classify 之前任务就崩了。"""
    monkeypatch.setattr("pipeline.context.load_env", lambda: {"AIGC_GATEWAY_BASE_URL": "x",
                                                              "AIGC_GATEWAY_API_KEY": "y"})
    ctx = JobContext(job_dir)
    assert ctx.domain_pending is True


def test_unknown_domain_still_rejected(job_dir, monkeypatch):
    monkeypatch.setattr("pipeline.context.load_env", lambda: {"AIGC_GATEWAY_BASE_URL": "x",
                                                              "AIGC_GATEWAY_API_KEY": "y"})
    spec = yaml.safe_load((job_dir / "job.yaml").read_text())
    spec["domain"] = "no-such-domain"
    (job_dir / "job.yaml").write_text(yaml.safe_dump(spec, allow_unicode=True))
    with pytest.raises(RuntimeError, match="未注册的知识域"):
        JobContext(job_dir)


def test_resolve_domain_rewrites_job_yaml(job_dir, monkeypatch):
    """定案必须落盘：重试续跑时 JobContext 直接读到真实域。"""
    monkeypatch.setattr("pipeline.context.load_env", lambda: {"AIGC_GATEWAY_BASE_URL": "x",
                                                              "AIGC_GATEWAY_API_KEY": "y"})
    ctx = JobContext(job_dir)
    ctx.resolve_domain("ai-engineering")

    assert yaml.safe_load((job_dir / "job.yaml").read_text())["domain"] == "ai-engineering"
    assert ctx.domain_pending is False
    assert ctx.out_dir.parent.parent.name == "ai-engineering"
    assert not (job_dir / "job.yaml.tmp").exists()


def test_domain_resolved_event_updates_job_row(tmp_path, monkeypatch):
    from server import db

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "tasks.db")
    conn = db.connect()
    db.insert_job(conn, {"id": "job-1", "domain": AUTO_DOMAIN, "slug": "paper",
                         "filename": "paper.pdf", "source_path": "/tmp/paper.pdf",
                         "job_dir": str(tmp_path / "job-1")})

    db.record_event(conn, "job-1", {
        "stage": "classify", "type": "domain_resolved",
        "domain": "quantitative-finance", "created": True, "confidence": 0.85,
    })

    assert db.get_job(conn, "job-1")["domain"] == "quantitative-finance"
    payload = json.loads(conn.execute(
        "SELECT payload FROM events WHERE job_id='job-1'").fetchone()["payload"])
    assert payload["created"] is True
