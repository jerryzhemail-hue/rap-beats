# Rap Beats 项目启动文档

## 项目结构

- `client`：前端项目，技术栈为 `Vue 3 + Vite + TypeScript`
- `server`：后端项目，技术栈为 `Express + TypeScript`
- `server/data`：本地 SQLite 数据文件与本地存储资源目录

## 运行环境

在本地启动项目前，请先确认以下环境已经安装：

- `Node.js` 18 及以上
- `npm` 9 及以上
- `MySQL 8/9`，如果你准备使用 MySQL 作为数据库

说明：

- 项目后端同时兼容 `MySQL` 和 `SQLite`
- 生产或正式开发环境建议使用 `MySQL`
- 本地临时调试可使用 `SQLite`

## 首次安装依赖

分别安装前后端依赖：

```bash
cd client
npm install
```

```bash
cd server
npm install
```

## 后端环境变量

后端环境变量文件位于 `server/.env`。

仓库里已经提供了样例文件：

- `server/.env.example`
- `server/.env.mysql.example`

### 方案一：使用 MySQL

推荐方式：

1. 复制 `server/.env.mysql.example` 的内容到 `server/.env`
2. 按你的本地数据库配置修改以下字段

```env
DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=rap_beats
```

如果你还需要支付或 OSS，请继续补充：

```env
XUNHU_APPID=你的应用ID
XUNHU_APPSECRET=你的应用密钥
CLIENT_URL=http://localhost:5173
BASE_URL=http://localhost:3000

STORAGE_DRIVER=local
```

如果你要使用阿里云 OSS：

```env
STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-bucket-name
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-access-key-secret
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_PUBLIC_BASE_URL=https://your-cdn-domain.com
OSS_AUDIO_PREFIX=audio
OSS_COVER_PREFIX=covers
OSS_AVATAR_PREFIX=avatars
OSS_BANNER_PREFIX=banners
```

### 方案二：使用 SQLite

如果你只是本地快速跑通项目，可以在 `server/.env` 中设置：

```env
DB_DRIVER=sqlite
STORAGE_DRIVER=local
CLIENT_URL=http://localhost:5173
BASE_URL=http://localhost:3000
```

SQLite 数据文件会自动写入：

```text
server/data/beats.db
```

## 启动项目

项目需要分别启动前端和后端。

### 1. 启动后端

```bash
cd server
npm run dev
```

启动成功后默认地址：

```text
http://localhost:3000
```

### 2. 启动前端

新开一个终端窗口：

```bash
cd client
npm run dev
```

启动成功后默认地址通常为：

```text
http://localhost:5173
```

注意：

- 如果 `5173` 已被占用，Vite 会自动切换到 `5174`、`5175` 或其他可用端口
- 终端里会打印最终可访问地址，以实际输出为准

## 构建命令

前端构建：

```bash
cd client
npm run build
```

后端构建：

```bash
cd server
npm run build
```

## 启动后的默认访问地址

- 前端首页：`http://localhost:5173`
- 后端 API：`http://localhost:3000`

如果前端端口被占用，请以 Vite 实际输出的地址为准。

## 生产部署

### 服务器推荐配置

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| CPU | 2 核 | 单机单实例足够 |
| 内存 | 4 GB | MySQL + Node + ffmpeg 同机运行 |
| 磁盘 | 60 GB SSD | 音频/图片走 OSS，本地只放代码和数据库 |
| 带宽 | 5 Mbps 或流量包 | 游客试听经服务器代理，需估算流量 |
| 系统 | Ubuntu 22.04 LTS | apt 装依赖最方便 |
| 区域 | 国内（需备案）或香港（免备案） | 想快速上线选香港 |

推荐服务商：阿里云轻量应用服务器 / 腾讯云 Lighthouse，新用户约 ¥99-200/年。

### 系统依赖

生产服务器需要安装：

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# MySQL 8
apt install -y mysql-server
systemctl enable mysql

# Nginx
apt install -y nginx

# ffmpeg（音频处理 + BPM 检测核心依赖）
apt install -y ffmpeg

# Python + librosa（可选，装不上 BPM 检测会降级）
apt install -y python3-pip
pip3 install librosa --break-system-packages

# pm2
npm install -g pm2
```

### 快速初始化

```bash
# 在服务器上以 root 运行一次性初始化
curl -sL https://raw.githubusercontent.com/YOUR_USERNAME/rap-beats/main/deploy/init-server.sh | bash
```

或手动按顺序执行 `deploy/init-server.sh` 中的步骤（安装依赖、配置 MySQL、建库、建账号、配置 Nginx、启动 pm2）。

### 部署步骤

1. **克隆代码或 git pull**

   ```bash
   cd /opt/rap-beats
   git pull origin main
   ```

2. **配置环境变量**

   复制 `server/.env.production` 为 `server/.env`，填写真实值：

   ```env
   DB_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=rapbeats          # 建议用专用账号而非 root
   DB_PASSWORD=你的强密码
   DB_NAME=rap_beats
   FORUM_DB_NAME=rap_beats_forum
   JWT_SECRET=上面生成的64位随机串
   XUNHU_APPID=虎皮椒应用ID
   XUNHU_APPSECRET=虎皮椒应用密钥
   BASE_URL=https://你的域名
   CLIENT_URL=https://你的域名
   STORAGE_DRIVER=oss
   # OSS 配置...
   ```

3. **构建前后端**

   ```bash
   cd /opt/rap-beats/server && npm ci && npm run build
   cd /opt/rap-beats/client && npm ci && npm run build
   ```

4. **配置 Nginx**

   ```bash
   cp /opt/rap-beats/deploy/nginx.conf /etc/nginx/sites-available/rap-beats
   # 编辑 /etc/nginx/sites-available/rap-beats，把 YOUR_DOMAIN 替换为真实域名
   ln -sf /etc/nginx/sites-available/rap-beats /etc/nginx/sites-enabled/rap-beats
   nginx -t && systemctl reload nginx
   ```

5. **启动服务**

   ```bash
   pm2 start /opt/rap-beats/deploy/ecosystem.config.js
   pm2 save
   pm2 startup   # 按提示配置开机自启
   ```

6. **配置 HTTPS**（域名解析好后）

   ```bash
   certbot --nginx -d your-domain.com -d www.your-domain.com
   ```

### 后续更新部署

代码更新后，在服务器上运行：

```bash
cd /opt/rap-beats
./deploy/deploy.sh
```

或推送到 GitHub main 分支，由 GitHub Actions 自动构建 Docker 镜像并部署（需配置 SERVER_SSH_PRIVATE_KEY 等 Secrets）。

### 数据库备份

双库每天凌晨 3:00 自动备份：

```bash
# 添加 cron 任务
crontab -e
# 添加这一行：
0 3 * * * /opt/rap-beats/deploy/scripts/backup.sh >> /var/log/rap-beats/backup.log 2>&1
```

备份脚本会自动将 `rap_beats` 和 `rap_beats_forum` 两个库的 mysqldump 压缩后上传 OSS，保留 7 天本地备份 / 30 天 OSS 备份。

### 健康检查

- **后端**：`curl http://127.0.0.1:3000/api/health`
- **前端**：`curl http://127.0.0.1/`（返回 index.html）

pm2 会自动重启崩溃的 Node.js 进程。

---

## 常见问题

### 1. 前端启动了但页面打不开

请先确认：

- 前端终端里是否显示 `VITE ready`
- 访问地址是否还是 `5173`
- 是否因为端口占用自动切换到了别的端口

### 2. 后端启动报数据库连接错误

请检查：

- `server/.env` 是否存在
- `DB_DRIVER` 是否配置正确
- 如果使用 MySQL，数据库是否已经启动
- `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME` 是否填写正确

### 3. 上传图片或音频失败

如果你使用本地存储：

- 确认 `STORAGE_DRIVER=local`

如果你使用 OSS：

- 确认 OSS 相关环境变量完整
- 确认 OSS Bucket 的 CORS 已放行 `PUT`、`OPTIONS`
- 确认浏览器来源已加入白名单

### 4. 前端请求不到后端接口

请确认：

- 后端已经成功监听 `3000`
- 前端请求地址配置和后端地址一致
- 本地没有被代理或系统防火墙拦截

## 推荐启动顺序

建议按下面顺序启动：

1. 先启动数据库
2. 再启动后端 `server`
3. 最后启动前端 `client`

这样更方便定位问题。

## 快速启动清单

如果你已经配好环境变量，最常用的启动步骤就是：

```bash
cd server
npm install
npm run dev
```

新开一个终端：

```bash
cd client
npm install
npm run dev
```

## 补充说明

- 后端启动时会自动初始化所需数据表
- 本地静态资源目录包括 `audio`、`covers`、`avatars`、`banners`
- 如果你在开发过程中修改了数据库驱动或存储驱动，建议重启后端服务
