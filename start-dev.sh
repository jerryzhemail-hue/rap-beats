#!/bin/bash
# ============================================================
# Rap Beats 本地开发环境 —— 唯一入口脚本
#
# 用法：
#   ./start-dev.sh             # 一键启动（colima → 3307 MySQL → 后端 → 前端）
#   ./start-dev.sh start       # 同上
#   ./start-dev.sh stop        # 停止后端 + 前端（3307 MySQL 容器保留）
#   ./start-dev.sh stop --all  # 连 3307 MySQL 容器一起停
#   ./start-dev.sh status      # 查看状态
#   ./start-dev.sh logs        # 实时查看后端+前端日志
#
# 约定：本地开发唯一数据库 = 3307（Docker/Colima MySQL，docker-compose.dev.yml）。
#       不再使用 Homebrew 3306 作为 dev 库。
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"
MYSQL_CONTAINER="rap-beats-dev-mysql"
MYSQL_ROOT_PASSWORD="dev_root_2024"
DEV_DB_USER="dev_user"
DEV_DB_NAME="rap_beats_dev"
FORUM_DB_NAME="rap_beats_forum"
MEMBERSHIP_DB_NAME="rap_beats_membership"
SERVER_LOG="/tmp/rap-beats-server.log"
CLIENT_LOG="/tmp/rap-beats-client.log"
SERVER_PID="/tmp/rap-beats-server.pid"
CLIENT_PID="/tmp/rap-beats-client.pid"
SIDECAR_LOG="/tmp/rap-beats-sidecar.log"
SIDECAR_PID="/tmp/rap-beats-sidecar.pid"
BACKEND_URL="http://localhost:3000/api/health"
SIDECAR_URL="http://localhost:5050/health"

port_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
backend_ready()  { curl -sf "$BACKEND_URL" >/dev/null 2>&1; }
sidecar_ready() { curl -sf "$SIDECAR_URL" >/dev/null 2>&1; }

ensure_colima() {
  info "检查 Colima..."
  if ! command -v colima >/dev/null 2>&1; then
    err "未安装 colima，请先安装: brew install colima docker docker-compose"
    exit 1
  fi
  if colima status >/dev/null 2>&1; then
    log "Colima 已在运行"
  else
    info "启动 Colima（约 15-30 秒）..."
    colima start
    log "Colima 已启动"
  fi
}

ensure_mysql() {
  info "检查 3307 MySQL 容器..."
  if ! docker ps --format '{{.Names}}' | grep -qx "$MYSQL_CONTAINER"; then
    info "启动本地 MySQL 容器（端口 3307）..."
    docker compose -f "$COMPOSE_FILE" up -d mysql
  else
    log "MySQL 容器已在运行"
  fi

  info "等待 MySQL 健康检查..."
  for i in $(seq 1 60); do
    local status
    status="$(docker inspect -f '{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      log "MySQL 已就绪 (127.0.0.1:3307)"
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      err "MySQL 启动超时。排查: docker compose -f $COMPOSE_FILE logs mysql"
      exit 1
    fi
    sleep 1
  done

  info "确保三库与账号授权（幂等）..."
  local sql
  sql="CREATE DATABASE IF NOT EXISTS \`${DEV_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  sql+="CREATE DATABASE IF NOT EXISTS \`${FORUM_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  sql+="CREATE DATABASE IF NOT EXISTS \`${MEMBERSHIP_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  sql+="GRANT ALL PRIVILEGES ON \`${DEV_DB_NAME}\`.* TO '${DEV_DB_USER}'@'%';"
  sql+="GRANT ALL PRIVILEGES ON \`${FORUM_DB_NAME}\`.* TO '${DEV_DB_USER}'@'%';"
  sql+="GRANT ALL PRIVILEGES ON \`${MEMBERSHIP_DB_NAME}\`.* TO '${DEV_DB_USER}'@'%';"
  sql+="FLUSH PRIVILEGES;"
  docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "$sql" >/dev/null 2>&1 \
    || { err "数据库初始化失败，查看: docker compose -f $COMPOSE_FILE logs mysql"; exit 1; }
  log "数据库 $DEV_DB_NAME / $FORUM_DB_NAME / $MEMBERSHIP_DB_NAME 已就绪"
}

start_sidecar() {
  if sidecar_ready; then
    log "BPM/调性识别 sidecar 已在运行 (http://localhost:5050)"
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    warn "未找到 python3，跳过 BPM/调性识别 sidecar（调性自动识别将不可用）"
    return 0
  fi
  if ! python3 -c "import flask, librosa, numpy, scipy" >/dev/null 2>&1; then
    warn "Python 依赖缺失，跳过 sidecar。安装：cd bpm_service && pip install -r requirements.txt"
    return 0
  fi
  info "启动 BPM/调性识别 sidecar（librosa，日志 ${SIDECAR_LOG}）..."
  ( cd "$ROOT/bpm_service" && nohup python3 server.py > "$SIDECAR_LOG" 2>&1 & echo $! > "$SIDECAR_PID" )
  for i in $(seq 1 20); do
    if sidecar_ready; then log "sidecar 就绪 http://localhost:5050"; return 0; fi
    if [ -f "$SIDECAR_PID" ] && ! kill -0 "$(cat "$SIDECAR_PID" 2>/dev/null)" 2>/dev/null; then
      warn "sidecar 启动失败，最近日志："; tail -20 "$SIDECAR_LOG" 2>/dev/null || true; return 0
    fi
    sleep 1
  done
  warn "sidecar 20 秒内未就绪，查看日志: tail -f $SIDECAR_LOG"
}

start_backend() {
  if backend_ready; then
    log "后端已在运行 (http://localhost:3000)"
    return 0
  fi
  if [ ! -d "$SERVER_DIR/node_modules" ]; then
    info "安装后端依赖..."
    (cd "$SERVER_DIR" && npm install)
  fi
  info "启动后端（tsx watch 热重载，日志 ${SERVER_LOG}）..."
  ( cd "$SERVER_DIR" && nohup ./node_modules/.bin/tsx watch src/index.ts > "$SERVER_LOG" 2>&1 & echo $! > "$SERVER_PID" )
  for i in $(seq 1 40); do
    if backend_ready; then log "后端就绪 http://localhost:3000"; return 0; fi
    if [ -f "$SERVER_PID" ] && ! kill -0 "$(cat "$SERVER_PID" 2>/dev/null)" 2>/dev/null; then
      err "后端启动失败，最近日志："; tail -30 "$SERVER_LOG" 2>/dev/null || true; return 1
    fi
    sleep 1
  done
  warn "后端 40 秒内未就绪，查看日志: tail -f $SERVER_LOG"
}

# 手动触发一次热门标签扫描(避免等待 6 小时定时任务)
warmup_tag_algorithm() {
  if ! backend_ready; then return 0; fi
  # 后端在 initDatabase 之后会异步跑一次首次扫描,这里不重复触发
  # 但可以等几秒看看有没有命中日志
  sleep 3
  if grep -q "tag-algorithm" "$SERVER_LOG" 2>/dev/null; then
    local last_line
    last_line="$(grep "tag-algorithm" "$SERVER_LOG" | tail -1)"
    info "热门标签算法: $last_line"
  else
    info "热门标签算法: 后端启动后会在首次就绪时自动扫描"
  fi
}

start_frontend() {
  if port_listening 5173; then
    log "前端已在运行 (http://localhost:5173)"
    return 0
  fi
  if [ ! -d "$CLIENT_DIR/node_modules" ]; then
    info "安装前端依赖..."
    (cd "$CLIENT_DIR" && npm install)
  fi
  info "启动前端（nohup，日志 ${CLIENT_LOG}）..."
  ( cd "$CLIENT_DIR" && nohup ./node_modules/.bin/vite > "$CLIENT_LOG" 2>&1 & echo $! > "$CLIENT_PID" )
  for i in $(seq 1 40); do
    if port_listening 5173; then log "前端就绪 http://localhost:5173"; return 0; fi
    if [ -f "$CLIENT_PID" ] && ! kill -0 "$(cat "$CLIENT_PID" 2>/dev/null)" 2>/dev/null; then
      err "前端启动失败，最近日志："; tail -30 "$CLIENT_LOG" 2>/dev/null || true; return 1
    fi
    sleep 1
  done
  warn "前端 40 秒内未就绪，查看日志: tail -f $CLIENT_LOG"
}

stop_sidecar() {
  # sidecar 若由 launchd 常驻管理（KeepAlive 会自动拉起），此处不 kill，
  # 否则 kill 后 5 秒又会被 launchd 重启，stop 语义会失效。
  if launchctl list com.rapbeats.bpm-sidecar >/dev/null 2>&1; then
    return 0
  fi
  [ -f "$SIDECAR_PID" ] && kill "$(cat "$SIDECAR_PID" 2>/dev/null)" 2>/dev/null || true
  rm -f "$SIDECAR_PID"
  lsof -ti:5050 | xargs kill 2>/dev/null || true
}
stop_backend() {
  [ -f "$SERVER_PID" ] && kill "$(cat "$SERVER_PID" 2>/dev/null)" 2>/dev/null || true
  rm -f "$SERVER_PID"
  lsof -ti:3000 | xargs kill 2>/dev/null || true
}
stop_frontend() {
  [ -f "$CLIENT_PID" ] && kill "$(cat "$CLIENT_PID" 2>/dev/null)" 2>/dev/null || true
  rm -f "$CLIENT_PID"
  lsof -ti:5173 | xargs kill 2>/dev/null || true
}

show_status() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${CYAN}  Rap Beats 本地开发环境（唯一 dev 库: 3307）${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  local m
  m="$(docker inspect -f '{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo missing)"
  if [[ "$m" == "healthy" ]]; then echo -e "  ${GREEN}✓${NC} MySQL(3307)  $MYSQL_CONTAINER"; else echo -e "  ${RED}✗${NC} MySQL(3307)  状态: $m"; fi
  if backend_ready; then echo -e "  ${GREEN}✓${NC} 后端        http://localhost:3000"; else echo -e "  ${RED}✗${NC} 后端        未运行"; fi
  if port_listening 5173; then echo -e "  ${GREEN}✓${NC} 前端        http://localhost:5173"; else echo -e "  ${RED}✗${NC} 前端        未运行"; fi
  if sidecar_ready; then echo -e "  ${GREEN}✓${NC} Sidecar    http://localhost:5050（BPM/调性识别）"; else echo -e "  ${RED}✗${NC} Sidecar    未运行（调性自动识别不可用）"; fi
  echo ""
  echo -e "${YELLOW}常用命令：${NC}"
  echo "  启动:   ./start-dev.sh"
  echo "  停止:   ./start-dev.sh stop"
  echo "  状态:   ./start-dev.sh status"
  echo "  日志:   ./start-dev.sh logs"
  echo ""
}

start_all() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${CYAN}  🚀 Rap Beats 开发环境启动${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ensure_colima
  ensure_mysql
  start_sidecar
  start_backend
  start_frontend
  warmup_tag_algorithm
  show_status
}

usage() {
  echo "用法: $0 {start|stop [--all]|status|logs}"
  exit 2
}

case "${1:-start}" in
  start) start_all ;;
  stop)
    stop_sidecar
    stop_backend
    stop_frontend
    if [[ "${2:-}" == "--all" ]]; then
      docker compose -f "$COMPOSE_FILE" stop mysql 2>/dev/null || true
      log "3307 MySQL 容器已停止"
    fi
    log "后端/前端已停止"
    ;;
  status) show_status ;;
  logs)
    touch "$SERVER_LOG" "$CLIENT_LOG" "$SIDECAR_LOG"
    tail -F "$SERVER_LOG" "$CLIENT_LOG" "$SIDECAR_LOG"
    ;;
  *) usage ;;
esac
