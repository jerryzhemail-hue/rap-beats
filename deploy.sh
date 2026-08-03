#!/bin/bash
# ============================================================
# 本地 Docker Compose 部署脚本
# 用于：本地测试 / 开发服务器部署
#
# 用法：
#   本地部署：./deploy.sh
#   本地重启：./deploy.sh restart
#   清理：./deploy.sh clean
# ============================================================
set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

# 检查 .env 文件
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        warn ".env 文件不存在，从 .env.production 复制（请编辑 .env 填写真实密钥！）"
        cp .env.production .env
    else
        err ".env 文件不存在，请创建 .env 文件"
        exit 1
    fi
fi

# 检查必填环境变量
check_env() {
    local var=$1
    local val=$(grep "^${var}=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    if [ -z "$val" ] || [[ "$val" == change-this-* ]] || [[ "$val" == your-* ]]; then
        err "请在 .env 中设置 $var"
        exit 1
    fi
}

log "检查环境变量..."
check_env "MYSQL_ROOT_PASSWORD"
check_env "JWT_SECRET"
echo -e "${GREEN}[OK]${NC} 环境变量检查通过"

# 构建并启动
build_and_up() {
    log "构建 Docker 镜像..."
    docker compose build --pull

    log "启动服务..."
    docker compose up -d

    log "等待服务启动..."
    sleep 5

    log "检查容器状态..."
    docker compose ps

    # 健康检查
    log "检查后端健康状态..."
    local retries=10
    while [ $retries -gt 0 ]; do
        if docker exec rap-beats-server wget -q --spider http://localhost:3000/api/health 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} 后端服务健康"
            break
        fi
        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            err "后端服务启动失败，请检查日志：docker compose logs server"
            exit 1
        fi
        echo -e "${YELLOW}等待后端服务就绪... ($retries)${NC}"
        sleep 3
    done

    log "所有服务启动完成！"
    echo ""
    echo "访问地址："
    echo "  前端：http://localhost"
    echo "  后端：http://localhost/api/health"
    echo ""
    echo "常用命令："
    echo "  查看日志：docker compose logs -f"
    echo "  重启服务：docker compose restart"
    echo "  停止服务：docker compose down"
    echo "  清理数据：docker compose down -v"
}

case "${1:-up}" in
    up)
        build_and_up
        ;;
    restart)
        log "重启所有服务..."
        docker compose restart
        docker compose ps
        ;;
    stop)
        log "停止所有服务..."
        docker compose stop
        ;;
    down)
        log "停止并移除所有容器..."
        docker compose down
        ;;
    clean)
        log "停止并移除所有容器 + 数据卷（⚠️ 会删除数据库数据！）"
        docker compose down -v
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    *)
        echo "用法: $0 {up|restart|stop|down|clean|logs}"
        exit 1
        ;;
esac
