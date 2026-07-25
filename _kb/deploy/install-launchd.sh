#!/bin/bash
# 安装/卸载本机 launchd 保活（安装: ./install-launchd.sh；卸载: ./install-launchd.sh uninstall）
#
# plist 里的路径写成 __KB_ROOT__ 占位符，安装时按当前仓库位置渲染，
# 这样仓库里不带任何机器相关的绝对路径。
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
KB_ROOT="$(cd "$DIR/../.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS"

for svc in com.kb.ingest-api com.kb.ingest-worker com.kb.health; do
  [ -f "$DIR/$svc.plist" ] || continue
  launchctl unload "$AGENTS/$svc.plist" 2>/dev/null || true
  if [ "${1:-}" = "uninstall" ]; then
    rm -f "$AGENTS/$svc.plist" && echo "已卸载 $svc"
  else
    sed "s|__KB_ROOT__|$KB_ROOT|g" "$DIR/$svc.plist" > "$AGENTS/$svc.plist"
    launchctl load "$AGENTS/$svc.plist" && echo "已安装 $svc"
  fi
done
