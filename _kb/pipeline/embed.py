"""嵌入与相似度（evolve 仲裁与 classify 近义域闸门共用）。

网关约定：必须显式 encoding_format=float（否则返回 base64，反序列化会静默出错）。
"""
from __future__ import annotations


def embed_texts(texts: list[str], env: dict, model: str,
                timeout: int = 120) -> list[list[float]]:
    import requests
    resp = requests.post(
        f"{env['AIGC_GATEWAY_BASE_URL'].rstrip('/')}/embeddings",
        headers={"Authorization": f"Bearer {env['AIGC_GATEWAY_API_KEY']}"},
        json={"model": model, "input": texts, "encoding_format": "float"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return [d["embedding"] for d in resp.json()["data"]]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb + 1e-9)
