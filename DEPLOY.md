# Rap Beats - 自动化部署指南

本项目使用 Docker + GitHub Actions 实现 push 到 main 分支自动构建和部署。

---

## 目录

- [服务器购买建议](#服务器购买建议)
- [第一步：购买并初始化服务器](#第一步购买并初始化服务器)
- [第二步：配置 GitHub Secrets 和 Variables](#第二步配置-github-secrets-和-variables)
- [第三步：上传项目到服务器](#第三步上传项目到服务器)
- [第四步：初始化服务器](#第四步初始化服务器)
- [第五步：配置 HTTPS](#第五步配置-https)
- [常见问题](#常见问题)

---

## 服务器购买建议

### 推荐配置

| 配置项 | 最低配置 | 推荐配置 |
|--------|---------|---------|
| CPU | 2 核 | 2 核 |
| 内存 | 2 GB | 2 GB |
| 系统盘 | 40 GB SSD | 60 GB SSD |
| 带宽 | 3 Mbps | 5 Mbps |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| 价格 | ~30 元/月 | ~50 元/月 |

### 推荐厂商

| 厂商 | 特点 | 官网 |
|------|------|------|
| 阿里云 ECS | 稳定、客服好、新用户优惠 | aliyun.com |
| 腾讯云 Lighthouse | 性价比高、适合个人项目 | cloud.tencent.com |
| UCloud | 价格实惠 | ucloud.cn |
| 雨云 | 最便宜、适合尝鲜 | rainyun.com |

> **新手推荐阿里云或腾讯云**，有完善的控制台和文档，客服响应快。

### 注意事项

- **地域选择**：选择离目标用户最近的地域（如用户在国内选国内节点）
- **安全组**：购买后在控制台开放 **22（SSH）**、**80（HTTP）**、**443（HTTPS）** 端口
- **Ubuntu 版本**：建议用 **Ubuntu 22.04 LTS**，长期支持稳定

---

## 第一步：购买并初始化服务器

### 1.1 购买服务器

1. 在云厂商控制台购买一台 ECS/Lighthouse 实例
2. 选择：Ubuntu 22.04 LTS、2核2G、60GB SSD
3. 设置 root 密码，绑定弹性公网 IP
4. 在安全组中开放端口：**22、80、443、3306**

### 1.2 本地连接服务器

```bash
# Mac/Linux 打开终端，Windows 用 PowerShell 或 Git Bash
ssh root@你的服务器IP

# 首次连接会提示确认，输入 yes 即可
# 然后输入 root 密码
```

### 1.3 创建部署用户（推荐，不是必须）

```bash
# 创建普通用户（可选，增强安全性）
adduser deploy
usermod -aG docker deploy
echo "deploy ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# 之后用 deploy 用户操作（server-setup.sh 脚本会自动适配）
su - deploy
```

---

## 第二步：配置 GitHub Secrets 和 Variables

在 GitHub 仓库页面操作：**Settings → Secrets and variables → Actions**

### Repository Variables（仓库变量）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `SERVER_HOST` | `1.2.3.4` | 服务器公网 IP |
| `SERVER_USER` | `root` 或 `deploy` | SSH 登录用户名 |
| `SERVER_DEPLOY_DIR` | `/opt/rap-beats` | 部署目录（不要改） |

### Repository Secrets（密钥，需加密存储）

> ⚠️ **重要**：不要在 GitHub 页面直接复制粘贴密钥内容，用命令行获取

**获取 SSH 私钥内容（在服务器上运行）：**

```bash
cat ~/.ssh/deploy_key
```

复制输出的全部内容（包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`）

然后在 GitHub 添加：

| Secret 名 | 值 |
|----------|-----|
| `SERVER_SSH_PRIVATE_KEY` | 上面复制的私钥完整内容 |

**获取其他密钥（在本地运行）：**

```bash
# 生成 JWT 密钥
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 复制输出的 64 位随机字符串
```

然后在 GitHub 添加：

| Secret 名 | 值 | 说明 |
|----------|-----|------|
| `JWT_SECRET` | 上面生成的随机字符串 | JWT 认证密钥 |
| `MYSQL_ROOT_PASSWORD` | `RapBeats2024!`（换成强密码） | MySQL root 密码 |
| `XUNHU_APPID` | 虎皮椒后台的应用 ID | 支付功能 |
| `XUNHU_APPSECRET` | 虎皮椒后台的应用密钥 | 支付功能 |
| `BASE_URL` | `https://你的域名` | 后端地址（配置好域名后填） |
| `CLIENT_URL` | `https://你的域名` | 前端地址（配置好域名后填） |
| `STORAGE_DRIVER` | `oss` | 存储方式 |
| `OSS_REGION` | `oss-cn-beijing` | 阿里云 OSS 区域 |
| `OSS_BUCKET` | `your-bucket-name` | OSS Bucket 名称 |
| `OSS_ACCESS_KEY_ID` | 阿里云 AccessKey ID | 存储上传 |
| `OSS_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | 存储上传 |
| `OSS_ENDPOINT` | `oss-cn-beijing.aliyuncs.com` | OSS 端点 |
| `OSS_PUBLIC_BASE_URL` | `https://your-cdn-domain.com` | CDN 域名 |
| `DB_NAME` | `rap_beats` | 数据库名 |
| `FORUM_DB_NAME` | `rap_beats_forum` | 论坛数据库名 |

---

## 第三步：上传项目到服务器

### 方式 A：直接打包上传（推荐首次）

```bash
# 在本地项目根目录执行
cd /Users/wangzhe/Documents/work/rap-beats

# 排除敏感文件，只上传必要文件
rsync -avz --exclude='node_modules' \
         --exclude='.git' \
         --exclude='client/node_modules' \
         --exclude='server/node_modules' \
         --exclude='client/dist' \
         --exclude='server/dist' \
         --exclude='*.db' \
         --exclude='.env' \
         ./ root@你的服务器IP:/opt/rap-beats/
```

### 方式 B：推送到 GitHub（推荐后续）

```bash
# 在本地
git init
git add .
git commit -m "feat: 添加 Docker + CI/CD 自动化部署"
git remote add origin https://github.com/你的用户名/rap-beats.git
git push -u origin main
```

> 首次需要创建 GitHub 仓库（https://github.com/new）

---

## 第四步：初始化服务器

SSH 登录服务器后：

```bash
cd /opt/rap-beats

# 给脚本加执行权限
chmod +x server-setup.sh deploy-prod.sh deploy.sh

# 运行服务器初始化脚本
./server-setup.sh
```

脚本会自动：
1. 安装 Docker
2. 配置 Docker 镜像加速（从国内拉取更快）
3. 创建部署目录
4. 生成 SSH 部署密钥
5. 配置防火墙

### 首次部署

```bash
# 复制环境变量模板
cp .env.production .env

# 编辑 .env，填入真实密钥
vim .env

# 运行部署
./deploy-prod.sh
```

### 验证部署成功

```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 测试后端
curl http://localhost:3000/api/health

# 测试前端
curl http://localhost
```

---

## 第五步：配置 HTTPS

部署成功后，用 Let's Encrypt 免费证书配置 HTTPS：

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 申请证书（先把域名解析到服务器 IP）
certbot --nginx -d 你的域名.com -d www.你的域名.com

# 自动续期（certbot 会自动配置 cronjob）
```

### 如果没有域名，只是测试

修改 `docker-compose.prod.yml`，把 client 端口改为其他端口：

```yaml
client:
  ports:
    - "8080:80"  # 改这里
```

然后用 `http://服务器IP:8080` 访问。

---

## 常见问题

### Q: CI/CD 部署失败，提示 "permission denied"

**原因**：SSH 密钥没有正确配置
**解决**：
```bash
# 在服务器上确保公钥已添加
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Q: 后端容器启动失败，日志显示 "Connection refused" MySQL

**原因**：MySQL 还没初始化完成，后端就启动了
**解决**：已配置 `depends_on: mysql: condition: service_healthy`，等待 30 秒再试：
```bash
docker compose -f docker-compose.prod.yml up -d
sleep 30
docker compose -f docker-compose.prod.yml logs server
```

### Q: 镜像拉取失败，特别是 ghcr.io

**原因**：GitHub Container Registry 需要登录
**解决**：
```bash
# 在服务器上登录
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```
CI/CD 流程中会自动登录，不需要手动操作。

### Q: 部署后前端报 502 Bad Gateway

**原因**：后端还没启动完成
**解决**：等待 15-30 秒刷新，或者检查：
```bash
docker compose -f docker-compose.prod.yml logs server
docker compose -f docker-compose.prod.yml logs client
```

### Q: 如何更新部署配置（如修改环境变量）？

```bash
# SSH 到服务器
ssh root@你的服务器IP

# 编辑 .env
cd /opt/rap-beats
vim .env

# 重启服务
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Q: 如何查看容器日志？

```bash
# 实时查看所有日志
docker compose -f docker-compose.prod.yml logs -f

# 只看后端日志
docker compose -f docker-compose.prod.yml logs -f server

# 查看最近 100 行
docker compose -f docker-compose.prod.yml logs --tail=100
```

### Q: 如何完全重建（清空数据）？

```bash
cd /opt/rap-beats
docker compose -f docker-compose.prod.yml down -v   # ⚠️ 会删除数据库
docker compose -f docker-compose.prod.yml up -d
```
