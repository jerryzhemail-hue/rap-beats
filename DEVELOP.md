# 本地开发指南

本文档说明如何在本地启动独立于线上环境的开发环境。

---

## 环境隔离说明

| 项目 | 本地开发 | 线上生产 |
|------|---------|---------|
| 数据库 | `rap_beats_dev` (端口 3307) | `rap_beats` (端口 3306) |
| 存储 | 本地文件系统 | 阿里云 OSS |
| API 地址 | localhost:3000 | api.xxx.com |
| 前端地址 | localhost:5173 | www.xxx.com |

---

## 快速开始

### 1. 启动本地 MySQL

```bash
docker compose -f docker-compose.dev.yml up -d mysql
```

等待 15 秒让 MySQL 初始化完成。

### 2. 启动后端

```bash
cd server
npm run dev
```

后端会运行在 `http://localhost:3000`

### 3. 启动前端

```bash
cd client
npm run dev
```

前端会运行在 `http://localhost:5173`

---

## 使用部署脚本（推荐）

一键启动所有本地服务：

```bash
./deploy.sh local
```

其他命令：

```bash
./deploy.sh local-stop   # 停止本地服务
./deploy.sh local-clean # 清理本地数据库
```

---

## 本地数据库配置

| 配置项 | 值 |
|--------|-----|
| 主机 | 127.0.0.1 |
| 端口 | 3307 |
| 用户名 | dev_user |
| 密码 | dev_pass_2024 |
| 数据库 | rap_beats_dev |

可以用任意 MySQL 客户端连接查看：

```bash
mysql -h 127.0.0.1 -P 3307 -u dev_user -p
```

---

## 环境变量 (.env)

本地开发使用的配置文件是项目根目录的 `.env`：

```bash
# 数据库（本地 Docker）
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=dev_user
DB_PASSWORD=dev_pass_2024
DB_NAME=rap_beats_dev

# 存储（本地模式，不上传 OSS）
STORAGE_DRIVER=local

# 其他配置（可随意填，不影响开发）
JWT_SECRET=dev_jwt_secret_xxx
BASE_URL=http://localhost:5173
```

⚠️ **重要**：`.env` 文件已被 `.gitignore` 忽略，不会提交到代码仓库。

---

## 数据同步

本地数据库是**独立的**，与线上数据库完全隔离。

- 本地开发时：所有数据操作都在 `rap_beats_dev`
- 线上环境：所有数据操作都在 `rap_beats`

如果需要在本地测试线上数据，可以手动导出/导入：

```bash
# 导出线上数据（服务器上执行）
mysqldump -u root -p rap_beats > backup.sql

# 导入到本地
mysql -h 127.0.0.1 -P 3307 -u dev_user -p rap_beats_dev < backup.sql
```

---

## 常见问题

### Q: 后端启动报错 "MySQL config missing"

**原因**：`.env` 文件不存在或配置错误

**解决**：
```bash
# 检查 .env 是否存在
ls -la .env

# 如果不存在，从模板复制
cp .env.production .env
# 然后修改数据库配置为本地配置
```

### Q: 端口 3306/3307 被占用

```bash
# 查看端口占用
lsof -i :3306
lsof -i :3307

# 如果 3306 被占用，可以修改 docker-compose.dev.yml 中的端口映射
```

### Q: 前端代理不生效

确保前端开发服务器运行在 `localhost:5173`，Vite 的代理配置只对开发服务器生效。

---

## 目录结构

```
rap-beats/
├── .env                      # 本地开发环境变量（不会被提交）
├── docker-compose.dev.yml    # 本地 MySQL 配置
├── server/
│   ├── src/
│   │   └── data/           # 本地文件存储（audio, covers 等）
│   └── .env                 # 后端开发配置
└── client/
    └── src/
```

---

## 清理环境

```bash
# 停止所有服务
./deploy.sh local-stop

# 完全清理（包括删除数据库）
./deploy.sh local-clean

# 或者手动清理
docker compose -f docker-compose.dev.yml down -v
pkill -f "tsx watch src/index.ts"
```
