"""aigc-gateway OpenAI 兼容客户端（从 ingest.py 迁移，行为不变，增加事件上报）。"""
from __future__ import annotations

import time

import requests

from .events import Emitter


class Gateway:
    def __init__(self, env: dict[str, str], pricing: dict[str, dict],
                 emitter: Emitter | None = None, stage: str = ""):
        self.base_url = env["AIGC_GATEWAY_BASE_URL"].rstrip("/")
        self.api_key = env["AIGC_GATEWAY_API_KEY"]
        self.pricing = pricing
        self.emitter = emitter
        self.stage = stage
        self.usage: dict[str, dict[str, int]] = {}

    def chat(self, model: str, system: str, user: str,
             json_mode: bool = False, retries: int = 3) -> str:
        payload: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        last_err: Exception | None = None
        for attempt in range(retries):
            try:
                resp = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                    timeout=600,
                )
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage", {})
                in_tok = usage.get("prompt_tokens", 0)
                out_tok = usage.get("completion_tokens", 0)
                bucket = self.usage.setdefault(model, {"input": 0, "output": 0})
                bucket["input"] += in_tok
                bucket["output"] += out_tok
                if self.emitter:
                    self.emitter.usage(self.stage, model, in_tok, out_tok)
                return data["choices"][0]["message"]["content"]
            except Exception as err:  # noqa: BLE001 — 统一重试网络/解析错误
                last_err = err
                wait = 5 * (attempt + 1)
                if self.emitter:
                    self.emitter.warn(self.stage, f"API 调用失败 ({err})，{wait}s 后重试 {attempt + 1}/{retries}")
                time.sleep(wait)
        raise RuntimeError(f"API 连续失败: {last_err}")

    def last_call_usage(self) -> dict[str, dict[str, int]]:
        return self.usage

    def cost_usd(self) -> float:
        total = 0.0
        for model, used in self.usage.items():
            price = self.pricing.get(model, {"input": 0, "output": 0})
            total += used["input"] / 1e6 * price["input"]
            total += used["output"] / 1e6 * price["output"]
        return round(total, 4)
