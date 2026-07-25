# KnowledgeBase — 个人 AI-native 知识库

以纯 Markdown 文件为唯一事实源、由 Claude Code agents 驱动整理的个人知识库。

- **设计方案**：`~/Doc/kb-design-proposal.md`（v0.4，2026-07-24 更新）
- **Agent 操作规则**：[AGENTS.md](AGENTS.md)
- **系统配置**：[_kb/config.yaml](_kb/config.yaml)（模型路由、分类参数、翻译参数）
- **知识域注册表**：[_kb/domains.yaml](_kb/domains.yaml)（机器托管，classify 阶段自动写入）

## 快速使用

```bash
# 摄取一份新文档（解析→术语表→域判定→中文翻译→双语对照）
cd ~/project/KnowledgeBase
_kb/.venv/bin/python _kb/scripts/ingest.py <文件.pdf>            # 域自动判定（未知领域自动建域）
_kb/.venv/bin/python _kb/scripts/ingest.py <文件.pdf> --domain ai-engineering  # 或手动指定

# PDF 追加生成保版式中文/双语 PDF（zh.pdf + dual.pdf）
_kb/.venv/bin/python _kb/scripts/layout_translate.py domains/ai-engineering/sources/<文档目录>
```

产物在 `domains/<域>/sources/<日期-slug>/`：

| 文件 | 内容 |
|---|---|
| `source.pdf` | 原件 |
| `source.en.md` | 解析出的英文 Markdown |
| `zh.md` | **中文全文** |
| `bilingual.md` | 段落级双语对照（`<!-- blk:NNNN -->` 稳定块 ID，供溯源引用） |
| `terms.csv` | 本文档术语表（BabelDOC 兼容格式） |
| `meta.yaml` | 来源、sha256、模型、token 用量、成本、摘要、`domain_decision`（自动判定留痕） |

## 知识域自动判定

上传/摄取时不指定域，`classify` 阶段按文档内容归类；不属于任何已知域时自动创建新域。

- **判定材料**：中文摘要 + 术语表 + 章节标题 + 正文开头（复用 glossary 产物，额外成本约 $0.001/篇）
- **防近义域**：LLM 置信度门槛 → bge-m3 相似度闸门（≥ `similarity_floor` 并入既有域）→ `max_auto_domains` 上限
- **兜底**：判定失败或超限的文档进 `uncategorized` 域并标记 `needs_review`，不静默归错
- **参数**：`_kb/config.yaml` 的 `classification:` 段；新域自动写入 `_kb/domains.yaml`（`origin: auto`）
- **复核**：任务详情页显示判定理由/置信度；`_kb/scripts/kb_health.py` 汇总空域与待复核项

## 路线图

- [x] Phase 1 摄取与翻译流水线
- [x] Phase 2 Web 阅读界面 MVP（web/，`cd web && yarn dev` → http://localhost:3456）
- [x] 服务化迁移（v0.3）：web 上传 → FastAPI(:8794)+Huey 服务端流水线，任务中心与 SSE 进度
- [ ] Phase 3 整理 agents（distill/organize）+ LightRAG + Graphiti 双引擎
- [ ] Phase 4 知识演化（claim 仲裁 + review-queue + 夜间体检）
- [ ] Phase 5 知识锻造（kb-forge）+ MCP server 化

## 摄取服务（v0.3 服务化）

- **Web 上传**：http://localhost:3456/admin/kb/upload （任务中心 /admin/kb/jobs 看进度）
- **服务**：FastAPI `:8794`（上传/任务/SSE）+ Huey worker，launchd 保活（`_kb/deploy/install-launchd.sh`，卸载加 `uninstall` 参数）
- **CLI 仍可用**：`_kb/.venv/bin/python _kb/scripts/ingest.py <文件> --domain <域>`（与服务端同一套 stage 链，块级断点续传）
- **单阶段调试**：`cd _kb && .venv/bin/python -m pipeline.run --job-dir work/<job> --stage translate --pretty`
