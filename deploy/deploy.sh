#!/bin/bash
# ============================================================
# 生产环境部署脚本（后续更新使用）
# 在服务器上运行，pull 最新代码后重新构建并重启
#
# 用法：
#   ./deploy.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rap-beats}"
cd "$DEPLOY_DIR"

log()  { echo -e "${GREEN}[deploy]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; }

log "=== 开始部署 Rap Beats ==="

# 检查 .env
if [ ! -f "server/.env" ]; then
    err ".env 文件不存在，请先配置 server/.env"
    exit 1
fi

# Git pull（如果是用 git clone 方式部署）
if [ -d ".git" ]; then
    log "拉取最新代码..."
    git pull origin main
else
    warn "非 git 仓库，跳过 git pull"
fi

# 构建后端
log "构建后端..."
cd "$DEPLOY_DIR/server"
# 必须完整安装（含 devDependencies，构建需要 TypeScript）；上线后可 npm prune --production 精简
npm ci 2>/dev/null || npm install
npm run build

# 构建前端
log "构建前端..."
cd "$DEPLOY_DIR/client"
npm ci 2>/dev/null || npm install
npm run build

# 同步静态资源
log "同步前端构建产物到 Nginx 目录..."
mkdir -p /var/www/rap-beats/client
if command -v rsync &>/dev/null; then
    rsync -av --delete "$DEPLOY_DIR/client/dist/" /var/www/rap-beats/client/
else
    cp -r "$DEPLOY_DIR/client/dist/"* /var/www/rap-beats/client/
fi
chown -R www-data:www-data /var/www/rap-beats

# 启动/重启 Node.js
log "重启 Node.js 服务..."
cd "$DEPLOY_DIR/server"
if pm2 describe rap-beats-server &>/dev/null; then
    pm2 restart rap-beats-server --update-env
else
    pm2 start "$DEPLOY_DIR/deploy/ecosystem.config.js"
fi
pm2 save

# 重新加载 Nginx
log "重载 Nginx..."
nginx -t && systemctl reload nginx

# 健康检查
log "健康检查..."
for i in $(seq 1 10); do
    if curl -sf http://127.0.0.1:3000/api/health &>/dev/null; then
        log "后端服务健康 ✓"
        break
    fi
    if [ "$i" -eq 10 ]; then
        warn "后端健康检查超时，请运行 pm2 logs rap-beats-server 排查"
    fi
    sleep 2
done

log ""
log "=== 部署完成 ==="
echo "前端：$(curl -sf http://127.0.0.1/ 2>/dev/null && echo 'Nginx 运行中' || echo '请检查 Nginx')"
echo "后端：$(pm2 describe rap-beats-server | grep -q 'online' && echo 'PM2 运行中' || echo '请检查 PM2')"
