#!/usr/bin/env python3
"""LightRAG 文档层同步（Phase 3b）：把域内文档的中文全文入库，供语义检索与图谱。

用法:
    _kb/.venv/bin/python _kb/scripts/engine_sync.py --domain ai-engineering [--query "测试问题"]

存储: _kb/engines/lightrag/<域>/（嵌入式：JSON KV + NetworkX + nano-vectordb，可整目录删除重建）
模型: 走 aigc-gateway —— 抽取/问答 deepseek-v4-flash，嵌入 bge-m3（见 config.yaml models）
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.context import KB_ROOT, load_config, load_env  # noqa: E402

ENGINE_ROOT = KB_ROOT / "_kb" / "engines" / "lightrag"


def build_rag(domain: str, config: dict, env: dict):
    from lightrag import LightRAG
    from lightrag.llm.openai import openai_complete_if_cache, openai_embed
    from lightrag.utils import EmbeddingFunc

    base_url = env["AIGC_GATEWAY_BASE_URL"]
    api_key = env["AIGC_GATEWAY_API_KEY"]
    llm_model = config["models"]["translation"]
    embed_model = config["models"]["embedding"]

    async def llm_func(prompt, system_prompt=None, history_messages=[], **kwargs):
        kwargs.pop("keyword_extraction", None)
        return await openai_complete_if_cache(
            llm_model, prompt, system_prompt=system_prompt,
            history_messages=history_messages,
            base_url=base_url, api_key=api_key, **kwargs,
        )

    async def embed_func(texts: list[str]):
        return await openai_embed(
            texts, model=embed_model, base_url=base_url, api_key=api_key,
        )

    workspace = ENGINE_ROOT / domain
    workspace.mkdir(parents=True, exist_ok=True)
    return LightRAG(
        working_dir=str(workspace),
        llm_model_func=llm_func,
        llm_model_max_async=3,  # 网关并发保守，避免 429
        embedding_func=EmbeddingFunc(
            embedding_dim=1024, max_token_size=8192, func=embed_func,
        ),
    )


async def sync_domain(domain: str, config: dict, env: dict) -> None:
    from lightrag.kg.shared_storage import initialize_pipeline_status

    rag = build_rag(domain, config, env)
    await rag.initialize_storages()
    await initialize_pipeline_status()

    sources_dir = KB_ROOT / "domains" / domain / "sources"
    synced_marker = ENGINE_ROOT / domain / ".synced"
    synced = set(synced_marker.read_text().splitlines()) if synced_marker.exists() else set()

    for doc_dir in sorted(sources_dir.iterdir()):
        zh = doc_dir / "zh.md"
        if not zh.exists() or doc_dir.name in synced:
            continue
        print(f"入库: {doc_dir.name}")
        await rag.ainsert(zh.read_text(), file_paths=[f"{domain}/sources/{doc_dir.name}"])
        synced.add(doc_dir.name)
        synced_marker.write_text("\n".join(sorted(synced)) + "\n")
    await rag.finalize_storages()
    print(f"完成，已同步 {len(synced)} 份文档")


async def query_domain(domain: str, question: str, config: dict, env: dict) -> None:
    from lightrag import QueryParam
    from lightrag.kg.shared_storage import initialize_pipeline_status

    rag = build_rag(domain, config, env)
    await rag.initialize_storages()
    await initialize_pipeline_status()
    answer = await rag.aquery(question, param=QueryParam(mode="hybrid"))
    print(answer)
    await rag.finalize_storages()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", required=True)
    parser.add_argument("--query", default=None)
    args = parser.parse_args()
    config, env = load_config(), load_env()
    if args.query:
        asyncio.run(query_domain(args.domain, args.query, config, env))
    else:
        asyncio.run(sync_domain(args.domain, config, env))


if __name__ == "__main__":
    main()
