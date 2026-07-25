#!/bin/bash
# 把本机的知识数据播种到部署服务器（首次上线用）。
#
# 用法：_kb/deploy/seed-data.sh user@vps /srv/kb-data
#
# 传的是"数据"，不是代码——代码由 CI 构建成镜像。语料本身不进公开仓库，
# 因此必须走这条带外通道。
set -euo pipefail

TARGET="${1:?用法: seed-data.sh user@host /srv/kb-data}"
REMOTE_DIR="${2:?用法: seed-data.sh user@host /srv/kb-data}"
KB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "→ 在 $TARGET 建立目录骨架"
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'/{domains,forge,state,engines,uploads,work,reports,secrets,kbdata.git}"

echo "→ 同步语料与知识产物"
# 不要用 --info=：macOS 自带 rsync 2.6.9 不支持它，会直接报用法错误退出
# （若再管道接 head，退出码还会被吞掉，表现为"同步成功但目标目录是空的"）
rsync -az --delete --partial --stats \
  "$KB_ROOT/domains/" "$TARGET:$REMOTE_DIR/domains/"
[ -d "$KB_ROOT/forge" ] && rsync -az --delete --partial "$KB_ROOT/forge/" "$TARGET:$REMOTE_DIR/forge/"

echo "→ 同步域注册表（容器内位于 state/domains.yaml）"
rsync -az "$KB_ROOT/_kb/domains.yaml" "$TARGET:$REMOTE_DIR/state/domains.yaml"

echo "→ 同步知识历史仓"
rsync -az --delete --partial "$KB_ROOT/.kbdata.git/" "$TARGET:$REMOTE_DIR/kbdata.git/"

echo "→ 同步 LightRAG 引擎索引（可重建，但重建要花钱，直接搬更划算）"
[ -d "$KB_ROOT/_kb/engines" ] && rsync -az --delete --partial "$KB_ROOT/_kb/engines/" "$TARGET:$REMOTE_DIR/engines/"

cat <<EOF

⚠️  密钥需手动放置，本脚本刻意不传：
    ssh $TARGET 'cat > $REMOTE_DIR/secrets/kb.env' <<'ENVEOF'
    AIGC_GATEWAY_BASE_URL=...
    AIGC_GATEWAY_API_KEY=...
    KB_API_TOKEN=...
    ENVEOF
    ssh $TARGET 'chmod 600 $REMOTE_DIR/secrets/kb.env'

    其中 KB_API_TOKEN 必须与服务器上 .env 里的 KB_API_TOKEN 一致，
    否则 web 的同源代理注入的令牌对不上，写侧接口全部 401。

    另：容器以 uid/gid 10001 运行，需保证数据目录属主匹配：
    ssh $TARGET 'sudo chown -R 10001:10001 $REMOTE_DIR'
EOF
