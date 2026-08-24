#!/bin/bash
# ============================================================
# Rap Beats 本地开发环境启动脚本
#
# 用法：./start-dev.sh
#
# 该脚本与 docker-compose.dev.yml 保持一致：
#   - MySQL 容器 rap-beats-dev-mysql（127.0.0.1:3307）
#   - 库：rap_beats_dev / rap_beats_forum / rap_beats_membership
#   - 后端在主机上以 dev:no-watch 启动（避免 node --watch 的 EMFILE）
# ============================================================
set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.dev.yml"
BACKEND_URL="http://localhost:3000/api/health"
BACKEND_LOG="/tmp/rap-beats-server.log"

MYSQL_CONTAINER="rap-beats-dev-mysql"
MYSQL_ROOT_PASSWORD="dev_root_2024"
DEV_DB_NAME="rap_beats_dev"
DEV_FORUM_DB_NAME="rap_beats_forum"
DEV_MEMBERSHIP_DB_NAME="rap_beats_membership"
DEV_DB_USER="dev_user"

# 日志函数
log()     { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1" >&2; }
info()    { echo -e "${BLUE}[i]${NC} $1"; }

# ============================================================
# 1. 启动 MySQL（Docker Compose）
# ============================================================
start_mysql() {
    info "检查 Docker Compose..."

    if ! docker compose version > /dev/null 2>&1; then
        error "未检测到 Docker Compose。请先安装 Docker Desktop 或 Colima + docker compose 插件。"
        exit 1
    fi

    info "启动本地开发 MySQL 容器..."
    docker compose -f "$COMPOSE_FILE" up -d

    info "等待 MySQL 健康检查..."
    for i in $(seq 1 60); do
        local status
        status="$(docker inspect -f '{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || true)"
        if [[ "$status" == "healthy" ]]; then
            log "MySQL 已就绪"
            break
        fi
        if [[ "$i" -eq 60 ]]; then
            error "MySQL 启动超时，请运行: docker compose -f docker-compose.dev.yml logs mysql"
            exit 1
        fi
        sleep 1
    done

    info "确保数据库存在并授权给应用账号..."
    local sql
    sql="CREATE DATABASE IF NOT EXISTS \`${DEV_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    sql+="CREATE DATABASE IF NOT EXISTS \`${DEV_FORUM_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    sql+="CREATE DATABASE IF NOT EXISTS \`${DEV_MEMBERSHIP_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    sql+="GRANT ALL PRIVILEGES ON \`${DEV_FORUM_DB_NAME}\`.* TO '${DEV_DB_USER}'@'%';"
    sql+="GRANT ALL PRIVILEGES ON \`${DEV_MEMBERSHIP_DB_NAME}\`.* TO '${DEV_DB_USER}'@'%';"
    sql+="FLUSH PRIVILEGES;"

    docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "$sql" \
        > /dev/null 2>&1 || {
        error "数据库初始化失败，请检查 MySQL 容器日志。"
        exit 1
    }
    log "数据库 rap_beats_dev / rap_beats_forum / rap_beats_membership 已就绪"
}

# ============================================================
# 2. 启动后端
# ============================================================
start_backend() {
    info "启动后端服务..."

    if [ ! -d "$SERVER_DIR/node_modules" ]; then
        info "安装后端依赖..."
        (cd "$SERVER_DIR" && npm install)
    fi

    if curl -sf "$BACKEND_URL" > /dev/null 2>&1; then
        warn "后端已在运行 (http://localhost:3000)"
        return 0
    fi

    mkdir -p "$SCRIPT_DIR/logs"
    # 由 launchd 托管(dev-daemon.sh -> launchctl),脱离 shell 会话、崩溃自动拉起。
    "$SERVER_DIR/scripts/dev-daemon.sh" start
}

# ============================================================
# 3. 显示状态
# ============================================================
show_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}  Rap Beats 开发环境${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${GREEN}服务状态：${NC}"
    echo ""

    local mysql_status
    mysql_status="$(docker inspect -f '{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo 'missing')"
    if [[ "$mysql_status" == "healthy" ]]; then
        echo -e "  ${GREEN}✓${NC} MySQL        $MYSQL_CONTAINER (127.0.0.1:3307)"
    else
        echo -e "  ${RED}✗${NC} MySQL        $MYSQL_CONTAINER (状态: $mysql_status)"
    fi

    if curl -sf "$BACKEND_URL" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} 后端 API    http://localhost:3000"
    else
        echo -e "  ${RED}✗${NC} 后端 API    未运行"
    fi

    if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} 前端       http://localhost:5173"
    else
        echo -e "  ${YELLOW}○${NC} 前端       需手动启动: cd client && npm run dev"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${YELLOW}常用命令：${NC}"
    echo "  后端(launchd 常驻): cd server && npm run dev:start"
    echo "  后端状态:          cd server && npm run dev:status"
    echo "  后端日志:          tail -f $BACKEND_LOG"
    echo "  停止后端:          cd server && npm run dev:stop"
    echo "  停止 MySQL:        docker compose -f $COMPOSE_FILE down"
    echo ""
}

# ============================================================
# 主程序
# ============================================================
main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}  🚀 Rap Beats 开发环境启动${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    start_mysql
    start_backend
    show_status
}

main "$@"
