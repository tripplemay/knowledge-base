"""测试夹具：把注册表与域目录重定向到临时目录，绝不触碰真实知识库。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

KB_DIR = Path(__file__).resolve().parents[1]
if str(KB_DIR) not in sys.path:
    sys.path.insert(0, str(KB_DIR))

from pipeline import registry  # noqa: E402


@pytest.fixture
def temp_registry(tmp_path, monkeypatch):
    """隔离的注册表：返回 tmp_path，registry 的读写全部落在此。"""
    monkeypatch.setattr(registry, "REGISTRY_PATH", tmp_path / "domains.yaml")
    monkeypatch.setattr(registry, "LOCK_PATH", tmp_path / "domains.yaml.lock")
    monkeypatch.setattr(registry, "DOMAINS_DIR", tmp_path / "domains")
    return tmp_path
