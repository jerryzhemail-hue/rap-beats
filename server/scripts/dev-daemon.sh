#!/usr/bin/env bash
# ============================================================
# rap-beats 后端常驻管理（launchd 托管，脱离 shell 会话，进程被杀会自动拉起）
#
# 为什么用 launchctl 而不是 nohup &：
#   在 Codex/受限终端里用 nohup + & 启动的后台进程，会随执行会话退出
#   而被回收，导致“后端刚起来又挂了”。launchd 由系统托管，与 shell 无关。
#
# 用法：
#   ./scripts/dev-daemon.sh start     # 启动（launchd，常驻 + 崩溃自拉起）
#   ./scripts/dev-daemon.sh stop      # 停止
#   ./scripts/dev-daemon.sh status    # 查看状态
#   ./scripts/dev-daemon.sh restart   # 重启
#   ./scripts/dev-daemon.sh logs      # tail -f 日志
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$SCRIPT_DIR/com.rapbeats.dev-server.plist"
LABEL="com.rapbeats.dev-server"
LOG_FILE="/tmp/rap-beats-server.log"
DOMAIN="gui/$(id -u)"

is_running() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }

start() {
  if is_running; then
    echo "[dev-daemon] already running (launchd job $LABEL)"
    return 0
  fi
  launchctl bootstrap "$DOMAIN" "$PLIST"
  # 等端口起来
  for _ in $(seq 1 60); do
    if lsof -iTCP:3000 -sTCP:LISTEN -nP >/dev/null 2>&1; then
      echo "[dev-daemon] ready on port 3000"
      return 0
    fi
    if ! is_running; then
      echo "[dev-daemon] FATAL: launchd job exited, see $LOG_FILE"
      tail -30 "$LOG_FILE" 2>/dev/null || true
      return 1
    fi
    sleep 0.5
  done
  echo "[dev-daemon] WARN: port 3000 not listening after 30s, check $LOG_FILE"
  return 1
}

stop() {
  if is_running; then
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    # 等 bootout 彻底完成，避免紧随其后的 start 误判 already running
    for _ in $(seq 1 20); do is_running || break; sleep 0.2; done
    echo "[dev-daemon] stopped $LABEL"
  else
    echo "[dev-daemon] not running"
  fi
}

status() {
  if is_running; then
    echo "[dev-daemon] running (launchd job $LABEL)"
    launchctl print "$DOMAIN/$LABEL" | grep -E "state =|pid =|last exit code =" || true
    lsof -iTCP:3000 -sTCP:LISTEN -nP 2>/dev/null || true
  else
    echo "[dev-daemon] not running"
    return 1
  fi
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  status)  status ;;
  restart)
    if is_running; then
      launchctl kickstart -k "$DOMAIN/$LABEL"
      echo "[dev-daemon] restarted $LABEL"
    else
      start
    fi ;;
  logs)    tail -f "$LOG_FILE" ;;
  *)       echo "Usage: $0 {start|stop|status|restart|logs}"; exit 2 ;;
esac
