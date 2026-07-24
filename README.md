# KnowledgeBase — 个人 AI-native 知识库

以纯 Markdown 文件为唯一事实源、由 Claude Code agents 驱动整理的个人知识库。

- **设计方案**：`~/Doc/kb-design-proposal.md`（v0.2，2026-07-23 确认）
- **Agent 操作规则**：[AGENTS.md](AGENTS.md)
- **系统配置**：[_kb/config.yaml](_kb/config.yaml)（知识域注册、模型路由、翻译参数）

## 快速使用

```bash
# 摄取一份新文档（解析→术语表→中文翻译→双语对照）
cd ~/KnowledgeBase
_kb/.venv/bin/python _kb/scripts/ingest.py <文件.pdf> --domain ai-engineering
```

产物在 `domains/<域>/sources/<日期-slug>/`：

| 文件 | 内容 |
|---|---|
| `source.pdf` | 原件 |
| `source.en.md` | 解析出的英文 Markdown |
| `zh.md` | **中文全文** |
| `bilingual.md` | 段落级双语对照（`<!-- blk:NNNN -->` 稳定块 ID，供溯源引用） |
| `terms.csv` | 本文档术语表（BabelDOC 兼容格式） |
| `meta.yaml` | 来源、sha256、模型、token 用量、成本、摘要 |

## 路线图

- [x] Phase 1 摄取与翻译流水线
- [ ] Phase 2 Web 阅读界面 MVP
- [ ] Phase 3 整理 agents（distill/organize）+ LightRAG + Graphiti 双引擎
- [ ] Phase 4 知识演化（claim 仲裁 + review-queue + 夜间体检）
- [ ] Phase 5 知识锻造（kb-forge）+ MCP server 化
