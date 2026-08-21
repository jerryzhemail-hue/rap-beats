# 部署脚本使用指南

> 本文档是 `./deploy.sh` 的速查表。完整说明看 `DEPLOY.md`。

---

## 快速开始

```bash
cd /Users/wangzhe/Documents/work/rap-beats

# 本地开发
./deploy.sh local

# 部署到服务器（手动备胎路径，推荐用 GitHub Actions）
./deploy.sh deploy
```

---

## 本地开发命令

| 命令 | 说明 |
| --- | --- |
| `./deploy.sh local` | 启动本地 Docker MySQL（端口 3307）+ 后端 |
| `./deploy.sh local-restart` | 重启本地服务 |
| `./deploy.sh local-stop` | 停止本地服务 |
| `./deploy.sh local-clean` | 清理本地数据库（删除 volume） |

### 本地开发特点

- 使用本地 Docker MySQL（端口 `3307`，库 `rap_beats_dev` + `rap_beats_forum_dev`）
- 首次启动会自动建好两个库（`docker/mysql-dev-init/01-create-forum-db.sql`）
- **数据完全隔离，不影响线上**
- OSS 走 `dev/*` 前缀，与线上根目录隔离
- 模拟支付 + 关闭限流都已配置在 `server/.env`（生产环境这两个开关都是关的）

---

## 远程部署命令（备胎路径）

主部署走 GitHub Actions（`.github/workflows/deploy.yml`）。下面这些命令是手动部署的备胎。

| 命令 | 说明 |
| --- | --- |
| `./deploy.sh deploy` | rsync 同步代码到服务器 + 本地 build + 重启 |
| `./deploy.sh status` | 查看服务器容器状态 |
| `./deploy.sh logs` | 查看所有日志 |
| `./deploy.sh logs server` | 只看后端 |
| `./deploy.sh logs client` | 只看前端 |
| `./deploy.sh logs mysql` | 只看 MySQL |
| `./deploy.sh restart` | 重启服务器服务 |
| `./deploy.sh rollback` | 回滚到指定备份 |

### 部署流程（手动）

```
1. SSH 备份当前版本 → backups/<时间戳>/
2. rsync 同步代码到服务器（排除 node_modules / .git / dist / .env / data）
3. 服务器上 docker compose build --pull
4. docker compose up -d --remove-orphans
5. 健康检查
```

---

## GitHub Actions（主部署路径）

推送 `main` 分支后自动部署。需要在 GitHub 仓库配置：

| 类型 | 名称 |
| --- | --- |
| Secret | `SERVER_SSH_PRIVATE_KEY` |
| Secret | `MYSQL_ROOT_PASSWORD` / `JWT_SECRET` |
| Secret | `XUNHU_APPID` / `XUNHU_APPSECRET` |
| Secret | `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` |
| Variable | `SERVER_HOST` / `SERVER_USER` / `SERVER_DEPLOY_DIR` |
| Variable | `DB_NAME` / `FORUM_DB_NAME` |
| Variable | `OSS_REGION` / `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_PUBLIC_BASE_URL` |
| Variable | `BASE_URL` / `CLIENT_URL` |
| Variable | `STORAGE_DRIVER` / `XUNHU_GATEWAY` |

首次服务器初始化：

```bash
ssh root@<SERVER_IP>
./server-setup.sh
```

---

## 配置说明

### 服务器配置（脚本内默认值）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `47.85.98.237` | 服务器 IP |
| `SERVER_USER` | `root` | SSH 用户名 |
| `SERVER_PORT` | `22` | SSH 端口 |
| `SERVER_DEPLOY_DIR` | `/opt/rap-beats` | 部署目录 |

### 自定义配置

```bash
# 方式 1: 环境变量
export SERVER_HOST=1.2.3.4
export SERVER_USER=deploy
./deploy.sh deploy

# 方式 2: 直接修改脚本（不推荐）
```

---

## 数据说明

### 数据库

- **本地开发**：Docker MySQL，端口 `3307`，库 `rap_beats_dev` + `rap_beats_forum_dev`，**与生产完全隔离**
- **服务器**：本地 MySQL，端口 `3306`，库 `rap_beats` + `rap_beats_forum`

### 文件存储

- 生产：阿里云 OSS 根目录
- 本地：OSS `dev/*` 前缀（已在 `server/.env` 配置）或本地 `server/data/`

---

## 常见问题

### Q: 部署时报 "Connection refused"

```bash
ssh root@<SERVER_IP> "echo OK"
# 失败：ssh-copy-id root@<SERVER_IP>
```

### Q: 本地启动报 "Unknown database 'rap_beats_forum_dev'"

```bash
docker exec rap-beats-dev-mysql mysql -uroot -pdev_root_2024 \
  -e "CREATE DATABASE IF NOT EXISTS rap_beats_forum_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
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
vim .env
docker compose restart server
```

---

## 命令速查表

```
本地开发          手动部署          服务器管理
─────────────    ─────────────    ─────────────
./deploy.sh      ./deploy.sh      ./deploy.sh
  local            deploy           status
                  ./deploy.sh      ./deploy.sh
                    logs             logs
                  ./deploy.sh      ./deploy.sh
                    restart          rollback
```
