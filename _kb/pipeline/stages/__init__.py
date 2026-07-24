"""Stage 注册表：有序阶段链。Phase 3/4（蒸馏/图谱同步/仲裁）以"后继 Job"挂接，不加长此链。"""
from . import assemble, glossary, parse, translate

STAGES = [
    ("parse", parse.run),
    ("glossary", glossary.run),
    ("translate", translate.run),
    ("assemble", assemble.run),
]

STAGE_NAMES = [name for name, _ in STAGES]
