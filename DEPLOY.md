# Rap Beats - 部署指南

> 本文档说明 **生产部署** 与 **本地开发** 的当前架构。
> 历史版本中"本地读写线上 MySQL"的描述已废弃——本地现在是完全隔离的 Docker MySQL。
>
> 当前主部署路径：GitHub Actions（`.github/workflows/deploy.yml`）。
> 备胎路径：本地脚本 `./deploy.sh deploy`（SSH + rsync + 服务器本地 build）。

---

## 目录

- [架构总览](#架构总览)
- [本地开发](#本地开发)
- [生产部署（GitHub Actions，主路径）](#生产部署github-actions主路径)
- [生产部署（./deploy.sh，备胎）](#生产部署deploysh备胎)
- [服务器管理](#服务器管理)
- [数据与存储](#数据与存储)
- [常见问题](#常见问题)

---

## 架构总览

| 环境 | MySQL | 应用部署方式 | 文件存储 |
| --- | --- | --- | --- |
| 本地开发 | Docker MySQL（端口 `3307`，库 `rap_beats_dev` + `rap_beats_forum_dev`） | 主机跑 `npm run dev`（后端 `localhost:3000`，前端 `localhost:5173`） | `STORAGE_DRIVER=oss` 时使用 OSS `dev/*` 前缀，或 `local` 时存 `server/data/` |
| 生产 | 服务器本地 MySQL（端口 `3306`，库 `rap_beats` + `rap_beats_forum`），或外部 MySQL | CI 推镜像到 `ghcr.io`，服务器 `docker compose pull` 后重启 | 阿里云 OSS（`STORAGE_DRIVER=oss`） |

数据流：

```
本地开发：  client → server(本机 npm run dev) → Docker MySQL:3307 ─┐
                                                                    ├─ 数据隔离（端口、库名、账号都不同）
线上生产：  client → server(容器) → MySQL:3306 ─────────────────────┘
```

---

## 本地开发

### 启动开发环境

```bash
# 一体化脚本（推荐）：启动 MySQL + 后端 + 前端
./deploy.sh local
```

脚本做了什么：

- 用 `docker-compose.dev.yml` 启动本地 MySQL（端口 `3307`）
- 等待 MySQL 健康检查通过
- 后台启动 `server`（`npm run dev`），写日志到 `logs/backend.log`
- 打印状态面板，提示手动 `cd client && npm run dev` 启动前端

### 单独启动本地 MySQL

如果你只想要 MySQL 容器，自己跑后端 / 前端：

```bash
docker compose -f docker-compose.dev.yml up -d mysql
```

首次启动会自动创建主库 `rap_beats_dev` 和论坛库 `rap_beats_forum_dev`（`docker/mysql-dev-init/01-create-forum-db.sql`）。

### 本地 .env 配置

`server/.env`（推荐）或根目录 `.env` 二选一。仓库里都有现成配置：

- `server/.env` 已经连好 Docker MySQL（端口 `3307`，账号 `root / dev_root_2024`，库 `rap_beats_dev` + `rap_beats_forum_dev`），OSS 走 `dev/*` 前缀
- 根目录 `.env` 连 Homebrew MySQL（端口 `3306`），适合不想装 Docker 的情况

⚠️ 两套二选一，不要同时存在导致互相覆盖。`server/.env` 与 `DEVELOP.md` 的命令更对齐。

### 本地开发命令

| 命令 | 说明 |
| --- | --- |
| `./deploy.sh local` | 启动本地 MySQL + 后端 |
| `./deploy.sh local-stop` | 停止本地服务 |
| `./deploy.sh local-clean` | 清理本地 Docker（删除数据库数据） |
| `cd server && npm run dev` | 仅启动后端（假设 MySQL 已就绪） |
| `cd client && npm run dev` | 仅启动前端 |

### 本地开发特点

- **完全隔离**：MySQL 用独立容器、独立端口、独立库名，与线上零共享
- 文件存储：用 `STORAGE_DRIVER=oss` + `OSS_*_PREFIX=dev/*` 隔离到线上 OSS 的 `dev/` 子目录，或 `local` 存 `server/data/`
- 后端 `MOCK_PAYMENT_ENABLED=true` 走模拟支付（生产环境无此开关）
- 后端 `RATE_LIMIT_DISABLED=true` 关闭限流，方便跑测试（生产环境无此开关）

---

## 生产部署（GitHub Actions，主路径）

**推荐方式**：推代码到 `main` 分支后自动部署。

### 工作流

`.github/workflows/deploy.yml` 触发后：

1. 构建 server / client Docker 镜像并推送到 `ghcr.io/${{ github.repository_owner }}/rap-beats-{server,client}:{latest,sha}`
2. SSH 登录服务器（使用 `SERVER_SSH_PRIVATE_KEY` secret），先 `mysqldump` 备份双库到 `/opt/rap-beats/backups`
3. 同步 `docker-compose.prod.yml` 到服务器
4. 服务器上 `docker compose pull` 拉新镜像 + `up -d` 重启容器（MySQL 数据卷保留）
5. 健康检查 `curl http://127.0.0.1:3000/api/health`

### 首次服务器设置（一次性）

```bash
# 本机
ssh root@<SERVER_IP>
./server-setup.sh
```

`server-setup.sh` 会：

- 安装 Docker
- 配置镜像加速（`/etc/docker/daemon.json`）
- 生成 SSH 部署密钥（`~/.ssh/deploy_key`），把公钥加到 `authorized_keys`，私钥复制到 GitHub Secret
- 配置 UFW（开放 22/80/443）
- 检查 CPU/内存/磁盘

### GitHub 仓库配置

在 GitHub 仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `SERVER_SSH_PRIVATE_KEY` | `server-setup.sh` 生成的私钥全文 |
| Secret | `MYSQL_ROOT_PASSWORD` | 服务器 MySQL root 密码 |
| Secret | `JWT_SECRET` | 64 字符随机串（`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`） |
| Secret | `XUNHU_APPID` | 虎皮椒 APPID |
| Secret | `XUNHU_APPSECRET` | 虎皮椒 APPSECRET |
| Secret | `OSS_ACCESS_KEY_ID` | 阿里云 AccessKey ID |
| Secret | `OSS_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| Variable | `SERVER_HOST` | 服务器 IP（如 `47.85.98.237`） |
| Variable | `SERVER_USER` | SSH 用户（默认 `root`） |
| Variable | `SERVER_DEPLOY_DIR` | 部署目录（默认 `/opt/rap-beats`） |
| Variable | `DB_NAME` | 主库名（默认 `rap_beats`） |
| Variable | `FORUM_DB_NAME` | 论坛库名（默认 `rap_beats_forum`） |
| Variable | `OSS_REGION` / `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_PUBLIC_BASE_URL` | 阿里云 OSS 配置 |
| Variable | `BASE_URL` / `CLIENT_URL` | 后端 / 前端域名 |
| Variable | `STORAGE_DRIVER` | `oss`（默认） |
| Variable | `XUNHU_GATEWAY` | 虎皮椒网关 |

### 日常部署

```bash
git add . && git commit -m "feat: ..."
git push origin main
```

GitHub Actions 会自动构建并部署。部署日志在 GitHub Actions 页面查看。

---

## 生产部署（./deploy.sh，备胎）

在没有 GitHub Actions 时使用：从本机 SSH 到服务器，rsync 同步代码，服务器本地 build 镜像并重启。

### 首次部署

```bash
# 1. SSH 公钥登录服务器
ssh-copy-id root@<SERVER_IP>

# 2. 一键部署
./deploy.sh deploy
```

脚本做了什么：

1. SSH 到服务器，备份当前 `server/dist` / `client/dist` / `.env` 到 `backups/<时间戳>/`
2. rsync 同步代码到 `${SERVER_DEPLOY_DIR}`（默认 `/opt/rap-beats`），排除 `node_modules`、`.git`、`dist`、`*.db`、`.env`、`backups`、`data`
3. 服务器上 `docker compose build --pull server client bpm`
4. `docker compose up -d --remove-orphans`
5. 健康检查

### 配置说明

部署脚本读取以下环境变量（脚本内有默认值）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `47.85.98.237` | 服务器 IP |
| `SERVER_USER` | `root` | SSH 用户名 |
| `SERVER_PORT` | `22` | SSH 端口 |
| `SERVER_DEPLOY_DIR` | `/opt/rap-beats` | 部署目录 |

设置方式：

```bash
export SERVER_HOST=1.2.3.4
export SERVER_USER=deploy
./deploy.sh deploy
```

---

## 服务器管理

| 命令 | 说明 |
| --- | --- |
| `./deploy.sh status` | 查看容器状态 + 资源使用 |
| `./deploy.sh logs` | 查看所有容器日志 |
| `./deploy.sh logs server` | 仅后端日志 |
| `./deploy.sh logs client` | 仅前端日志 |
| `./deploy.sh logs mysql` | 仅 MySQL 日志 |
| `./deploy.sh restart` | 重启所有容器 |
| `./deploy.sh rollback` | 列出可用备份，输入备份目录名回滚 |

---

## 数据与存储

### 数据库

- **本地开发**：独立 Docker MySQL（端口 `3307`，库 `rap_beats_dev` + `rap_beats_forum_dev`），与线上零共享
- **生产**：服务器本地 MySQL（端口 `3306`，库 `rap_beats` + `rap_beats_forum`），数据卷 `mysql_data` 持久化
- 数据导出/导入（如需从生产拉测试数据）：
  ```bash
  # 生产服务器导出
  mysqldump -u root -p rap_beats > beats.sql
  mysqldump -u root -p rap_beats_forum > forum.sql
  # 本地导入
  mysql -h 127.0.0.1 -P 3307 -u root -pdev_root_2024 rap_beats_dev < beats.sql
  mysql -h 127.0.0.1 -P 3307 -u root -pdev_root_2024 rap_beats_forum_dev < forum.sql
  ```

### 数据库自动备份

生产服务器每天凌晨 3:00 自动 `mysqldump` 双库到 `/opt/rap-beats/backups`：

```bash
crontab -e
# 添加：
0 3 * * * /opt/rap-beats/scripts/backup.sh >> /var/log/rap-beats/backup.log 2>&1
```

### 文件存储

- 生产：`STORAGE_DRIVER=oss`，所有上传走阿里云 OSS 根目录
- 本地：`STORAGE_DRIVER=oss` + `OSS_*_PREFIX=dev/*` 落到线上 OSS 的 `dev/` 子目录（已配置在 `server/.env`），或 `STORAGE_DRIVER=local` 存 `server/data/`
- 上传类接口返回的 `uploadUrl` / `image_url` / `audio_url` 必须含 `/dev/`（仅本地）

### 环境变量

服务器上的 `.env` 文件**不会被部署覆盖**（`./deploy.sh` 的 rsync 排除了 `.env`），保持独立配置。CI 部署通过 GitHub Variables/Secrets 注入到容器环境变量。

---

## 常见问题

### Q: 部署失败，提示 "Connection refused"

```bash
ssh root@<SERVER_IP> "echo OK"
# 失败则：ssh-copy-id root@<SERVER_IP>
```

### Q: 部署后网站打不开

```bash
./deploy.sh logs server   # 看后端报错
./deploy.sh status        # 看容器状态
./deploy.sh restart       # 重启
```

### Q: 想修改服务器配置

```bash
ssh root@<SERVER_IP>
cd /opt/rap-beats
vim .env       # 修环境变量
# 容器内变量通过 docker-compose.prod.yml + .env 注入；改完后：
docker compose restart server
```

### Q: 本地启动后端报错 "Unknown database 'rap_beats_forum_dev'"

说明 `docker-compose.dev.yml` 没有自动建论坛库。两种修法：

1. 推荐：用挂载脚本的方式（已支持）。首次启动会自动创建论坛库，**仅在数据目录为空时执行**。如已存在旧 volume，先 `docker compose -f docker-compose.dev.yml down -v` 再启动。
2. 手动：
   ```bash
   docker exec rap-beats-dev-mysql mysql -uroot -pdev_root_2024 \
     -e "CREATE DATABASE IF NOT EXISTS rap_beats_forum_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   ```

### Q: 如何完全重建（清空数据）

⚠️ **谨慎操作，会删除数据库数据**

```bash
ssh root@<SERVER_IP>
cd /opt/rap-beats
docker compose down -v
docker compose up -d
```

---

## 目录结构

```
rap-beats/
├── server/                  # 后端源码
│   └── src/
├── client/                  # 前端源码
│   └── src/
├── bpm_service/             # Python librosa BPM 旁车
├── docker/
│   └── mysql-dev-init/      # 本地 MySQL 首次启动脚本（自动建论坛库）
├── deploy.sh                # 一体化部署脚本（local/deploy/status/logs/...）
├── server-setup.sh          # 服务器首次设置（一次性）
├── deploy-prod.sh           # 服务器首次部署（一次性，已废弃，CI 接管后不需跑）
├── docker-compose.yml       # 本地一体化栈（MySQL + server + client + bpm）
├── docker-compose.dev.yml   # 本地开发 MySQL（端口 3307）
├── docker-compose.prod.yml  # 生产 compose（CI 用，从 ghcr.io 拉镜像）
├── docker-compose.test.yml  # 集成测试栈（端口 3308/3100/8080）
├── .github/workflows/deploy.yml  # GitHub Actions 主部署流
├── .env.production          # 生产环境变量模板（参考用，实际用 GitHub Secrets 注入）
├── Dockerfile.server        # 后端镜像构建
├── Dockerfile.client        # 前端镜像构建
└── Dockerfile.bpm           # BPM 旁车镜像构建
```
