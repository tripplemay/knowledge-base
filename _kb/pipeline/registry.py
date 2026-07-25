"""知识域注册表：_kb/domains.yaml 的唯一读写入口。

写入纪律（域 id 会成为文件系统路径，且由文档内容间接驱动，故校验从严）：
- id 必须过白名单正则 + 保留字黑名单，非法一律拒绝而非"尽力修复"
- 写入走 flock 排他锁 + 临时文件原子替换（流水线在子进程中并发写同一文件）
- 已存在的 id 直接复用，不覆盖既有条目（幂等）
"""
from __future__ import annotations

import fcntl
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path

import yaml

KB_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = KB_ROOT / "_kb" / "domains.yaml"
LOCK_PATH = KB_ROOT / "_kb" / "domains.yaml.lock"
DOMAINS_DIR = KB_ROOT / "domains"

DOMAIN_ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
# 结构性字符（路径分隔符、控制符、上跳）出现即拒绝：这类输入是攻击而非笔误，
# 不能靠 slug 化"修复"成合法 id（../../etc/passwd → etc-passwd 会掩盖意图）
UNSAFE_RAW_RE = re.compile(r"[/\\\x00-\x1f]|\.\.")
# 与仓库顶层目录、git 内部名冲突的 id 一律拒绝
RESERVED_IDS = frozenset({
    "_kb", "kb", "web", "forge", "domains", "git", "node-modules",
    "con", "aux", "nul", "prn", "tmp", "temp", "test", "new", "none", "null",
})
SUBDIRS = ("inbox", "sources", "notes", "claims", "moc")

MAX_NAME_CHARS = 40
MAX_DESC_CHARS = 200
MAX_KEYWORDS = 12
MAX_KEYWORD_CHARS = 24


class DomainIdError(ValueError):
    """域 id 非法（长度/字符集/保留字）。"""


def normalize_domain_id(raw: str) -> str | None:
    """LLM 提议的 id → 规范 slug；无法规范化时返回 None（调用方走兜底路径）。"""
    text = str(raw or "").strip()
    if not text or UNSAFE_RAW_RE.search(text):
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if slug and slug[0].isdigit():
        slug = f"d-{slug}"
    slug = slug[:32].strip("-")
    if not slug or not DOMAIN_ID_RE.match(slug) or slug in RESERVED_IDS:
        return None
    return slug


def require_domain_id(raw: str) -> str:
    slug = normalize_domain_id(raw)
    if slug is None:
        raise DomainIdError(f"非法知识域 id: {raw!r}")
    return slug


def _clip(text: str, limit: int) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip())[:limit]


@contextmanager
def _locked():
    """跨进程排他锁：注册表读-改-写期间独占。"""
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"version": 1, "domains": {}}
    data = yaml.safe_load(REGISTRY_PATH.read_text()) or {}
    data.setdefault("version", 1)
    data.setdefault("domains", {})
    return data


def load_domains() -> dict:
    """域 id → 条目。供 load_config() 合并进 config["domains"]。"""
    return load_registry()["domains"] or {}


def _write_registry(data: dict) -> None:
    """临时文件 + rename 原子落盘（必须在 _locked() 内调用）。"""
    tmp = REGISTRY_PATH.with_suffix(".yaml.tmp")
    tmp.write_text(
        "# 知识域注册表（机器托管：_kb/pipeline/registry.py 独占写入）\n"
        "# 人工维护的模型路由/价格/翻译参数在 _kb/config.yaml。\n\n"
        + yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    )
    tmp.replace(REGISTRY_PATH)


def ensure_domain_dirs(domain_id: str) -> Path:
    """建域目录骨架（幂等）：inbox/sources/notes/claims/moc + .gitkeep。"""
    domain_id = require_domain_id(domain_id)
    root = DOMAINS_DIR / domain_id
    for sub in SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
        if not any((root / sub).iterdir()):
            (root / sub / ".gitkeep").touch()
    return root


def create_domain(domain_id: str, name: str, description: str, *,
                  origin: str = "auto", job_id: str | None = None,
                  keywords: list[str] | None = None) -> tuple[dict, bool]:
    """注册知识域并建目录骨架。

    返回 (条目, 是否新建)。id 已存在时原样返回既有条目（幂等，不覆盖）。
    """
    domain_id = require_domain_id(domain_id)
    with _locked():
        data = load_registry()
        domains = data["domains"]
        if domain_id in domains:
            ensure_domain_dirs(domain_id)
            return domains[domain_id], False
        entry = {
            "name": _clip(name, MAX_NAME_CHARS) or domain_id,
            "description": _clip(description, MAX_DESC_CHARS),
            "keywords": [
                _clip(k, MAX_KEYWORD_CHARS)
                for k in (keywords or [])[:MAX_KEYWORDS]
                if _clip(k, MAX_KEYWORD_CHARS)
            ],
            "graph_group_id": domain_id,
            "lightrag_workspace": domain_id,
            "origin": origin if origin in ("manual", "auto", "system") else "auto",
            "created_at": time.strftime("%Y-%m-%d"),
        }
        if job_id:
            entry["created_by_job"] = job_id
        domains[domain_id] = entry
        _write_registry(data)
    ensure_domain_dirs(domain_id)
    return entry, True


def domain_profile(entry: dict, domain_id: str = "") -> str:
    """域画像文本：近义域闸门的嵌入输入。"""
    parts = [entry.get("name") or domain_id, entry.get("description") or ""]
    keywords = entry.get("keywords") or []
    if keywords:
        parts.append("、".join(str(k) for k in keywords))
    return "；".join(p for p in parts if p)


def count_domains(origin: str) -> int:
    return sum(1 for e in load_domains().values() if e.get("origin") == origin)
