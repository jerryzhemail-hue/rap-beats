#!/bin/bash
# ============================================================
# 生产服务器首次部署脚本（一次性设置）
# 在服务器上运行一次即可，后续用 CI/CD 自动部署
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

log "开始生产环境首次设置..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    err "Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    err "Docker Compose 未安装"
    exit 1
fi

log "Docker 版本：$(docker --version)"
log "Docker Compose 版本：$(docker compose version)"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    err ".env 文件不存在，请先创建并配置 .env 文件"
    exit 1
fi

# 检查必要端口是否被占用
for port in 80 3306 3000; do
    if lsof -i :$port &> /dev/null; then
        warn "端口 $port 已被占用"
    fi
done

log "创建上传目录..."
mkdir -p server/data/audio server/data/covers server/data/avatars server/data/banners
mkdir -p server/data/forum-images server/data/forum-audio server/data/forum

log "拉取最新代码..."
if [ -d ".git" ]; then
    git pull origin main
    npm ci
    npm ci --prefix client
fi

log "构建并启动..."
docker compose build --pull
docker compose up -d

log "等待 MySQL 初始化（首次约需 30 秒）..."
sleep 15

log "检查容器状态..."
docker compose ps

log ""
log -e "${GREEN}生产环境设置完成！${NC}"
echo ""
echo "访问地址："
echo "  前端：https://你的域名（配置 Nginx + HTTPS 后）"
echo "  后端：http://你的IP:3000/api/health"
echo ""
echo "后续更新只需运行：git pull && ./deploy.sh"
