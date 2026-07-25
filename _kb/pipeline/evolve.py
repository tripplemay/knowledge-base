"""知识演化（Phase 4）：claim 抽取 → 写入期仲裁 → 应用/人审队列。

业界共识模式（设计方案 v0.2 需求4）：
- claim 级仲裁：新断言入库前与本域既有断言比对，LLM 判定 ADD/UPDATE/INVALIDATE/NOOP
- 失效不删除：UPDATE 自动应用（旧断言 invalid_at + superseded_by）；
  INVALIDATE（矛盾）进 forge/review-queue/ 人审，批准后才生效
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import yaml

from .context import KB_ROOT
from .gateway import Gateway

REVIEW_QUEUE = KB_ROOT / "forge" / "review-queue"

EXTRACT_SYSTEM = (
    "你是知识断言抽取专家。从给定的中文文档分块中抽取可被未来新知识推翻或更新的原子命题（claim）。\n"
    "要求：\n"
    "1. 每条 statement 自包含（含时间/主体/数值），不依赖上下文即可判断真伪\n"
    "2. type ∈ statistic | judgment | prediction | definition\n"
    "3. 只抽取有复用价值的：数据、结论性判断、预测、关键定义；每块 0-4 条，宁缺毋滥\n"
    "4. id 用 claim- 开头的具体 kebab-case 英文 slug\n"
    '输出 JSON：{"claims": [{"id": "claim-...", "statement": "...", "type": "...", "confidence": "high|medium|low"}]}'
)

VERDICT_SYSTEM = (
    "你是知识库演化仲裁者。判定「新断言」与「既有断言」的关系：\n"
    "- ADD：谈论不同事实，可共存\n"
    "- UPDATE：同一事实的更新版本（更新数据/更新时间点），新断言应取代旧断言\n"
    "- INVALIDATE：直接矛盾（不可同真），新断言若可信则旧断言应失效\n"
    "- NOOP：与某条既有断言重复，无新信息\n"
    '输出 JSON：{"verdict": "ADD|UPDATE|INVALIDATE|NOOP", "target": "旧断言id或null", "rationale": "≤80字理由"}'
)


def parse_frontmatter(path: Path) -> tuple[dict, str]:
    text = path.read_text()
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if not match:
        return {}, text
    return yaml.safe_load(match.group(1)) or {}, match.group(2)


def write_claim(claims_dir: Path, meta: dict, body: str = "") -> Path:
    path = claims_dir / f"{meta['id']}.md"
    path.write_text(f"---\n{yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)}---\n\n{body}".rstrip() + "\n")
    return path


def load_active_claims(domain: str) -> list[dict]:
    claims_dir = KB_ROOT / "domains" / domain / "claims"
    result = []
    if not claims_dir.exists():
        return result
    for path in sorted(claims_dir.glob("*.md")):
        meta, body = parse_frontmatter(path)
        if meta.get("id") and not meta.get("invalid_at"):
            result.append({**meta, "_path": str(path), "_body": body})
    return result


def parse_json_block(raw: str) -> dict:
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned.strip(), flags=re.MULTILINE)
    start = cleaned.find("{")
    return json.loads(cleaned[start:cleaned.rfind("}") + 1])


def extract_claims(doc_dir: Path, gw: Gateway, model: str,
                   progress_cb=None) -> list[dict]:
    """按 bilingual.md 的 blk 分块抽取，claims 自动携带块指针。"""
    bilingual = (doc_dir / "bilingual.md").read_text()
    blocks = re.split(r"<!-- (blk:\d{4}) -->", bilingual)[1:]
    pairs = [(blocks[i], blocks[i + 1]) for i in range(0, len(blocks), 2)]
    summary = ""
    meta_path = doc_dir / "meta.yaml"
    if meta_path.exists():
        summary = (yaml.safe_load(meta_path.read_text()) or {}).get("summary", "")

    claims = []
    for idx, (blk_id, content) in enumerate(pairs):
        zh_part = "\n".join(
            line for line in content.splitlines() if not line.startswith(">")
        ).strip()[:12000]
        raw = gw.chat(model, f"{EXTRACT_SYSTEM}\n\n## 文档摘要\n{summary}",
                      f"## 分块 {blk_id}\n{zh_part}", json_mode=True)
        try:
            for c in parse_json_block(raw).get("claims", []):
                if c.get("id") and c.get("statement"):
                    claims.append({**c, "blocks": [blk_id]})
        except (json.JSONDecodeError, ValueError):
            pass
        if progress_cb:
            progress_cb(idx + 1, len(pairs))
    return claims


def embed_statements(texts: list[str], env: dict, model: str) -> list[list[float]]:
    import requests
    resp = requests.post(
        f"{env['AIGC_GATEWAY_BASE_URL'].rstrip('/')}/embeddings",
        headers={"Authorization": f"Bearer {env['AIGC_GATEWAY_API_KEY']}"},
        json={"model": model, "input": texts, "encoding_format": "float"},
        timeout=120,
    )
    resp.raise_for_status()
    return [d["embedding"] for d in resp.json()["data"]]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb + 1e-9)


def arbitrate(domain: str, new_claims: list[dict], source_doc: str,
              gw: Gateway, config: dict, env: dict,
              progress_cb=None) -> dict:
    """仲裁并应用。返回统计 {added, updated, queued, noop}。"""
    existing = load_active_claims(domain)
    claims_dir = KB_ROOT / "domains" / domain / "claims"
    claims_dir.mkdir(parents=True, exist_ok=True)
    model = config["models"]["arbitration"]
    embed_model = config["models"]["embedding"]
    today = time.strftime("%Y-%m-%d")

    ex_vecs = (
        embed_statements([c["statement"] for c in existing], env, embed_model)
        if existing else []
    )
    stats = {"added": 0, "updated": 0, "queued": 0, "noop": 0}

    for idx, claim in enumerate(new_claims):
        meta = {
            "id": claim["id"], "statement": claim["statement"],
            "type": claim.get("type", "judgment"),
            "source": source_doc, "blocks": claim.get("blocks", []),
            "valid_from": today, "invalid_at": None, "superseded_by": None,
            "confidence": claim.get("confidence", "medium"),
        }
        # 同 id 冲突时加后缀
        if (claims_dir / f"{meta['id']}.md").exists():
            meta["id"] = f"{meta['id']}-{today.replace('-', '')}"

        related = []
        if existing:
            vec = embed_statements([claim["statement"]], env, embed_model)[0]
            scored = sorted(
                ((cosine(vec, ev), c) for ev, c in zip(ex_vecs, existing)),
                key=lambda t: t[0], reverse=True,
            )
            related = [(s, c) for s, c in scored[:5] if s > 0.45]

        if not related:
            write_claim(claims_dir, meta)
            stats["added"] += 1
        else:
            listing = "\n".join(
                f"- id={c['id']} | {c['statement']}" for _, c in related
            )
            raw = gw.chat(model, VERDICT_SYSTEM,
                          f"## 新断言\n{claim['statement']}\n\n## 既有断言（相关度排序）\n{listing}",
                          json_mode=True)
            try:
                verdict = parse_json_block(raw)
            except (json.JSONDecodeError, ValueError):
                verdict = {"verdict": "ADD", "target": None, "rationale": "仲裁解析失败，保守按 ADD"}
            kind = verdict.get("verdict", "ADD")
            target = next((c for _, c in related if c["id"] == verdict.get("target")), None)

            if kind == "NOOP":
                stats["noop"] += 1
            elif kind == "UPDATE" and target:
                write_claim(claims_dir, meta)
                t_meta = {k: v for k, v in target.items() if not k.startswith("_")}
                t_meta["invalid_at"] = today
                t_meta["superseded_by"] = meta["id"]
                write_claim(claims_dir, t_meta, target["_body"].strip())
                stats["updated"] += 1
            elif kind == "INVALIDATE" and target:
                write_claim(claims_dir, meta)  # 新知识先入库；旧断言失效待人审
                REVIEW_QUEUE.mkdir(parents=True, exist_ok=True)
                item = {
                    "id": f"rq-{int(time.time())}-{stats['queued']}",
                    "type": "invalidate", "status": "pending",
                    "domain": domain, "created": today,
                    "old_claim": target["id"], "old_statement": target["statement"],
                    "new_claim": meta["id"], "new_statement": meta["statement"],
                    "rationale": verdict.get("rationale", ""),
                }
                (REVIEW_QUEUE / f"{item['id']}.yaml").write_text(
                    yaml.safe_dump(item, allow_unicode=True, sort_keys=False)
                )
                stats["queued"] += 1
            else:
                write_claim(claims_dir, meta)
                stats["added"] += 1
        if progress_cb:
            progress_cb(idx + 1, len(new_claims))
    return stats
