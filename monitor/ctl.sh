#!/usr/bin/env bash
# 监控服务管理（launchd 托管）
# 用法: ./monitor/ctl.sh {start|stop|restart|status|logs}
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$SCRIPT_DIR/com.rapbeats.monitor.plist"
LABEL="com.rapbeats.monitor"
DOMAIN="gui/$(id -u)"
LOG="/tmp/rap-beats-monitor.log"

is_running() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }

case "${1:-status}" in
  start)
    if is_running; then echo "[monitor] already running"; else
      launchctl bootstrap "$DOMAIN" "$PLIST"
      echo "[monitor] started on http://127.0.0.1:4000"
    fi ;;
  stop)
    if is_running; then
      launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
      # 等 bootout 彻底完成
      for _ in $(seq 1 20); do is_running || break; sleep 0.2; done
      echo "[monitor] stopped"
    else
      echo "[monitor] not running"
    fi ;;
  restart)
    if is_running; then
      launchctl kickstart -k "$DOMAIN/$LABEL"
      echo "[monitor] restarted"
    else
      launchctl bootstrap "$DOMAIN" "$PLIST"
      echo "[monitor] started on http://127.0.0.1:4000"
    fi ;;
  status)
    if is_running; then
      echo "[monitor] running"
      launchctl print "$DOMAIN/$LABEL" | grep -E "state =|pid =" || true
      curl -s -m 3 http://127.0.0.1:4000/api/health && echo ""
    else
      echo "[monitor] not running"; exit 1
    fi ;;
  logs) tail -f "$LOG" ;;
  *) echo "Usage: $0 {start|stop|restart|status|logs}"; exit 2 ;;
esac
