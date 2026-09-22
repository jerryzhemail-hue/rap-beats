# Rap Beats 部署文档

> 本文档描述将 rap-beats 项目部署到生产环境的标准流程，覆盖：
> - 服务器初始化、MySQL、Redis、对象存储
> - 环境变量清单（必填/可选/安全敏感）
> - 启动与健康检查
> - 反向代理（Nginx）配置
> - 数据库备份与升级
> - 故障排查清单

---

## 1. 系统要求

### 1.1 服务端

| 项 | 最低 | 推荐 | 备注 |
|---|---|---|---|
| Node.js | 20.x | 22.x LTS | ESM + 内置 fetch 需要 18+ |
| CPU | 2 vCPU | 4 vCPU | BPM 识别为单线程密集 |
| 内存 | 2 GB | 4 GB | 缓存 + Node 堆 + audio 处理 |
| 磁盘 | 30 GB | 100 GB | 数据库 + audio 文件 + cover |
| 操作系统 | Ubuntu 22.04 | Ubuntu 24.04 | systemd 兼容性最好 |

### 1.2 数据库

| 项 | 版本 | 备注 |
|---|---|---|
| MySQL | 8.0+ | 必须开启 InnoDB；推荐 utf8mb4 |
| Redis | 6.2+ | 可选，用于跨进程 VIP 缓存（当前未启用，留扩展） |

### 1.3 反向代理

| 项 | 说明 |
|---|---|
| Nginx | 推荐 1.24+；负责 TLS 终止、信任头转发、限流 |
| Let's Encrypt | 免费证书，certbot 自动续期 |

### 1.4 BPM Sidecar

BPM 识别是 CPU 密集型，已独立为 sidecar 服务：

- 仓库：`server-bpm/`
- 默认端口：5050
- 通过 `BPM_SIDECAR_URL=http://rap-beats-bpm:5050` 连接

---

## 2. 数据库初始化

### 2.1 准备 MySQL

```sql
CREATE DATABASE rap_beats CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE rap_beats_forum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE rap_beats_membership CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 应用账号（最小权限：只授予所需 3 库）
CREATE USER 'rap_beats_app'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT ALL ON rap_beats.* TO 'rap_beats_app'@'%';
GRANT ALL ON rap_beats_forum.* TO 'rap_beats_app'@'%';
GRANT ALL ON rap_beats_membership.* TO 'rap_beats_app'@'%';
FLUSH PRIVILEGES;
```

### 2.2 启用 SSL（强烈推荐）

生产环境 MySQL 必须启用 SSL：

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
require_secure_transport = ON
ssl-ca = /etc/mysql/ca.pem
ssl-cert = /etc/mysql/server-cert.pem
ssl-key = /etc/mysql/server-key.pem
```

应用侧只需配置 `MYSQL_SSL_CA` 或 `MYSQL_SSL_CA_PATH` 即可自动启用。

### 2.3 启动时自动建表

应用启动时 `initDatabase()` 自动执行 `CREATE TABLE IF NOT EXISTS`，无需手动初始化。

- 多实例部署通过 `GET_LOCK('rap_beats_schema_init')` 串行迁移
- 幂等：`schema_migrations` 表追踪已执行的迁移版本

---

## 3. 环境变量清单

> 所有变量统一从 `server/src/config.ts` 读取。**任何模块都不应直接 `process.env.X`**，应通过 `getConfig()` 获取。

### 3.1 必填（无默认值，启动会报错）

| 变量 | 说明 | 示例 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥，**必须 ≥32 字符随机** | `openssl rand -hex 32` |
| `DB_HOST` | MySQL 主库地址 | `mysql.example.com` |
| `DB_PORT` | MySQL 端口 | `3306` |
| `DB_USER` | MySQL 用户名 | `rap_beats_app` |
| `DB_PASSWORD` | MySQL 密码 | — |
| `DB_NAME` | 主库名 | `rap_beats` |
| `BASE_URL` | 服务端外网 URL（用于回调、邮件） | `https://api.example.com` |
| `CLIENT_URL` | 客户端 URL（CORS 校验） | `https://www.example.com` |

### 3.2 推荐填（生产强校验）

| 变量 | 默认 | 说明 |
|---|---|---|
| `NODE_ENV` | `development` | 生产必须设为 `production` |
| `PORT` | `3000` | 监听端口 |
| `MYSQL_SSL_CA` 或 `MYSQL_SSL_CA_PATH` | — | 生产推荐启用 SSL，配置 CA |
| `TRUST_PROXY` | — | Nginx 反代时设为 `1` 或具体 IP 段 |
| `XUNHU_APPID` | — | 虎皮椒支付 AppID |
| `XUNHU_APPSECRET` | — | 虎皮椒支付密钥 |

### 3.3 数据库三库配置（高级）

主库之外的两个分库可独立配置（默认与主库共用连接池）：

```bash
# 论坛库（默认共享主库 pool）
FORUM_DB_HOST=mysql.example.com
FORUM_DB_PORT=3306
FORUM_DB_USER=rap_beats_app
FORUM_DB_PASSWORD=...
FORUM_DB_NAME=rap_beats_forum
FORUM_DB_SHARES_MAIN_POOL=true  # 共享池（节省连接）

# 会员积分库
MEMBERSHIP_DB_HOST=mysql.example.com
MEMBERSHIP_DB_PORT=3306
MEMBERSHIP_DB_USER=rap_beats_app
MEMBERSHIP_DB_PASSWORD=...
MEMBERSHIP_DB_NAME=rap_beats_membership
MEMBERSHIP_DB_SHARES_MAIN_POOL=true
```

### 3.4 特性开关（Feature Flags）

| 变量 | 默认 | 说明 |
|---|---|---|
| `VIP_CACHE_ENABLED` | `true` | 进程内 VIP 缓存（60s TTL）；多实例时各实例独立，VIP 变更最多延迟 60s |
| `RATE_LIMIT_DISABLED` | `false` | **生产环境即使设 true 也会被忽略**（P1 加固） |
| `MOCK_PAYMENT_ENABLED` | `false` | 模拟支付；**生产强制 fail-fast**（启动会抛错） |
| `BPM_SIDECAR_URL` | `http://rap-beats-bpm:5050` | BPM sidecar 地址 |
| `ANONYMOUS_USER_ID` | `4` | 匿名用户 ID（用于未登录用户试听记录） |

### 3.5 安全相关

| 变量 | 说明 |
|---|---|
| `XUNHU_ALLOWED_IPS` | 虎皮椒回调 IP 白名单（逗号分隔），空则不限制 |

---

## 4. 启动应用

### 4.1 安装与构建

```bash
git clone https://github.com/<owner>/rap-beats.git
cd rap-beats
cd server && npm ci --omit=dev && cd ..
cd client && npm ci && npm run build && cd ..
```

### 4.2 systemd 服务（推荐）

```ini
# /etc/systemd/system/rap-beats.service
[Unit]
Description=Rap Beats Server
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=rap-beats
WorkingDirectory=/opt/rap-beats/server
EnvironmentFile=/etc/rap-beats/env
ExecStart=/usr/bin/node --enable-source-maps dist/server.js
Restart=always
RestartSec=5
LimitNOFILE=65535
# 安全沙箱
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rap-beats
sudo journalctl -u rap-beats -f  # 查看日志
```

### 4.3 健康检查

```bash
curl http://localhost:3000/api/health
# → {"status":"ok","uptime":12345}
```

---

## 5. Nginx 反代配置

```nginx
upstream rap_beats {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ── 安全响应头（helmet） ─────────────────────────────────
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ── 客户端最大上传 ─────────────────────────────────────
    client_max_body_size 50m;

    # ── 限流（粗粒度；细粒度由应用层处理） ────────────────────
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=20r/s;
    limit_req zone=api_limit burst=40 nodelay;

    location / {
        proxy_pass http://rap_beats;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        # 关键：传递真实客户端 IP（应用配置 trust proxy 后才会用 X-Forwarded-For）
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # ── 静态资源（客户端构建产物，可分离部署到 CDN） ──────
    location /assets/ {
        alias /opt/rap-beats/client/dist/assets/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

> ⚠️ **关键**：必须配置 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，否则应用层的 IP 限流会被绕过。

---

## 6. 对象存储（OSS）

音频和封面默认本地存储，生产推荐 OSS（阿里云 OSS / AWS S3）：

```bash
# 阿里云 OSS
STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=rap-beats-prod
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
# 可选：自定义 CDN 域名
OSS_CDN_DOMAIN=cdn.example.com
```

切换 OSS 后，旧本地文件不会自动迁移，需手动迁移或保留本地驱动。

---

## 7. 数据库备份

### 7.1 每日全量备份

```bash
#!/bin/bash
# /opt/rap-beats/scripts/backup.sh
set -euo pipefail
DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/backups/rap-beats
mkdir -p $BACKUP_DIR

for DB in rap_beats rap_beats_forum rap_beats_membership; do
  mysqldump --single-transaction --quick --triggers --routines \
    --events --set-gtid-purged=OFF \
    -h "$DB_HOST" -P 3306 -u "$DB_USER" -p"$DB_PASSWORD" \
    "$DB" | gzip > "$BACKUP_DIR/${DB}_${DATE}.sql.gz"
done

# 保留 30 天
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

### 7.2 启用 binlog（推荐）

开启 MySQL binlog 后可实现 PIT（Point-In-Time）恢复：

```ini
[mysqld]
server-id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
expire_logs_days = 7
```

---

## 8. 部署前 Checklist

| 检查项 | 命令 / 验证方式 |
|---|---|
| TypeScript 编译 | `cd server && npx tsc --noEmit` |
| 数据库可连接 | `mysql -h $DB_HOST -u $DB_USER -p $DB_NAME -e 'SELECT 1'` |
| 环境变量完整 | `node -e "import('./server/dist/config.js').then(m => m.getConfig())"` 不抛错 |
| JWT_SECRET 强度 | `echo "$JWT_SECRET" \| wc -c` ≥ 64 |
| MOCK_PAYMENT_ENABLED 在生产为 false | `test "$NODE_ENV" = "production" -a "$MOCK_PAYMENT_ENABLED" != "true"` |
| 反代 X-Forwarded-For 转发 | curl 带头测试，记录 IP 正确 |
| HTTPS 证书有效 | `curl -I https://api.example.com` |
| 健康检查 | `curl https://api.example.com/api/health` 返回 200 |

---

## 9. 故障排查

### 9.1 应用启动失败

| 现象 | 可能原因 |
|---|---|
| `JWT_SECRET too short` | JWT_SECRET 长度不足 |
| `MOCK_PAYMENT_ENABLED=true in production` | 生产环境误开了模拟支付 |
| `Database connection refused` | DB_HOST/PORT/防火墙 |
| `Port 3000 in use` | 端口被占用，`lsof -i:3000` |

### 9.2 性能问题

| 现象 | 排查方向 |
|---|---|
| 内存持续增长 | 检查 vipCache 是否被攻击（设 `VIP_CACHE_ENABLED=false`） |
| 下载慢 | 检查 OSS endpoint、CDN 配置 |
| 数据库连接耗尽 | 检查连接池大小、`DB_POOL_LIMIT` 是否合理 |

### 9.3 积分/VIP 不一致

| 现象 | 处理 |
|---|---|
| VIP 状态延迟刷新 | 等待 60s（VIP_CACHE_TTL_MS）或调 `invalidateVipCache(userId)` |
| 积分余额错误 | 查 `point_transactions` 流水，按 reason 倒推 |

---

## 10. 升级流程

```bash
# 1. 备份数据库
./scripts/backup.sh

# 2. 拉取新代码
cd /opt/rap-beats && git pull

# 3. 重新安装依赖并构建
cd server && npm ci --omit=dev && npx tsc
cd ../client && npm ci && npm run build

# 4. 重启服务（启动时会自动跑迁移）
sudo systemctl restart rap-beats

# 5. 验证健康
curl https://api.example.com/api/health
```

迁移是幂等的（`CREATE TABLE IF NOT EXISTS` + `schema_migrations` 追踪），可放心升级。

---

## 附录 A：常用环境变量示例

### 开发环境

```bash
NODE_ENV=development
PORT=3000
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=dev_pass
DB_NAME=rap_beats_dev
JWT_SECRET=dev_secret_at_least_32_chars_long_xxxxx
BASE_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173
MOCK_PAYMENT_ENABLED=true
VIP_CACHE_ENABLED=false
```

### 生产环境

```bash
NODE_ENV=production
PORT=3000
DB_HOST=mysql.internal
DB_USER=rap_beats_app
DB_PASSWORD=<FROM_SECRET_MANAGER>
DB_NAME=rap_beats
JWT_SECRET=<FROM_SECRET_MANAGER, 64+ chars>
BASE_URL=https://api.example.com
CLIENT_URL=https://www.example.com
MYSQL_SSL_CA_PATH=/etc/mysql/ca.pem
TRUST_PROXY=1
XUNHU_APPID=...
XUNHU_APPSECRET=...
STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=rap-beats-prod
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
```

> 生产环境的密钥必须从 Vault / AWS Secrets Manager 等注入到环境变量，不要写入镜像或 Git。
