#!/bin/bash
# 安装/卸载 launchd 保活（安装: ./install-launchd.sh；卸载: ./install-launchd.sh uninstall）
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
for svc in com.kb.ingest-api com.kb.ingest-worker; do
  if [ "$1" = "uninstall" ]; then
    launchctl unload ~/Library/LaunchAgents/$svc.plist 2>/dev/null || true
    rm -f ~/Library/LaunchAgents/$svc.plist && echo "已卸载 $svc"
  else
    launchctl unload ~/Library/LaunchAgents/$svc.plist 2>/dev/null || true
    cp "$DIR/$svc.plist" ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/$svc.plist && echo "已安装 $svc"
  fi
done
