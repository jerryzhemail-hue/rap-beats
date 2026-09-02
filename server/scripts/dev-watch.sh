#!/usr/bin/env bash
# scripts/dev-watch.sh — 把后端常驻从无 watch 模式切到 tsx watch 模式
#
# 改了什么：server/scripts/com.rapbeats.dev-server.plist 里的启动命令
#   - 旧：/usr/local/bin/node --import tsx/esm src/index.ts
#   - 新：./node_modules/.bin/tsx watch --clear-screen=false src/index.ts
#
# 效果：以后你（或者我）改 server/src/ 下任何 .ts 文件，
#       dev server 会在 ~1s 内自动重启加载新代码，浏览器刷新就能看到。
#
# Cursor IDE 自带的 shell 是 sandbox 的，跑不了持久进程 / launchctl。
# 请在你 Mac 上自己打开的 Terminal.app / iTerm2 里执行本脚本。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$SCRIPT_DIR/com.rapbeats.dev-server.plist"
LABEL="com.rapbeats.dev-server"
DOMAIN="gui/$(id -u)"

# 1) 确认 plist 已经切到 watch 模式（防止忘了提交前就跑了脚本）
if ! grep -q "tsx watch" "$PLIST"; then
  echo "[dev-watch] plist 还没切到 watch 模式，请先 git pull / 确认文件已更新"
  exit 1
fi

# 2) 重新加载 plist（kickstart -k 会先 kill 再 start）
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "[dev-watch] restarting $LABEL with new plist (tsx watch)..."
  launchctl kickstart -k "$DOMAIN/$LABEL"
else
  echo "[dev-watch] launching $LABEL for the first time..."
  launchctl bootstrap "$DOMAIN" "$PLIST"
fi

# 3) 等端口起来
for _ in $(seq 1 60); do
  if lsof -iTCP:3000 -sTCP:LISTEN -nP >/dev/null 2>&1; then
    echo "[dev-watch] ✅ ready on port 3000 (tsx watch enabled)"
    echo "[dev-watch] 改 server/src/ 下任意 .ts 文件会自动重启"
    echo "[dev-watch] 看日志: tail -f /tmp/rap-beats-server.log"
    exit 0
  fi
  sleep 0.5
done

echo "[dev-watch] ❌ port 3000 not listening after 30s, check /tmp/rap-beats-server.log"
tail -40 /tmp/rap-beats-server.log 2>/dev/null || true
exit 1
