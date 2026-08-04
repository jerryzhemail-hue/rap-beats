# Rap Beats - 部署指南

---

## 目录

- [快速开始](#快速开始)
- [本地开发](#本地开发)
- [部署到服务器](#部署到服务器)
- [服务器管理](#服务器管理)
- [数据说明](#数据说明)
- [常见问题](#常见问题)

---

## 快速开始

```bash
cd /Users/wangzhe/Documents/work/rap-beats

# 本地开发
./deploy.sh local

# 部署到服务器
./deploy.sh deploy
```

---

## 本地开发

### 启动开发环境

```bash
./deploy.sh local
```

这会启动本地 Docker 环境：
- **MySQL**: localhost:3306
- **后端 API**: http://localhost:3000
- **前端网站**: http://localhost

### 开发命令

| 命令 | 说明 |
|------|------|
| `./deploy.sh local` | 启动本地开发环境 |
| `./deploy.sh local-restart` | 重启本地服务 |
| `./deploy.sh local-stop` | 停止本地服务 |
| `./deploy.sh local-clean` | 清理本地 Docker（删除数据） |

### 注意事项

- 本地开发时，数据读写的是**远程线上 MySQL**
- 本地和服务器共用同一个数据库，数据天然同步
- 上传的文件存在阿里云 OSS，两边共用

---

## 部署到服务器

### 首次部署

```bash
# 1. 确保 SSH 密钥已配置
ssh-copy-id root@47.85.98.237

# 2. 部署
./deploy.sh deploy
```

### 部署流程

1. 自动备份当前服务器版本
2. 同步代码到服务器（rsync）
3. 在服务器上重新构建 Docker 镜像
4. 重启服务
5. 健康检查

### 配置说明

部署脚本会读取以下环境变量（可选，脚本内有默认值）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_HOST` | 47.85.98.237 | 服务器 IP |
| `SERVER_USER` | root | SSH 用户名 |
| `SERVER_PORT` | 22 | SSH 端口 |
| `SERVER_DEPLOY_DIR` | /opt/rap-beats | 部署目录 |

设置方式：
```bash
export SERVER_HOST=1.2.3.4
export SERVER_USER=deploy
./deploy.sh deploy
```

---

## 服务器管理

### 查看状态

```bash
./deploy.sh status
```

显示：容器状态、资源使用、磁盘使用

### 查看日志

```bash
./deploy.sh logs              # 查看所有日志
./deploy.sh logs server       # 只看后端日志
./deploy.sh logs client       # 只看前端日志
./deploy.sh logs mysql        # 只看数据库日志
```

### 重启服务

```bash
./deploy.sh restart
```

### 回滚版本

```bash
./deploy.sh rollback
```

会列出可用备份，输入备份目录名即可回滚。

---

## 数据说明

### 数据库

- **本地开发**: 连接远程服务器 MySQL
- **服务器**: 使用服务器本地 MySQL
- **数据同步**: 不需要手动同步，共用同一个数据库

### 文件存储

所有上传的文件（音频、图片、头像）存在阿里云 OSS：
- 本地和服务器共用同一个 OSS Bucket
- 不需要额外同步

### 环境变量

服务器上的 `.env` 文件不会被部署覆盖，保持独立配置。

---

## 常见问题

### Q: 部署失败，提示 "Connection refused"

**原因**: SSH 连接失败或 rsync 不可用
**解决**:
```bash
# 确保 SSH 密钥已配置
ssh-copy-id root@47.85.98.237

# 测试连接
ssh root@47.85.98.237 "echo OK"
```

### Q: 部署后网站打不开

**解决**:
```bash
# 查看日志
./deploy.sh logs server

# 查看容器状态
./deploy.sh status

# 重启服务
./deploy.sh restart
```

### Q: 想修改服务器配置

```bash
# SSH 登录服务器
ssh root@47.85.98.237
cd /opt/rap-beats

# 编辑配置
vim .env

# 重启生效
docker compose restart
```

### Q: 如何完全重建（清空数据）

⚠️ **谨慎操作，会删除数据库数据**

```bash
# 在服务器上执行
ssh root@47.85.98.237
cd /opt/rap-beats
docker compose down -v
docker compose up -d
```

---

## 目录结构

```
rap-beats/
├── deploy.sh              # 部署脚本（本文件）
├── docker-compose.yml     # 本地开发配置
├── docker-compose.prod.yml # 生产环境配置
├── Dockerfile.server      # 后端 Docker 配置
├── Dockerfile.client      # 前端 Docker 配置
├── server/               # 后端源码
│   └── src/
├── client/              # 前端源码
│   └── src/
└── .env.production     # 环境变量模板
```
