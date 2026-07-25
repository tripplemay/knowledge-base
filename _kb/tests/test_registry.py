"""域注册表：id 校验（域 id 会成为目录名，是唯一被文档内容间接驱动的路径）与并发写。"""
from __future__ import annotations

import pytest
import yaml

from pipeline import registry


@pytest.mark.parametrize("raw,expected", [
    ("quantitative-finance", "quantitative-finance"),
    ("Quantitative Finance", "quantitative-finance"),
    ("  Clinical_Medicine  ", "clinical-medicine"),
    ("robotics!!!", "robotics"),
    ("2026-outlook", "d-2026-outlook"),
])
def test_normalize_valid(raw, expected):
    assert registry.normalize_domain_id(raw) == expected


@pytest.mark.parametrize("raw", [
    "", "   ", None,
    "../../etc/passwd",       # 路径穿越
    "..",
    "/absolute/path",
    "机器学习",                # 纯非 ASCII → 无可用 slug
    "_kb", "forge", "web", "domains",  # 保留字
    "a",                       # 过短（正则要求 ≥2）
    "x" * 40,                  # 过长但可截断 → 仍合法，见下条断言
])
def test_normalize_rejects(raw):
    result = registry.normalize_domain_id(raw)
    if raw == "x" * 40:
        assert result == "x" * 32
    else:
        assert result is None


def test_require_domain_id_raises():
    with pytest.raises(registry.DomainIdError):
        registry.require_domain_id("../evil")


def test_create_domain_writes_registry_and_dirs(temp_registry):
    entry, created = registry.create_domain(
        "quantitative-finance", "量化金融", "量化投资、因子模型与风险管理",
        origin="auto", job_id="2026-07-25-demo", keywords=["因子", "回测"],
    )
    assert created is True
    assert entry["origin"] == "auto"
    assert entry["created_by_job"] == "2026-07-25-demo"
    assert entry["lightrag_workspace"] == "quantitative-finance"

    data = yaml.safe_load((temp_registry / "domains.yaml").read_text())
    assert "quantitative-finance" in data["domains"]

    root = temp_registry / "domains" / "quantitative-finance"
    for sub in registry.SUBDIRS:
        assert (root / sub / ".gitkeep").exists()


def test_create_domain_is_idempotent(temp_registry):
    registry.create_domain("robotics", "机器人", "机器人学", origin="auto")
    entry, created = registry.create_domain("robotics", "改名尝试", "改描述尝试")
    assert created is False
    assert entry["name"] == "机器人"  # 不覆盖既有条目


def test_create_domain_rejects_illegal_id(temp_registry):
    with pytest.raises(registry.DomainIdError):
        registry.create_domain("../../etc", "恶意", "路径穿越")
    assert not (temp_registry / "domains.yaml").exists()


def test_fields_are_clipped(temp_registry):
    entry, _ = registry.create_domain(
        "biotech", "名" * 100, "描" * 500,
        keywords=["关键词" * 20] + [f"k{i}" for i in range(30)],
    )
    assert len(entry["name"]) == registry.MAX_NAME_CHARS
    assert len(entry["description"]) == registry.MAX_DESC_CHARS
    assert len(entry["keywords"]) <= registry.MAX_KEYWORDS


def test_concurrent_creates_keep_every_entry(temp_registry):
    """并发建域：flock + 读-改-写，条目不能互相覆盖。"""
    from concurrent.futures import ThreadPoolExecutor

    ids = [f"domain-{i}" for i in range(12)]
    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(lambda d: registry.create_domain(d, d, f"{d} 描述"), ids))
    assert set(registry.load_domains()) == set(ids)


def test_count_domains_by_origin(temp_registry):
    registry.create_domain("a-domain", "A", "", origin="auto")
    registry.create_domain("b-domain", "B", "", origin="manual")
    registry.create_domain("c-domain", "C", "", origin="auto")
    assert registry.count_domains("auto") == 2
    assert registry.count_domains("manual") == 1


def test_domain_profile_text(temp_registry):
    entry, _ = registry.create_domain("robotics", "机器人", "机器人学与控制",
                                      keywords=["SLAM", "运动规划"])
    profile = registry.domain_profile(entry, "robotics")
    assert "机器人" in profile and "SLAM" in profile
