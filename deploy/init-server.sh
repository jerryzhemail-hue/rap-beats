#!/bin/bash
# ============================================================
# 服务器初始化脚本（非 Docker 宿主机直装方案）
# 在新服务器上运行一次即可，后续用 ./deploy.sh 部署更新
#
# 用法（以 root 运行）：
#   curl -sL https://raw.githubusercontent.com/YOUR_USERNAME/rap-beats/main/deploy/init-server.sh | bash
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }

echo ""
echo "=============================================="
echo "   Rap Beats - 服务器初始化"
echo "=============================================="
echo ""

# ============================================================
# 1. 前置检查
# ============================================================
if [ "$EUID" -ne 0 ]; then
    err "请用 root 运行此脚本，或加 sudo 前缀"
    exit 1
fi

info "检查系统环境..."
OS_ID=$(grep -oP '(?<=^ID=).*' /etc/os-release 2>/dev/null | tr -d '"')
if [ "$OS_ID" != "ubuntu" ] && [ "$OS_ID" != "debian" ]; then
    warn "非 Debian/Ubuntu 系统，部分命令可能需要调整"
fi

# ============================================================
# 2. 安装系统依赖
# ============================================================
log "1/6 安装系统依赖（Node.js 20 / MySQL 8 / Nginx / ffmpeg / Python）..."

apt-get update

# Node.js 20 LTS（通过 nodesource）
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# MySQL 8
apt-get install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Nginx
apt-get install -y nginx

# ffmpeg（音频处理 + BPM 检测）
apt-get install -y ffmpeg

# Python3 pip + librosa（BPM 检测，可选，装不上也不影响主流程）
apt-get install -y python3-pip python3-venv
pip3 install librosa --break-system-packages 2>/dev/null || warn "librosa 安装失败，BPM 检测将优雅降级"

# certbot（Let's Encrypt 免费 HTTPS 证书）
apt-get install -y certbot python3-certbot-nginx

# pm2
npm install -g pm2

log "系统依赖安装完成"
log "  Node.js:   $(node --version)"
log "  npm:       $(npm --version)"
log "  MySQL:     $(mysql --version)"
log "  ffmpeg:    $(ffmpeg -version 2>&1 | head -n1)"
log "  pm2:       $(pm2 --version)"

# ============================================================
# 3. 配置 MySQL
# ============================================================
log "2/6 配置 MySQL..."

# 启动 MySQL（如果未运行）
systemctl start mysql

# 创建数据库和专用账号
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-$(openssl rand -base64 32)}"
info "MySQL root 密码（请保存）：$MYSQL_ROOT_PASSWORD"

mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$MYSQL_ROOT_PASSWORD';"
mysql -e "FLUSH PRIVILEGES;"

mysql -e "CREATE DATABASE IF NOT EXISTS rap_beats CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE DATABASE IF NOT EXISTS rap_beats_forum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 创建应用专用账号（仅限本地访问）
APP_DB_PASSWORD=$(openssl rand -base64 24)
info "应用数据库密码（请保存）：$APP_DB_PASSWORD"
mysql -e "CREATE USER IF NOT EXISTS 'rapbeats'@'localhost' IDENTIFIED BY '$APP_DB_PASSWORD';"
mysql -e "GRANT ALL PRIVILEGES ON rap_beats.* TO 'rapbeats'@'localhost';"
mysql -e "GRANT ALL PRIVILEGES ON rap_beats_forum.* TO 'rapbeats'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

log "MySQL 配置完成"

# ============================================================
# 4. 创建部署目录
# ============================================================
log "3/6 创建部署目录..."
DEPLOY_DIR="/opt/rap-beats"
mkdir -p "$DEPLOY_DIR"/{server,client,scripts,backups,logs}
mkdir -p /var/log/rap-beats
mkdir -p /opt/rap-beats/server/data/{audio,covers,avatars,banners,forum-images,forum-audio,forum}

# 创建 www-data 用户（nginx 运行用）
useradd -r -s /usr/sbin/nologin www-data 2>/dev/null || true
chown -R www-data:www-data "$DEPLOY_DIR"

log "部署目录：$DEPLOY_DIR"

# ============================================================
# 5. 生成 SSH 部署密钥
# ============================================================
log "4/6 生成 SSH 部署密钥..."
SSH_KEY_PATH="$HOME/.ssh/deploy_key"
if [ ! -f "$SSH_KEY_PATH" ]; then
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "github-actions-deploy"
    log "SSH 密钥已生成：$SSH_KEY_PATH"
else
    log "SSH 密钥已存在"
fi

info "公钥内容（添加到 GitHub Actions SSH 部署密钥）："
echo ""
cat "$SSH_KEY_PATH.pub"
echo ""

# 添加到 authorized_keys
if ! grep -qF "$(cat $SSH_KEY_PATH.pub)" ~/.ssh/authorized_keys 2>/dev/null; then
    mkdir -p ~/.ssh
    cat "$SSH_KEY_PATH.pub" >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    log "公钥已添加到 authorized_keys"
fi

# ============================================================
# 6. 配置防火墙
# ============================================================
log "5/6 配置防火墙（UFW）..."
if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw allow ssh
    ufw allow http
    ufw allow https
    log "防火墙已配置（开放 SSH/HTTP/HTTPS）"
else
    warn "UFW 未安装，跳过防火墙配置"
fi

# ============================================================
# 7. 提示
# ============================================================
log "6/6 初始化完成！"

echo ""
echo "=============================================="
echo -e "${GREEN}   服务器初始化完成${NC}"
echo "=============================================="
echo ""
echo "服务器 IP：$(curl -s ifconfig.me)"
echo ""
echo "=============================================="
echo "下一步："
echo "=============================================="
echo ""
echo "1. 克隆代码到服务器："
echo "   git clone https://github.com/YOUR_USERNAME/rap-beats.git $DEPLOY_DIR"
echo ""
echo "2. 配置环境变量（在 $DEPLOY_DIR/server/ 下创建 .env）："
echo "   参考 $DEPLOY_DIR/server/.env.production 或 .env.example"
echo ""
echo "   必填项："
echo "   - DB_HOST=127.0.0.1"
echo "   - DB_NAME=rap_beats"
echo "   - FORUM_DB_NAME=rap_beats_forum"
echo "   - DB_USER=rapbeats"
echo "   - DB_PASSWORD=<上面生成的应用密码>"
echo "   - JWT_SECRET=<64位随机串>"
echo ""
echo "3. 构建："
echo "   cd $DEPLOY_DIR/server && npm ci && npm run build"
echo "   cd $DEPLOY_DIR/client && npm ci && npm run build"
echo ""
echo "4. 配置 Nginx（复制 deploy/nginx.conf）："
echo "   cp $DEPLOY_DIR/deploy/nginx.conf /etc/nginx/sites-available/rap-beats"
echo "   ln -sf /etc/nginx/sites-available/rap-beats /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "5. 启动服务："
echo "   pm2 start $DEPLOY_DIR/deploy/ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup（按提示配置开机自启）"
echo ""
echo "6. 配置 HTTPS（域名解析好后）："
echo "   certbot --nginx -d YOUR_DOMAIN"
echo ""
echo "7. 配置每日数据库备份 cron："
echo "   0 3 * * * /opt/rap-beats/deploy/scripts/backup.sh >> /var/log/rap-beats/backup.log 2>&1"
echo ""
