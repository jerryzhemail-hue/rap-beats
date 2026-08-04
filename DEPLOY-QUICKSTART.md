# 部署脚本使用指南

## 快速开始

```bash
cd /Users/wangzhe/Documents/work/rap-beats

# 本地开发
./deploy.sh local

# 部署到服务器
./deploy.sh deploy
```

---

## 本地开发命令

| 命令 | 说明 |
|------|------|
| `./deploy.sh local` | 启动本地 Docker 开发环境 |
| `./deploy.sh local-restart` | 重启本地服务 |
| `./deploy.sh local-stop` | 停止本地服务 |
| `./deploy.sh local-clean` | 清理本地 Docker（会删除数据） |

### 本地开发特点

- 使用本地 Docker MySQL（不影响线上数据）
- 数据存储在本地 volume
- 适合开发新功能、调试

---

## 远程部署命令

| 命令 | 说明 |
|------|------|
| `./deploy.sh deploy` | 部署到远程服务器 |
| `./deploy.sh status` | 查看服务器状态 |
| `./deploy.sh logs` | 查看所有日志 |
| `./deploy.sh logs server` | 只看后端日志 |
| `./deploy.sh logs client` | 只看前端日志 |
| `./deploy.sh restart` | 重启服务器服务 |
| `./deploy.sh rollback` | 回滚到上一备份版本 |

### 部署流程

```
1. 自动备份当前版本 → backups/日期/
2. 同步代码到服务器（rsync）
3. 在服务器上构建 Docker 镜像
4. 重启服务
5. 健康检查
```

---

## 配置说明

### 服务器配置（脚本内默认值）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_HOST` | 47.85.98.237 | 服务器 IP |
| `SERVER_USER` | root | SSH 用户名 |
| `SERVER_PORT` | 22 | SSH 端口 |
| `SERVER_DEPLOY_DIR` | /opt/rap-beats | 部署目录 |

### 自定义配置

```bash
# 方式 1: 环境变量
export SERVER_HOST=1.2.3.4
./deploy.sh deploy

# 方式 2: 直接修改脚本（不推荐）
```

---

## 开发流程示例

### 场景 1: 开发新功能

```bash
# 1. 启动本地开发
./deploy.sh local

# 2. 打开浏览器 http://localhost 开发调试
#    （注意：本地开发读写的是线上 MySQL！）

# 3. 开发完成，停止本地服务
./deploy.sh local-stop
```

### 场景 2: 部署新功能

```bash
# 1. 确保本地代码没问题

# 2. 部署到服务器
./deploy.sh deploy

# 3. 查看部署结果
./deploy.sh status
./deploy.sh logs server

# 4. 测试网站
#    http://47.85.98.237
```

### 场景 3: 回滚（出问题时）

```bash
# 1. 查看可用备份
./deploy.sh rollback
# 会列出: 20260804_083000, 20260803_120000, ...

# 2. 输入备份目录名回滚
#    输入: 20260804_083000

# 3. 确认回滚完成
./deploy.sh status
```

### 场景 4: 查看日志

```bash
# 查看所有日志
./deploy.sh logs

# 只看后端（API）
./deploy.sh logs server

# 只看前端
./deploy.sh logs client

# 只看数据库
./deploy.sh logs mysql
```

---

## 数据说明

### 数据库

- **本地开发**: 连接远程服务器 MySQL（数据同步）
- **服务器部署**: 使用服务器本地 MySQL

### 文件存储

所有上传文件（音频、图片）存在阿里云 OSS，本地和服务器共用，不需要同步。

---

## 常见问题

### Q: 部署时报 "Connection refused"

```bash
# 测试 SSH 连接
ssh root@47.85.98.237 "echo OK"

# 如果失败，配置 SSH 密钥
ssh-copy-id root@47.85.98.237
```

### Q: 部署后网站打不开

```bash
# 查看后端日志
./deploy.sh logs server

# 重启服务
./deploy.sh restart

# 查看状态
./deploy.sh status
```

### Q: 想修改服务器配置

```bash
# SSH 登录
ssh root@47.85.98.237
cd /opt/rap-beats

# 编辑配置
vim .env

# 重启生效
docker compose restart
```

---

## 命令速查表

```
本地开发          远程部署
─────────────    ─────────────
./deploy.sh      ./deploy.sh
  local            deploy
                  ./deploy.sh
                    status
                  ./deploy.sh
                    logs
                  ./deploy.sh
                    restart
                  ./deploy.sh
                    rollback
```
