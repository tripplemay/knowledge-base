"""知识图谱与语义检索 API 支撑（Phase 3d）：包装 LightRAG 工作区。"""
from __future__ import annotations

import sys
from pathlib import Path

KB_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KB_DIR / "scripts"))

_GRAPH_CACHE: dict[str, dict] = {}


def load_graph(domain: str, max_nodes: int = 300) -> dict:
    """graphml → {nodes, links}，按度数取前 max_nodes 个节点。"""
    cache_key = f"{domain}:{max_nodes}"
    if cache_key in _GRAPH_CACHE:
        return _GRAPH_CACHE[cache_key]
    import networkx as nx

    path = KB_DIR / "engines" / "lightrag" / domain / "graph_chunk_entity_relation.graphml"
    if not path.exists():
        raise FileNotFoundError(f"图谱不存在: {domain}")
    graph = nx.read_graphml(path)
    top = sorted(graph.degree, key=lambda kv: kv[1], reverse=True)[:max_nodes]
    keep = {n for n, _ in top}
    nodes = [
        {
            "id": n,
            "type": graph.nodes[n].get("entity_type", ""),
            "degree": d,
            "description": (graph.nodes[n].get("description") or "")[:200],
            "source": graph.nodes[n].get("file_path", ""),
        }
        for n, d in top
    ]
    links = [
        {
            "source": u,
            "target": v,
            "description": (data.get("description") or "")[:150],
            "weight": float(data.get("weight", 1)),
        }
        for u, v, data in graph.edges(data=True)
        if u in keep and v in keep
    ]
    result = {"nodes": nodes, "links": links,
              "total_nodes": graph.number_of_nodes(),
              "total_edges": graph.number_of_edges()}
    _GRAPH_CACHE[cache_key] = result
    return result


async def semantic_query(domain: str, question: str) -> str:
    from engine_sync import build_rag  # noqa: E402 — 复用同一套网关配置
    from lightrag import QueryParam
    from lightrag.kg.shared_storage import initialize_pipeline_status

    from pipeline.context import load_config, load_env

    rag = build_rag(domain, load_config(), load_env())
    await rag.initialize_storages()
    await initialize_pipeline_status()
    try:
        return await rag.aquery(question, param=QueryParam(mode="hybrid"))
    finally:
        await rag.finalize_storages()
