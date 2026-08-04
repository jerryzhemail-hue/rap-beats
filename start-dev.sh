#!/bin/bash
# ============================================================
# Rap Beats 本地开发环境启动脚本
#
# 用法：./start-dev.sh
# ============================================================
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 日志函数
log()     { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1" >&2; }
info()    { echo -e "${BLUE}[i]${NC} $1"; }

# ============================================================
# 1. 启动 MySQL
# ============================================================
start_mysql() {
    info "检查 MySQL 服务..."

    # 检查 MySQL 是否已安装
    if ! command -v mysql &> /dev/null; then
        error "MySQL 未安装。请运行: brew install mysql"
        exit 1
    fi

    # 检查 MySQL 是否运行
    if mysqladmin ping -h 127.0.0.1 -u root --silent 2>/dev/null; then
        log "MySQL 已在运行"
    else
        info "启动 MySQL..."
        brew services start mysql 2>/dev/null || sudo brew services start mysql 2>/dev/null || {
            error "MySQL 启动失败"
            exit 1
        }

        # 等待 MySQL 就绪
        info "等待 MySQL 启动..."
        retries=15
        while [ $retries -gt 0 ]; do
            if mysqladmin ping -h 127.0.0.1 -u root --silent 2>/dev/null; then
                log "MySQL 已就绪"
                break
            fi
            retries=$((retries - 1))
            if [ $retries -eq 0 ]; then
                error "MySQL 启动超时"
                exit 1
            fi
            sleep 1
        done
    fi
}

# ============================================================
# 2. 初始化数据库
# ============================================================
init_database() {
    info "检查数据库..."

    # 检查数据库是否存在
    if mysql -h 127.0.0.1 -u root -e "USE rap_beats_dev;" 2>/dev/null; then
        log "数据库 rap_beats_dev 已存在"
    else
        info "创建数据库 rap_beats_dev..."
        mysql -h 127.0.0.1 -u root -e "CREATE DATABASE IF NOT EXISTS rap_beats_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        log "数据库 rap_beats_dev 已创建"
    fi

    if mysql -h 127.0.0.1 -u root -e "USE rap_beats_forum_dev;" 2>/dev/null; then
        log "数据库 rap_beats_forum_dev 已存在"
    else
        info "创建数据库 rap_beats_forum_dev..."
        mysql -h 127.0.0.1 -u root -e "CREATE DATABASE IF NOT EXISTS rap_beats_forum_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        log "数据库 rap_beats_forum_dev 已创建"
    fi
}

# ============================================================
# 3. 启动后端
# ============================================================
start_backend() {
    info "启动后端服务..."

    # 检查依赖
    if [ ! -d "server/node_modules" ]; then
        info "安装后端依赖..."
        cd server && npm install && cd ..
    fi

    # 检查后端是否已在运行
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        warn "后端已在运行 (http://localhost:3000)"
    else
        cd server
        nohup npm run dev > ../logs/backend.log 2>&1 &
        BACKEND_PID=$!
        cd ..

        # 等待后端启动
        info "等待后端启动..."
        retries=20
        while [ $retries -gt 0 ]; do
            if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
                log "后端已启动 (PID: $BACKEND_PID, http://localhost:3000)"
                return 0
            fi
            retries=$((retries - 1))
            if [ $retries -eq 0 ]; then
                error "后端启动超时，请查看 logs/backend.log"
                return 1
            fi
            sleep 1
        done
    fi
}

# ============================================================
# 4. 启动前端
# ============================================================
start_frontend() {
    info "启动前端服务..."

    # 检查依赖
    if [ ! -d "client/node_modules" ]; then
        info "安装前端依赖..."
        cd client && npm install && cd ..
    fi

    # 启动前端（在前台，会占用终端）
    cd client
    log "前端服务将在新终端窗口启动..."
    log "请打开新终端窗口并运行: cd $SCRIPT_DIR/client && npm run dev"
    echo ""
    info "或者按住 Cmd+T 开新标签页，运行上述命令"
}

# ============================================================
# 显示状态
# ============================================================
show_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}  Rap Beats 开发环境${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${GREEN}服务状态：${NC}"
    echo ""

    # MySQL
    if mysqladmin ping -h 127.0.0.1 -u root --silent 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} MySQL        运行中 (localhost:3306)"
    else
        echo -e "  ${RED}✗${NC} MySQL        未运行"
    fi

    # Backend
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} 后端 API    http://localhost:3000"
    else
        echo -e "  ${RED}✗${NC} 后端 API    未运行"
    fi

    # Frontend
    if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} 前端       http://localhost:5173"
    else
        echo -e "  ${YELLOW}○${NC} 前端       需手动启动"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${YELLOW}启动命令：${NC}"
    echo "  后端:  cd server && npm run dev"
    echo "  前端:  cd client && npm run dev"
    echo ""
    echo -e "${YELLOW}日志文件：${NC}"
    echo "  后端日志:  tail -f logs/backend.log"
    echo ""
    echo -e "${YELLOW}停止服务：${NC}"
    echo "  MySQL:    brew services stop mysql"
    echo "  后端:     pkill -f 'tsx watch'"
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

    # 创建日志目录
    mkdir -p logs

    # 启动服务
    start_mysql
    init_database
    start_backend

    # 显示状态
    show_status
}

main "$@"
