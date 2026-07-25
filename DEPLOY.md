# 部署与 CI/CD

三个容器：`web`（Next.js）+ `api`（FastAPI）+ `worker`（Huey）。
**代码在镜像里，数据在宿主机上** —— 容器无状态，可随时重建。

## 一、架构与数据边界

```
浏览器 ──HTTPS──> 反代(Caddy/nginx) ──> web:3456
                                          │  /api/v1/* 同源代理（注入 X-KB-Token）
                                          ↓
                                       api:8794 ←──── worker（同镜像，跑流水线）
                                          │
                              ${KB_DATA_DIR}（宿主机，唯一有状态的地方）
```

只有 `web` 对外暴露端口。`api` 仅在 compose 内网可达，浏览器**不能**直连它。

`${KB_DATA_DIR}` 目录结构：

| 路径 | 内容 | 容器内挂载点 |
|---|---|---|
| `domains/` | 语料与知识产物（唯一事实源） | `/kb/domains` |
| `forge/` | 知识→工程资产、人审队列 | `/kb/forge` |
| `kbdata.git/` | **知识历史仓**（worker 每次摄取成功后 commit） | `/kb/.kbdata.git` |
| `state/` | `domains.yaml`（域注册表）、`tasks.db`、`huey.db` | `/kb/state` |
| `engines/` | LightRAG 索引（可重建，但重建要花钱） | `/kb/_kb/engines` |
| `uploads/` `work/` `reports/` | 运行态中间产物 | `/kb/_kb/*` |
| `secrets/kb.env` | 网关密钥与 `KB_API_TOKEN` | `/kb/_kb/.env`（只读） |

> **为什么 `domains.yaml` / `tasks.db` / `huey.db` 放在 `state/` 而不是原位**：
> 它们是单个文件。bind-mount 单文件会踩两个坑 —— SQLite 的 `-wal`/`-shm` 边车文件
> 会落到容器内文件系统（重启即丢），注册表写入的 `tmp → rename` 跨挂载点会 EXDEV 失败。
> 因此三者都通过 `KB_REGISTRY` / `KB_TASKS_DB` / `KB_HUEY_DB` 指向挂载**目录**内。

## 二、代码仓与数据仓

代码仓是公开的，不含语料；但 AGENTS.md 要求"git 管理全部知识历史"。
两者用**同一工作区、不同 GIT_DIR** 并存：

- `.git` → 公开代码仓
- `.kbdata.git` → 知识数据仓，只跟踪 `domains/` `forge/` `domains.yaml`

写入统一走 `_kb/server/vcs.py`。初始化：`_kb/deploy/init-data-repo.sh`（幂等）。

## 三、首次上线

### 1. 服务器准备

```bash
# 装 Docker 与 compose 插件后
sudo mkdir -p /srv/kb-data/{domains,forge,state,engines,uploads,work,reports,secrets,kbdata.git}
sudo chown -R 10001:10001 /srv/kb-data      # 与容器默认 uid 一致
```

### 2. 播种数据（语料不在仓库里，必须走带外通道）

```bash
_kb/deploy/seed-data.sh user@your-vps /srv/kb-data
```

脚本会同步语料、知识历史仓、注册表与引擎索引，**但刻意不传密钥**。密钥手动放：

```bash
ssh user@your-vps 'cat > /srv/kb-data/secrets/kb.env && chmod 600 /srv/kb-data/secrets/kb.env' <<'EOF'
AIGC_GATEWAY_BASE_URL=...
AIGC_GATEWAY_API_KEY=...
KB_API_TOKEN=<openssl rand -hex 32>
EOF
```

### 3. 服务器上的 compose 参数

```bash
cd /srv/kb && cp .env.example .env && vi .env
```

`KB_API_TOKEN` 必须与 `secrets/kb.env` 里的**完全一致** —— 前者给 web 的代理注入用，
后者给 api 校验用，对不上则写侧接口全部 401。

### 4. 启动

```bash
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3456/admin/kb/domains   # 期望 200
```

### 5. 前置 HTTPS 反代

`web` 只监听本机端口，公网入口交给 Caddy：

```
kb.example.com {
    reverse_proxy 127.0.0.1:3456
    request_body { max_size 210MB }     # 大于后端 200MB 上限
}
```

SSE 无需额外配置（代理已设 `Cache-Control: no-transform` 阻止压缩缓冲）。

## 四、CI/CD

| 工作流 | 触发 | 内容 |
|---|---|---|
| `.github/workflows/ci.yml` | push / PR | 前端 tsc、KB 代码严格 tsc、eslint、`next build`；后端 pytest；两个镜像构建冒烟 + compose 校验 |
| `.github/workflows/deploy.yml` | CI 在 main 成功后 / 手动 | SSH 到服务器 `git reset --hard origin/main` → `docker compose build && up -d` → 就地验收三项；失败自动回滚到上一个提交 |

部署后的就地验收会检查：web 返回 200、摄取代理返回 200、跨站请求返回 403。任一失败即
`exit 1` 并打印容器日志。

### 需要配置的 GitHub Secrets

| 名称 | 用途 |
|---|---|
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` / `DEPLOY_PORT` | SSH 到服务器 |
| `DEPLOY_PATH` | 服务器上的代码检出目录（如 `/srv/kb`） |

> 镜像在服务器上就地构建，不经 registry —— 省掉一套凭证管理。
> 若将来构建变重、想改回 GHCR 推拉，需要 `write:packages` 的 PAT 并把包设为公开。

> `deploy.yml` 用了 `environment: production`，可在仓库设置里给它加人工审批，
> 让每次上线都需要点一下确认。

### 回滚

部署脚本在验收失败时会自动 `git reset` 回上一个提交并重建。手动回滚：

```bash
cd /srv/kb && git reset --hard <旧sha> && docker compose build && docker compose up -d
```

数据不随代码回滚（语料是唯一事实源，只进不退）。

## 五、备份

真正不可再生的是 `domains/` 与 `kbdata.git/`（`engines/` 可重建，但要花钱重跑嵌入）：

```bash
# 建议加进 crontab
tar -czf /backup/kb-$(date +%F).tar.gz -C /srv/kb-data domains forge kbdata.git state/domains.yaml
```

## 六、已知限制

- **macOS 本地跑 compose**：`KB_DATA_DIR` 不能放在 `/tmp`（Docker Desktop 的文件共享
  不覆盖 `/private/tmp`，挂载会静默为空目录）。放 `$HOME` 下即可。
- **容器 uid**：默认 10001。宿主数据目录属主不一致时容器无法写入，症状是
  `sqlite3.OperationalError: unable to open database file`。用 `.env` 里的
  `KB_UID`/`KB_GID` 对齐，或 `chown` 数据目录。
- **后端镜像 1.3GB**：LightRAG + PyMuPDF + PyTorch 系依赖体积如此，属正常。
  服务器建议 ≥ 2GB 内存。
- **未知域/文档的 HTTP 状态是 200**（界面正确显示"不存在"）：模板 `AppWrappers`
  的全局 NoSSR 使响应在 `notFound()` 之前就开始流式输出。
