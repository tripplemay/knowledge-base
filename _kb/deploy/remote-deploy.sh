#!/usr/bin/env bash
# 服务器端部署脚本：拉新代码 → 重建 → 就地验收 → 失败自动回滚。
#
# 由 .github/workflows/deploy.yml 经 SSH 调用，也可手动跑：
#   ssh deploysvr 'bash /srv/kb/_kb/deploy/remote-deploy.sh'
#
# 刻意放在仓库里而不是内联进 workflow：多行脚本经 ssh-action 传输时
# 容易被 shell 解析规则绊住，且内联版本无法在服务器上单独调试。
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$DEPLOY_DIR"

PREV=$(git rev-parse --short HEAD)
echo "当前版本 $PREV"

git fetch --quiet origin main
git reset --hard --quiet origin/main
NEXT=$(git rev-parse --short HEAD)
echo "目标版本 $NEXT"

# 在服务器上就地构建：镜像不进 registry，省掉一套凭证管理
docker compose build
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

PORT=3456
if [ -f .env ]; then
  PORT=$(sed -n 's/^KB_WEB_PORT=//p' .env | head -1)
  PORT=${PORT:-3456}
fi
echo "验收端口 $PORT"

probe() { curl -s -o /dev/null -w '%{http_code}' "$@" || true; }

# web 冷启动需要时间，给足重试
code=000
for _ in $(seq 1 40); do
  code=$(probe "http://127.0.0.1:${PORT}/admin/kb/domains")
  [ "$code" = "200" ] && break
  sleep 3
done

if [ "$code" != "200" ]; then
  echo "❌ web 未就绪（HTTP $code），回滚到 $PREV"
  docker compose logs --tail=60 || true
  git reset --hard --quiet "$PREV"
  docker compose build && docker compose up -d
  exit 1
fi
echo "✓ 页面可访问"

proxy=$(probe "http://127.0.0.1:${PORT}/api/v1/jobs")
if [ "$proxy" != "200" ]; then
  echo "❌ 摄取代理异常（HTTP $proxy）——通常是 KB_API_TOKEN 两处不一致"
  docker compose logs --tail=60 api || true
  exit 1
fi
echo "✓ 摄取代理通（服务端注入 token 生效）"

cross=$(probe -H 'Sec-Fetch-Site: cross-site' "http://127.0.0.1:${PORT}/api/v1/jobs")
if [ "$cross" != "403" ]; then
  echo "❌ 跨站防护失效（期望 403，实际 $cross）"
  exit 1
fi
echo "✓ 跨站请求被拒"

echo "✅ 部署完成：$PREV → $NEXT"
