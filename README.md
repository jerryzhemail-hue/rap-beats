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
