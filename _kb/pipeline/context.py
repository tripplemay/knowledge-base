"""JobContext：一次摄取任务的目录、配置与元信息。"""
from __future__ import annotations

import time
from pathlib import Path

import yaml

KB_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = KB_ROOT / "_kb" / "config.yaml"
ENV_PATH = KB_ROOT / "_kb" / ".env"
WORK_ROOT = KB_ROOT / "_kb" / "work"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    missing = {"AIGC_GATEWAY_BASE_URL", "AIGC_GATEWAY_API_KEY"} - env.keys()
    if missing:
        raise RuntimeError(f"缺少环境变量: {missing} (检查 {ENV_PATH})")
    return env


def load_config() -> dict:
    return yaml.safe_load(CONFIG_PATH.read_text())


class JobContext:
    """job 目录布局：
    job.yaml            任务定义（source/domain/slug/date）
    source.en.md        parse 产物（解析出的英文 Markdown）
    parser.txt          parse 使用的解析器名
    glossary.json       glossary 产物（summary + terms + usage）
    chunks/NNNN.src.md  parse 产物（分块原文）
    chunks/NNNN.zh.md   translate 产物（分块译文，块级 checkpoint）
    chunks/NNNN.usage.json  每块 token 用量
    """

    def __init__(self, job_dir: Path):
        self.job_dir = Path(job_dir).resolve()
        spec = yaml.safe_load((self.job_dir / "job.yaml").read_text())
        self.source = Path(spec["source"])
        self.domain = spec["domain"]
        self.slug = spec["slug"]
        self.date = spec["date"]
        self.config = load_config()
        self.env = load_env()
        if self.domain not in self.config["domains"]:
            raise RuntimeError(f"未注册的知识域: {self.domain}")

    @property
    def chunks_dir(self) -> Path:
        return self.job_dir / "chunks"

    @property
    def out_dir(self) -> Path:
        return (
            KB_ROOT / "domains" / self.domain / "sources" / f"{self.date}-{self.slug}"
        )

    def src_chunks(self) -> list[Path]:
        return sorted(self.chunks_dir.glob("*.src.md"))

    def zh_chunk_path(self, src: Path) -> Path:
        return src.with_name(src.name.replace(".src.md", ".zh.md"))

    def usage_path(self, src: Path) -> Path:
        return src.with_name(src.name.replace(".src.md", ".usage.json"))


def create_job(source: Path, domain: str, slug: str, job_id: str | None = None,
               layout: bool = True) -> Path:
    """创建 job 目录与 job.yaml，返回 job 目录路径。"""
    date = time.strftime("%Y-%m-%d")
    job_id = job_id or f"{date}-{slug}-{int(time.time())}"
    job_dir = WORK_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "job.yaml").write_text(
        yaml.safe_dump(
            {
                "source": str(Path(source).resolve()),
                "domain": domain,
                "slug": slug,
                "date": date,
                "layout": layout,
            },
            allow_unicode=True,
        )
    )
    return job_dir
