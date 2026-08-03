#!/bin/bash
# ============================================================
# 服务器首次设置脚本（一次性执行）
# 在新服务器上运行一次，后续部署由 GitHub Actions 自动完成
#
# 用法：
#   ./server-setup.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo ""
echo "=============================================="
echo "   Rap Beats - 服务器首次设置"
echo "=============================================="
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    err "请用 root 用户或 sudo 运行此脚本"
    exit 1
fi

# ============================================================
# 1. 安装 Docker
# ============================================================
log "1/6 安装 Docker..."
if command -v docker &> /dev/null; then
    log "Docker 已安装：$(docker --version)"
else
    warn "Docker 未安装，开始安装..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release

    # 添加 Docker 官方 GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # 添加 Docker 仓库
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # 启动 Docker
    systemctl enable docker
    systemctl start docker
    log "Docker 安装完成：$(docker --version)"
fi

# ============================================================
# 2. 配置 Docker 镜像加速
# ============================================================
log "2/6 配置 Docker 镜像加速..."
if ! grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
    systemctl reload docker
    log "镜像加速配置完成"
else
    log "镜像加速已配置"
fi

# ============================================================
# 3. 创建部署目录
# ============================================================
log "3/6 创建部署目录..."
DEPLOY_DIR="${DEPLOY_DIR:-/opt/rap-beats}"
mkdir -p "$DEPLOY_DIR"
chown -R $(whoami):$(whoami) "$DEPLOY_DIR" 2>/dev/null || true
log "部署目录：$DEPLOY_DIR"

# ============================================================
# 4. 生成 SSH 部署密钥（用于 GitHub Actions 免密登录）
# ============================================================
log "4/6 生成 SSH 部署密钥..."
SSH_KEY_PATH="$HOME/.ssh/deploy_key"
if [ ! -f "$SSH_KEY_PATH" ]; then
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "github-actions-deploy"
    log "SSH 密钥已生成：$SSH_KEY_PATH"
    info "请将以下公钥添加到服务器的 authorized_keys："
    echo ""
    cat "$SSH_KEY_PATH.pub"
    echo ""
    warn "⚠️ 复制上面的公钥，然后执行："
    echo "   echo '$(cat $SSH_KEY_PATH.pub)' >> ~/.ssh/authorized_keys"
    echo ""
    warn "⚠️ 然后将私钥内容添加到 GitHub Secrets："
    info "  1. 打开 GitHub 仓库 → Settings → Secrets and variables → Actions"
    info "  2. 新建 Secret：SERVER_SSH_PRIVATE_KEY，值为 $SSH_KEY_PATH 文件的完整内容"
    info "  3. 新建 Repository Variable：SERVER_HOST = 你的服务器 IP"
    info "  4. 新建 Repository Variable：SERVER_DEPLOY_DIR = $DEPLOY_DIR"
    info "  5. 新建 Repository Variable：SERVER_USER = $(whoami)"
    echo ""
    read -p "按回车继续（配置好 SSH 公钥后）..."
else
    log "SSH 密钥已存在：$SSH_KEY_PATH"
fi

# 测试 SSH 密钥
info "测试 SSH 密钥配置..."
if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no localhost echo "SSH OK" 2>/dev/null; then
    log "SSH 本地连接正常"
else
    warn "SSH 配置可能有问题，请确保公钥已添加到 authorized_keys"
fi

# ============================================================
# 5. 配置防火墙
# ============================================================
log "5/6 配置防火墙（UFW）..."
if command -v ufw &> /dev/null; then
    ufw allow ssh
    ufw allow http
    ufw allow https
    ufw --force enable
    log "防火墙已配置（开放 SSH/HTTP/HTTPS）"
else
    warn "UFW 未安装，跳过防火墙配置（建议手动配置）"
fi

# ============================================================
# 6. 检查系统资源
# ============================================================
log "6/6 检查系统资源..."
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
CPU=$(nproc)
DISK=$(df -h / | awk 'NR==2{print $2}')
log "CPU：${CPU} 核"
log "内存：${MEM_MB} MB"
log "磁盘：${DISK}"
if [ "$MEM_MB" -lt 1024 ]; then
    warn "内存小于 1GB，生产环境建议至少 2GB"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}   服务器设置完成！${NC}"
echo "=============================================="
echo ""
echo "下一步操作："
echo ""
echo "1. 将公钥添加到服务器："
echo "   echo '$(cat $SSH_KEY_PATH.pub)' >> ~/.ssh/authorized_keys"
echo ""
echo "2. 配置 GitHub Secrets（在 GitHub 仓库设置中）："
echo "   • SERVER_SSH_PRIVATE_KEY  → $SSH_KEY_PATH 内容"
echo "   • SERVER_HOST             → 服务器 IP（如 1.2.3.4）"
echo "   • SERVER_DEPLOY_DIR       → $DEPLOY_DIR"
echo "   • SERVER_USER             → $(whoami)"
echo ""
echo "3. 配置 .env.production 环境变量后上传到服务器"
echo "   部署目录：$DEPLOY_DIR"
echo ""
echo "4. 首次部署：./deploy-prod.sh"
echo ""
echo "5. 后续更新：push 到 main 分支，CI/CD 自动部署"
echo ""
