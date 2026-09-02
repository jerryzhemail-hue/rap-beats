#!/bin/bash
# ============================================================
# Rap Beats 部署脚本
#
# 本地开发：  ./deploy.sh local
# 部署到服务器：./deploy.sh deploy
# ============================================================
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 日志函数
log()     { echo -e "${GREEN}[deploy]${NC} $1"; }
warn()    { echo -e "${YELLOW}[warn]${NC} $1"; }
err()     { echo -e "${RED}[error]${NC} $1" >&2; }
info()    { echo -e "${BLUE}[info]${NC} $1"; }

# 服务器配置
SERVER_HOST="${SERVER_HOST:-47.85.98.237}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_DEPLOY_DIR="${SERVER_DEPLOY_DIR:-/opt/rap-beats}"

# Docker Compose 文件
DEV_COMPOSE_FILE="docker-compose.dev.yml"
PROD_COMPOSE_FILE="docker-compose.yml"

# ============================================================
# 检查环境
# ============================================================
check_docker() {
    if ! command -v docker &> /dev/null; then
        err "Docker 未安装"
        exit 1
    fi
    log "Docker: $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
}

# ============================================================
# 本地 Docker 开发环境
# ============================================================
start_local_dev() {
    log "启动本地开发环境（唯一 dev 库：3307）..."
    ./start-dev.sh start
}

stop_local_dev() {
    log "停止本地服务..."
    ./start-dev.sh stop
}

clean_local_dev() {
    log "清理本地开发环境..."
    read -p "确认清理？这会删除本地数据库数据！[y/N]：" confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        ./start-dev.sh stop 2>/dev/null || true
        docker compose -f "$DEV_COMPOSE_FILE" down -v
        log "清理完成"
    else
        info "取消清理"
    fi
}

# ============================================================
# 检查远程服务器
# ============================================================
check_remote() {
    log "检查远程服务器连接..."
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "echo 'SSH OK'" 2>/dev/null; then
        err "无法连接服务器 ${SERVER_USER}@${SERVER_HOST}"
        exit 1
    fi
    log "SSH 连接成功 ✅"
}

# ============================================================
# 部署到远程服务器
# ============================================================
deploy_remote() {
    check_docker
    check_remote

    log "部署到服务器..."
    info "服务器：${SERVER_USER}@${SERVER_HOST}"

    # 1. 备份
    log "备份当前版本..."
    ssh "${SERVER_USER}@${SERVER_HOST}" "
        cd ${SERVER_DEPLOY_DIR}
        BACKUP_DIR=\$(date +'%Y%m%d_%H%M%S')
        mkdir -p backups/\${BACKUP_DIR}
        cp -r server/dist backups/\${BACKUP_DIR}/ 2>/dev/null || true
        cp -r client/dist backups/\${BACKUP_DIR}/ 2>/dev/null || true
        cp .env backups/\${BACKUP_DIR}/ 2>/dev/null || true
        echo '备份完成: backups/\${BACKUP_DIR}/'
    "

    # 2. 同步代码
    log "同步代码到服务器..."
    EXCLUDE_ARGS=(
        --exclude='node_modules'
        --exclude='.git'
        --exclude='client/node_modules'
        --exclude='server/node_modules'
        --exclude='client/dist'
        --exclude='server/dist'
        --exclude='*.db'
        --exclude='.env'
        --exclude='.env.local'
        --exclude='.DS_Store'
        --exclude='*.log'
        --exclude='backups'
        --exclude='data'
    )

    if command -v rsync &> /dev/null; then
        rsync -az --progress "${EXCLUDE_ARGS[@]}" \
            "$SCRIPT_DIR/" \
            "${SERVER_USER}@${SERVER_HOST}:${SERVER_DEPLOY_DIR}/"
    else
        scp -r "$SCRIPT_DIR/" "${SERVER_USER}@${SERVER_HOST}:${SERVER_DEPLOY_DIR}/"
    fi

    # 3. 重新构建
    log "在服务器上构建..."
    ssh "${SERVER_USER}@${SERVER_HOST}" "
        cd ${SERVER_DEPLOY_DIR}
        docker compose build --pull server client bpm
    "

    # 4. 重启服务
    log "重启服务..."
    ssh "${SERVER_USER}@${SERVER_HOST}" "
        cd ${SERVER_DEPLOY_DIR}
        docker compose up -d --remove-orphans
    "

    # 5. 健康检查
    log "检查服务状态..."
    sleep 10
    local retries=20
    while [ $retries -gt 0 ]; do
        if ssh "${SERVER_USER}@${SERVER_HOST}" "curl -sf http://localhost:3000/api/health" > /dev/null 2>&1; then
            log "服务健康 ✅"
            break
        fi
        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            warn "服务可能还未就绪，请检查 ./deploy.sh status"
            break
        fi
        echo -e "${YELLOW}等待服务... ($retries)${NC}"
        sleep 3
    done

    echo ""
    log "部署完成！"
    echo "  服务器：${SERVER_HOST}"
    echo "  访问：  http://${SERVER_HOST}"
}

# ============================================================
# 服务器管理
# ============================================================
server_status() {
    check_remote
    log "服务器状态"
    ssh "${SERVER_USER}@${SERVER_HOST}" "
        cd ${SERVER_DEPLOY_DIR}
        echo '=== 容器状态 ==='
        docker compose ps
        echo ''
        echo '=== 资源使用 ==='
        docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
    "
}

server_logs() {
    check_remote
    local service="${1:-}"
    log "查看服务器日志..."
    if [ -n "$service" ]; then
        ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DEPLOY_DIR} && docker compose logs -f --tail=100 $service"
    else
        ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DEPLOY_DIR} && docker compose logs -f --tail=50"
    fi
}

server_restart() {
    check_remote
    log "重启服务..."
    ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DEPLOY_DIR} && docker compose restart"
    sleep 5
    server_status
}

# ============================================================
# 帮助信息
# ============================================================
show_help() {
    echo "Rap Beats 部署脚本"
    echo ""
    echo "本地开发命令："
    echo "  ./deploy.sh local         启动本地开发环境（独立数据库）"
    echo "  ./deploy.sh local-stop   停止本地服务"
    echo "  ./deploy.sh local-clean  清理本地数据库"
    echo ""
    echo "远程部署命令："
    echo "  ./deploy.sh deploy       部署到服务器"
    echo "  ./deploy.sh status       查看服务器状态"
    echo "  ./deploy.sh logs         查看服务器日志"
    echo "  ./deploy.sh restart      重启服务器服务"
    echo ""
}

# ============================================================
# 主程序
# ============================================================
case "${1:-}" in
    local|local-start)
        start_local_dev
        ;;
    local-stop)
        stop_local_dev
        ;;
    local-clean)
        clean_local_dev
        ;;
    deploy)
        deploy_remote
        ;;
    status)
        server_status
        ;;
    logs)
        server_logs "$2"
        ;;
    restart)
        server_restart
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            show_help
        else
            err "未知命令: $1"
            show_help
            exit 1
        fi
        ;;
esac
