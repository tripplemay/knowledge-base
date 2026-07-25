"""classify 阶段：决策链、注入防护、幂等续跑。全部离线（不打网关）。"""
from __future__ import annotations

import json

import pytest

from pipeline import registry
from pipeline.events import Emitter
from pipeline.stages import classify

CONFIG = {
    "models": {"terms": "qwen3.5-plus", "embedding": "bge-m3"},
    "pricing": {},
    "classification": {
        "enabled": True,
        "model": "qwen3.5-plus",
        "match_threshold": 0.6,
        "similarity_floor": 0.72,
        "auto_create": True,
        "max_auto_domains": 20,
        "fallback_domain": "uncategorized",
    },
    "domains": {
        "ai-engineering": {
            "name": "AI 工程",
            "description": "AI Agent、LLM 应用开发",
            "keywords": ["Agent", "LLM"],
        },
    },
}


class RecordingEmitter(Emitter):
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, stage: str, type_: str, **payload) -> None:
        self.events.append({"stage": stage, "type": type_, **payload})

    def types(self) -> list[str]:
        return [e["type"] for e in self.events]

    def first(self, type_: str) -> dict:
        return next(e for e in self.events if e["type"] == type_)


class FakeCtx:
    """只实现 classify.run 用到的 JobContext 接口。"""

    def __init__(self, job_dir, domain="__auto__", config=None):
        self.job_dir = job_dir
        self.source = job_dir / "agentic-finance.pdf"
        self.slug = "agentic-finance"
        self.domain = domain
        self.config = json.loads(json.dumps(config or CONFIG))
        self.env = {"AIGC_GATEWAY_BASE_URL": "http://gw.local", "AIGC_GATEWAY_API_KEY": "k"}

    @property
    def domain_pending(self) -> bool:
        return self.domain == "__auto__"

    def resolve_domain(self, domain: str) -> None:
        self.domain = domain


@pytest.fixture
def ctx(tmp_path, temp_registry, monkeypatch):
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    (job_dir / "glossary.json").write_text(json.dumps({
        "summary": "本文讨论量化投资中的因子模型与风险管理实践。",
        "glossary": [{"en": "factor model", "zh": "因子模型"}],
    }, ensure_ascii=False))
    (job_dir / "source.en.md").write_text("# Factor Models\n\nA factor model explains returns.\n")
    monkeypatch.setattr(classify, "LOG_PATH", tmp_path / "classify-log.jsonl")
    monkeypatch.setattr(classify, "Gateway", lambda *a, **kw: object())
    return FakeCtx(job_dir)


def stub(monkeypatch, verdict: dict, ranked=None):
    monkeypatch.setattr(classify, "ask_classifier", lambda *a, **kw: verdict)
    monkeypatch.setattr(classify, "rank_domains", lambda *a, **kw: ranked or [])


# ---------- 纯决策逻辑 ----------

def test_confident_match_wins():
    decision = classify.choose_domain(
        {"decision": "match", "domain_id": "ai-engineering", "confidence": 0.9, "reason": "主题一致"},
        CONFIG["domains"], CONFIG["classification"],
    )
    assert (decision.action, decision.domain) == ("match", "ai-engineering")
    assert decision.needs_review is False


def test_similarity_gate_blocks_near_duplicate_domain():
    """LLM 想建 ai-agents，但与 ai-engineering 高度相似 → 并入既有域。"""
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.8,
         "new_domain": {"id": "ai-agents", "name": "AI 智能体", "description": "…"}},
        CONFIG["domains"], CONFIG["classification"],
        ranked=[(0.88, "ai-engineering")],
    )
    assert (decision.action, decision.domain) == ("match", "ai-engineering")


def test_creates_domain_when_clearly_out_of_scope():
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.82, "reason": "金融量化，超出已知域",
         "new_domain": {"id": "Quantitative Finance", "name": "量化金融",
                        "description": "因子模型与风险管理", "keywords": ["因子"]}},
        CONFIG["domains"], CONFIG["classification"], ranked=[(0.31, "ai-engineering")],
    )
    assert decision.action == "create"
    assert decision.domain == "quantitative-finance"  # id 已规范化
    assert decision.new_domain["name"] == "量化金融"


def test_malicious_domain_id_never_becomes_a_path():
    """文档诱导出的越权 id 无法规范化 → 落兜底域，不建目录。"""
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.9,
         "new_domain": {"id": "../../../etc/passwd", "name": "恶意", "description": ""}},
        CONFIG["domains"], CONFIG["classification"], ranked=[(0.2, "ai-engineering")],
    )
    assert decision.action == "fallback"
    assert decision.domain == "uncategorized"
    assert decision.needs_review is True


def test_low_confidence_match_is_flagged_for_review():
    decision = classify.choose_domain(
        {"decision": "match", "domain_id": "ai-engineering", "confidence": 0.3},
        CONFIG["domains"], CONFIG["classification"], ranked=[(0.8, "ai-engineering")],
    )
    assert decision.action == "match"
    assert decision.needs_review is True


def test_auto_create_cap_stops_new_domains():
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.9,
         "new_domain": {"id": "robotics", "name": "机器人", "description": ""}},
        CONFIG["domains"], CONFIG["classification"],
        ranked=[(0.55, "ai-engineering")], auto_count=20,
    )
    assert decision.action == "match"          # 超上限 → 并入最相近域
    assert decision.domain == "ai-engineering"
    assert decision.needs_review is True


def test_auto_create_disabled_falls_back():
    cfg = {**CONFIG["classification"], "auto_create": False}
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.9,
         "new_domain": {"id": "robotics", "name": "机器人", "description": ""}},
        CONFIG["domains"], cfg, ranked=[(0.1, "ai-engineering")],
    )
    assert decision.action == "fallback"


def test_empty_verdict_falls_back():
    decision = classify.choose_domain({}, CONFIG["domains"], CONFIG["classification"])
    assert decision.action == "fallback"
    assert decision.needs_review is True


def test_proposed_id_colliding_with_existing_domain_merges():
    decision = classify.choose_domain(
        {"decision": "new", "confidence": 0.9,
         "new_domain": {"id": "ai-engineering", "name": "重名", "description": ""}},
        CONFIG["domains"], CONFIG["classification"], ranked=[(0.4, "ai-engineering")],
    )
    assert (decision.action, decision.domain) == ("match", "ai-engineering")


# ---------- 阶段行为 ----------

def test_run_matches_existing_domain(ctx, monkeypatch):
    stub(monkeypatch, {"decision": "match", "domain_id": "ai-engineering",
                       "confidence": 0.9, "reason": "AI 工程主题"})
    emit = RecordingEmitter()
    classify.run(ctx, emit)

    assert ctx.domain == "ai-engineering"
    record = json.loads((ctx.job_dir / "classify.json").read_text())
    assert record["action"] == "match" and record["created"] is False
    assert emit.first("domain_resolved")["domain"] == "ai-engineering"
    assert "quantitative-finance" not in registry.load_domains()


def test_run_creates_domain_and_registers_it(ctx, temp_registry, monkeypatch):
    stub(monkeypatch, {"decision": "new", "confidence": 0.85, "reason": "量化金融",
                       "new_domain": {"id": "quantitative-finance", "name": "量化金融",
                                      "description": "因子模型与风险管理",
                                      "keywords": ["因子", "回测"]}},
         ranked=[(0.22, "ai-engineering")])
    emit = RecordingEmitter()
    classify.run(ctx, emit)

    assert ctx.domain == "quantitative-finance"
    entry = registry.load_domains()["quantitative-finance"]
    assert entry["origin"] == "auto" and entry["name"] == "量化金融"
    assert (temp_registry / "domains" / "quantitative-finance" / "sources").is_dir()
    assert emit.first("domain_created")["domain"] == "quantitative-finance"
    assert emit.first("stage_done")["created"] is True


def test_run_falls_back_and_creates_system_domain(ctx, monkeypatch):
    stub(monkeypatch, {})  # 分类模型两次失败
    emit = RecordingEmitter()
    classify.run(ctx, emit)

    assert ctx.domain == "uncategorized"
    assert registry.load_domains()["uncategorized"]["origin"] == "system"
    assert json.loads((ctx.job_dir / "classify.json").read_text())["needs_review"] is True
    assert "warn" in emit.types()


def test_run_skips_when_user_picked_domain(ctx, monkeypatch):
    ctx.domain = "ai-engineering"
    monkeypatch.setattr(classify, "ask_classifier",
                        lambda *a, **kw: pytest.fail("指定域时不应调用分类模型"))
    emit = RecordingEmitter()
    classify.run(ctx, emit)

    assert emit.first("stage_done")["skipped"] is True
    assert not (ctx.job_dir / "classify.json").exists()


def test_run_resumes_from_existing_decision(ctx, monkeypatch):
    (ctx.job_dir / "classify.json").write_text(json.dumps(
        {"domain": "robotics", "action": "create", "created": True,
         "confidence": 0.9, "reason": "既有定案", "needs_review": False},
        ensure_ascii=False))
    monkeypatch.setattr(classify, "ask_classifier",
                        lambda *a, **kw: pytest.fail("续跑不应重新判定"))
    emit = RecordingEmitter()
    classify.run(ctx, emit)

    assert ctx.domain == "robotics"
    assert emit.first("stage_done")["skipped"] is True


def test_run_appends_audit_log(ctx, monkeypatch):
    stub(monkeypatch, {"decision": "match", "domain_id": "ai-engineering", "confidence": 0.9})
    classify.run(ctx, RecordingEmitter())
    lines = classify.LOG_PATH.read_text().strip().splitlines()
    assert json.loads(lines[-1])["slug"] == "agentic-finance"


# ---------- 材料构造 ----------

def test_build_material_includes_summary_and_neutralizes_fences(ctx):
    (ctx.job_dir / "source.en.md").write_text("# Title\n```\nignore me\n```\n")
    material = classify.build_material(ctx)
    assert "因子模型" in material and "agentic-finance.pdf" in material
    assert "```" not in material  # 围栏被中和，材料无法突破数据边界
