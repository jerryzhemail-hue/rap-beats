# Rap Beats Code Wiki

> 本文档是 `rap-beats` 项目的结构化代码维基，覆盖项目整体架构、主要模块职责、关键类与函数说明、依赖关系以及项目运行方式。
>
> 生成时间：2026-08-19。文档反映的是代码库当前磁盘状态，不包含版本历史。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈](#2-技术栈)
3. [整体架构](#3-整体架构)
4. [仓库目录结构](#4-仓库目录结构)
5. [后端 server（Express + TypeScript）](#5-后端-serverexpress--typescript)
   - 5.1 [入口与启动流程](#51-入口与启动流程)
   - 5.2 [数据库层 database/](#52-数据库层-database)
   - 5.3 [中间件 middleware/](#53-中间件-middleware)
   - 5.4 [路由层 routes/（完整接口清单）](#54-路由层-routes完整接口清单)
   - 5.5 [服务层 services/](#55-服务层-services)
   - 5.6 [工具层 utils/](#56-工具层-utils)
   - 5.7 [后端脚本 scripts/](#57-后端脚本-scripts)
6. [前端 client（Vue 3 + Vite + TypeScript）](#6-前端-clientvue-3--vite--typescript)
   - 6.1 [入口与启动流程](#61-入口与启动流程)
   - 6.2 [路由 router/](#62-路由-router)
   - 6.3 [状态管理 stores/（Pinia）](#63-状态管理-storespinia)
   - 6.4 [API 层 api/](#64-api-层-api)
   - 6.5 [组件 components/](#65-组件-components)
   - 6.6 [视图 views/](#66-视图-views)
   - 6.7 [类型与常量 types / constants](#67-类型与常量-types--constants)
   - 6.8 [工具层 utils/](#68-工具层-utils)
7. [BPM 微服务 bpm_service（Python + librosa）](#7-bpm-微服务-bpm_servicepython--librosa)
8. [数据库设计](#8-数据库设计)
9. [依赖关系](#9-依赖关系)
10. [项目运行方式](#10-项目运行方式)
11. [部署与 DevOps](#11-部署与-devops)

---

## 1. 项目概览

Rap Beats 是一个面向说唱音乐生态的 Web 平台，整合了 **Beat 展示/试听/下载、Rapper 频道、用户社区论坛、积分体系、VIP 会员、后台管理** 等核心能力。项目由三大子系统组成：

| 子系统 | 目录 | 技术栈 | 职责 |
|--------|------|--------|------|
| 前端 | `client/` | Vue 3 + Vite + TypeScript + Pinia | 用户界面、路由、状态管理、与后端 API 交互 |
| 后端 | `server/` | Express 5 + TypeScript + MySQL | 业务 API、鉴权、文件存储、BPM/媒体分析、支付回调 |
| BPM 微服务 | `bpm_service/` | Python + Flask + librosa | 高精度 BPM/调性检测 sidecar，可被后端降级调用 |

三者在生产环境通过 Docker Compose 编排，前端 Nginx 反代后端 API，后端依赖 MySQL（主库 + 论坛库）与可选的阿里云 OSS。

---

## 2. 技术栈

### 前端
- **框架**：Vue 3.5（Composition API + `<script setup>`）
- **构建工具**：Vite 8
- **语言**：TypeScript ~6.0
- **路由**：vue-router 4（History 模式）
- **状态管理**：Pinia 3
- **安全**：DOMPurify（富文本消毒）、twemoji（表情）
- **类型检查**：vue-tsc

### 后端
- **运行时**：Node.js 18+，ESM（`"type": "module"`）
- **框架**：Express 5.2
- **语言**：TypeScript 6（tsx 直接运行 `.ts`，`tsc` 构建到 `dist/`）
- **数据库**：MySQL 8/9（mysql2/promise 连接池），双库：主库 + 论坛库
- **鉴权**：jsonwebtoken（JWT）
- **加密**：bcryptjs（密码哈希）
- **文件上传**：multer 2
- **存储**：本地文件系统 / 阿里云 OSS（ali-oss）双驱动
- **媒体处理**：sharp（图片）、music-metadata（音频元数据）、tesseract.js（OCR）
- **限流**：自研滑动窗口限流中间件

### BPM 微服务
- **框架**：Flask
- **核心库**：librosa（音频分析）、scipy（信号处理）、numpy
- **暴露**：HTTP `/detect` 与 `/health`

### 基础设施
- **容器**：Docker + Docker Compose（dev / prod / test 三套）
- **CI/CD**：GitHub Actions（`.github/workflows/deploy.yml`）
- **Web 服务器**：Nginx（前端静态托管 + 反代）
- **进程管理**：pm2（手动部署可选）

---

## 3. 整体架构

```
                         ┌──────────────────────────────────┐
                         │            浏览器 / 移动端          │
                         └───────────────┬──────────────────┘
                                         │  HTTP / 静态资源
                         ┌───────────────▼──────────────────┐
                         │      Nginx (client 容器 :80)      │
                         │  托管前端 dist/，反代 /api 到后端     │
                         └──────┬─────────────────────┬─────┘
                  /api 代理     │                     │  静态资源
              ┌────────────────▼─────┐        ┌────────▼────────┐
              │  Express Server      │        │   前端 dist/     │
              │  (server 容器 :3000) │        │  (Vue 3 SPA)    │
              │                      │        └─────────────────┘
              │  - 鉴权(JWT)          │
              │  - 业务路由 /api/*    │
              │  - 限流中间件         │
              │  - 存储驱动(local/oss)│
              └───┬────────────┬─────┘
                  │            │  BPM 检测（可选，降级到 JS）
                  │            └────────────────▼──────────────┐
                  │                          │ BPM Sidecar :5050│
                  │                          │ (Python + librosa)│
                  │                          └───────────────────┘
                  │ 数据库访问（mysql2 连接池）
        ┌─────────▼──────────┐   ┌──────────────────▼─────────┐
        │  MySQL 主库         │   │  MySQL 论坛库              │
        │  rap_beats          │   │  rap_beats_forum           │
        │  (beats/users/...)  │   │  (forum_posts/comments/...)│
        └────────────────────┘   └────────────────────────────┘
                  │
                  │  媒体文件 (audio/covers/avatars/banners/forum-*)
                  ▼
        ┌──────────────────┐    本地：server/data/* 目录
        │  存储层 storage.ts │    远程：阿里云 OSS（生产）
        └──────────────────┘
```

**关键架构特征**：

1. **前后端分离**：前端为 SPA，通过 Vite 代理（开发）或 Nginx 反代（生产）访问后端 `/api`。
2. **双数据库**：业务主库与论坛库物理隔离，论坛库通过 `user_id` 软关联主库用户（无 FK）。
3. **存储双驱动**：`STORAGE_DRIVER` 控制本地或 OSS，运行时统一抽象。
4. **BPM 检测降级链**：优先调用 Python sidecar（精度高），不可用时回退到 Node.js 内置检测器。
5. **直接上传（Direct Upload）**：OSS 模式下前端可直接 `PUT` 到 OSS，绕过后端带宽。

---

## 4. 仓库目录结构

```
rap-beats/
├── client/                     # 前端 Vue 3 项目
│   ├── src/
│   │   ├── api/                # API 请求封装（按业务域分文件）
│   │   ├── components/         # 可复用组件
│   │   ├── constants/          # 静态常量（曲风、VIP 等级）
│   │   ├── router/             # 路由配置
│   │   ├── stores/             # Pinia 状态
│   │   ├── types/              # TypeScript 类型定义
│   │   ├── utils/              # 工具函数
│   │   ├── views/              # 页面视图（含 admin/、payment/ 子目录）
│   │   ├── App.vue             # 根组件
│   │   ├── main.ts             # 入口
│   │   └── style.css
│   ├── vite.config.ts          # Vite 配置（含代理）
│   └── package.json
├── server/                     # 后端 Express 项目
│   ├── src/
│   │   ├── database/           # 数据库客户端与建表初始化
│   │   ├── middleware/         # 鉴权、限流、VIP
│   │   ├── routes/             # 业务路由（按域分文件）
│   │   ├── services/           # 业务服务（存储、BPM、积分等）
│   │   ├── utils/              # 工具（资产序列化、时区、消毒）
│   │   ├── scripts/            # 一次性脚本（建管理员、迁移等）
│   │   └── index.ts            # 服务入口
│   ├── .env.example            # 环境变量样例
│   └── package.json
├── bpm_service/                # Python BPM 微服务
│   ├── server.py               # Flask 应用
│   └── requirements.txt
├── docker/                     # Docker 相关初始化 SQL
├── docs/                       # 项目文档（本文件在此目录）
├── scripts/                   # 运维脚本（备份、爬虫、数据导入）
├── Dockerfile.client / .server / .bpm
├── docker-compose.yml / .dev.yml / .prod.yml / .test.yml
├── deploy.sh / deploy-prod.sh / server-setup.sh / start-dev.sh
├── nginx.client.conf
├── README.md / DEVELOP.md / DEPLOY.md / DEPLOY-QUICKSTART.md
└── .github/workflows/deploy.yml
```

---

## 5. 后端 server（Express + TypeScript）

### 5.1 入口与启动流程

入口文件：[server/src/index.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/index.ts)

启动流程（`startServer()`）：

1. `initMySqlDatabaseClientFromEnv()` —— 从环境变量创建主库与论坛库的 MySQL 连接池。
2. `initDatabase(db, forumDb)` —— 自动建表（`CREATE TABLE IF NOT EXISTS`），包含主库 14 张表与论坛库 12 张表，并执行数据迁移与默认分类/话题种子。
3. `initStorage()` —— 初始化存储驱动（本地目录或 OSS 客户端）。
4. 注册静态资源目录：`/audio`、`/covers`、`/avatars`、`/banners`、`/forum-images`、`/forum-audio`、`/forum`。
5. 注册 `/api/health` 健康检查（探测主库 + 论坛库连接）。
6. 挂载所有业务路由到 `/api` 前缀下。
7. 注册 Multer 错误处理（→ 400）与全局 500 兜底中间件。
8. `app.listen(3000)`。

**全局中间件**：
- `cors`（来源由 `CLIENT_URL` 控制，`credentials: true`）
- `express.json()`、`express.urlencoded({ extended: true })`

**路由挂载点**：

| 路由模块 | 挂载前缀 |
|----------|----------|
| beatsRouter | `/api` |
| rappersRouter | `/api/rappers` |
| authRouter | `/api/auth` |
| uploadRouter | `/api` |
| favoritesRouter | `/api` |
| commentsRouter | `/api` |
| userRouter | `/api` |
| adminRouter | `/api` |
| paymentRouter | `/api` |
| bannersRouter | `/api` |
| previewRouter | `/api` |
| forumRouter | `/api` |
| feedbackRouter | `/api` |

> 完整路径 = 挂载前缀 + 路由文件内定义的 path。详见 [5.4 路由层](#54-路由层-routes完整接口清单)。

### 5.2 数据库层 database/

#### [client.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/database/client.ts)

MySQL 数据访问层核心，基于 `mysql2/promise` 连接池。

- `DatabaseClient` 类型：封装 `queryOne`、`queryMany`、`execute`、`withTransaction` 等方法。
- `getDatabaseClient()`：返回主库客户端单例。
- `getForumDatabaseClient()`：返回论坛库客户端单例。
- `initMySqlDatabaseClientFromEnv()`：从 `DB_*` / `FORUM_DB_*` 环境变量创建两个连接池；未配置论坛库时回退到主库。
- 事务支持：`withTransaction(fn)` 自动提交/回滚。

#### [index.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/database/index.ts)

- `initDatabase(db, forumDb)`：幂等建表，包含主库表（`rappers`、`users`、`beats`、`beat_producers`、`feedback`、`favorites`、`comments`、`downloads`、`beat_license_agreements`、`beat_license_templates`、`play_events`、`preview_history`、`orders`、`banners`）与论坛库表（`forum_categories`、`forum_topics`、`forum_posts`、`forum_comments`、`forum_comment_likes`、`forum_likes`、`forum_favorites`、`forum_sign_ins`、`forum_user_points`、`forum_point_transactions`、`forum_lottery_records`、`forum_point_download_permissions`）。
- 内置迁移逻辑：例如移除"综合"分类并迁移其帖子、按 slug 同步分类、迁移话题名称、播种默认分类与话题。
- 内置默认 Beat 使用协议模板（`beat_license_templates` 首次插入完整协议文本）。
- 导出 `Beat` 类型（主库 beats 行结构）。

### 5.3 中间件 middleware/

#### [auth.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/middleware/auth.ts)

JWT 鉴权中间件，导出 `AuthRequest` 接口（扩展 `req.user`）。

- `requireAuth`：必须登录；从 `Authorization: Bearer <token>` 或 `?token=` 提取 JWT，校验后回捞用户写入 `req.user`，失败返回 401。
- `requireAdmin`：必须管理员；在 `requireAuth` 基础上校验 `role === 'admin'`，否则 403。
- `optionalAuth`：可选登录；token 无效时静默放行（用于音频流不阻塞匿名访客）。
- `extractToken`：兼容 header 与 query 两种来源。
- `resolveCurrentUserFromToken`：先按 id 查，再按 email/username 回捞（兼容用户 ID 被重排的旧 token）。

#### [rateLimit.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/middleware/rateLimit.ts)

自研滑动窗口限流。

- `createRateLimiter`：基于 IP + 路径的滑动窗口计数器，可配置窗口与阈值。
- `rateLimitMiddleware(name, max)`：兼容旧路由的工厂函数，返回 Express 中间件。

#### [vip.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/middleware/vip.ts)

VIP 权限计算逻辑。

- 根据用户 `role`、`vip_level`、`vip_expire_at` 计算有效会员等级（过期则降级为 `free`）。
- 判断 `can_access_vip_content`、`can_access_high_quality`、`can_full_preview` 等权限位。
- 计算每日下载/试听配额与剩余次数。

### 5.4 路由层 routes/（完整接口清单）

> 鉴权标记：🔒 = `requireAuth`，👮 = `requireAdmin`，🌿 = `optionalAuth`，🌐 = 公开。

#### auth（鉴权）— 挂载于 `/api/auth`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 🌐（限流） | 注册，返回 `{ token, user }` |
| POST | `/api/auth/login` | 🌐（限流） | 登录，支持用户名/邮箱，返回 `{ token, user }` |
| GET | `/api/auth/me` | 🔒 | 获取当前登录用户信息 |

#### beats（Beat 核心）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/beats` | 🌿 | Beat 列表查询，支持 `page/limit/genre/bpm_min/bpm_max/key/search/is_free/sort/rapper` |
| GET | `/api/beats/:id` | 🌿 | Beat 详情 |
| GET | `/api/beats/:id/stream` | 🌿 | 音频流（支持 Range，按 VIP 权限返回完整/试听/低质量） |
| GET | `/api/beats/:id/license` | 🌿 | 查询使用协议模板与当前用户同意状态 |
| POST | `/api/beats/:id/license/agree` | 🔒 | 同意协议（记录到 `beat_license_agreements`） |
| GET | `/api/beats/:id/download` | 🔒 | 下载 Beat（校验协议同意 + VIP 配额，记录到 `downloads`） |
| GET | `/api/genres` | 🌐 | 获取所有曲风列表 |
| GET | `/api/home/public` | 🌐 | 首页公开数据（无需登录的精选 Beat + Banner） |
| POST | `/api/beats/:id/cover/upload-target` | 🔒 | 获取封面上传目标（OSS 直传或本地） |
| POST | `/api/beats/:id/cover` | 🔒 | 上传封面（multer） |
| DELETE | `/api/beats/:id` | 🔒 | 删除 Beat |
| PUT | `/api/beats/:id` | 🔒 | 更新 Beat 元数据 |
| PATCH | `/api/beats/:id/cover` | 🔒 | 修改封面 |
| POST | `/api/beats/:id/play-events` | 🌿（限流） | 记录播放事件 |

#### rappers（Rapper 频道）— 挂载于 `/api/rappers`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/rappers` | 🌐 | Rapper 列表（含统计） |
| GET | `/api/rappers/simple` | 🌐 | 精简 Rapper 列表 |
| POST | `/api/rappers/upload-avatar` | 👮 | 上传 Rapper 头像 |
| GET | `/api/rappers/export` | 🌐 | 导出 Rapper 数据 |
| POST | `/api/rappers/import` | 👮 | 导入 Rapper 数据 |
| POST | `/api/rappers/recalculate` | 👮 | 重算所有 Rapper 权重排序 |
| GET | `/api/rappers/stats` | 🌐 | Rapper 统计 |
| GET | `/api/rappers/:id` | 🌐 | Rapper 详情（含关联 Beat） |
| POST | `/api/rappers` | 👮 | 创建 Rapper |
| PUT | `/api/rappers/:id` | 👮 | 更新 Rapper |
| DELETE | `/api/rappers/:id` | 👮 | 删除 Rapper |

#### upload（上传，管理员）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/beats/upload-targets` | 👮 | 获取上传目标（音频+封面） |
| POST | `/api/beats/upload` | 👮 | 上传 Beat（multer 多文件，含 BPM/时长自动检测） |
| POST | `/api/beats/upload-direct` | 👮 | 直传上传（OSS） |
| POST | `/api/beats/detect-bpm` | 👮 | 单独检测 BPM |

#### favorites（收藏）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/favorites/:beatId` | 🔒（限流） | 收藏 Beat |
| DELETE | `/api/favorites/:beatId` | 🔒 | 取消收藏 |
| GET | `/api/favorites` | 🔒 | 我的收藏列表 |

#### comments（评论）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/beats/:beatId/comments` | 🌐 | 获取 Beat 评论 |
| POST | `/api/beats/:beatId/comments` | 🔒（限流） | 发表评论 |
| DELETE | `/api/comments/:id` | 🔒 | 删除评论 |

#### user（用户）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/user/avatar/upload-target` | 🔒 | 头像直传目标 |
| GET | `/api/user/uploads` | 🔒 | 我上传的 Beat |
| GET | `/api/user/downloads` | 🔒 | 我下载的记录 |
| PUT | `/api/user/profile` | 🔒 | 更新个人资料 |
| POST | `/api/user/avatar` | 🔒 | 上传头像（multer） |
| POST | `/api/user/avatar/direct` | 🔒 | 直传头像 |
| DELETE | `/api/user/avatar` | 🔒 | 删除头像 |
| PUT | `/api/user/password` | 🔒 | 修改密码 |
| GET | `/api/user/vip-status` | 🔒 | 获取 VIP 状态与配额 |

#### admin（管理后台）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/admin/stats` | 👮 | 后台总览统计 |
| GET | `/api/admin/hot-data` | 👮 | 热门数据（下载/播放/收藏趋势） |
| GET | `/api/admin/users` | 👮 | 用户列表（分页/搜索） |
| PUT | `/api/admin/users/:id/role` | 👮 | 修改用户角色 |
| PUT | `/api/admin/users/:id/vip` | 👮 | 修改用户 VIP |
| DELETE | `/api/admin/users/:id` | 👮 | 删除用户 |
| POST | `/api/admin/maintenance/clear-test-users` | 👮 | 清理测试用户 |
| POST | `/api/admin/maintenance/clear-demo-beats` | 👮 | 清理演示 Beat |
| POST | `/api/admin/beats/:id/detect-bpm` | 👮 | 对指定 Beat 检测 BPM |
| GET | `/api/admin/license-templates` | 👮 | 协议模板列表 |
| PUT | `/api/admin/license-templates/:id` | 👮 | 更新协议模板 |
| POST | `/api/admin/license-templates` | 👮 | 新建协议模板 |
| DELETE | `/api/admin/license-templates/:id` | 👮 | 删除协议模板 |
| GET | `/api/admin/license-agreements` | 👮 | 协议同意记录 |
| GET | `/api/admin/license-agreements/export` | 👮 | 导出协议同意记录 |

#### payment（支付）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/payment/create-order` | 🔒 | 创建 VIP 订单，返回虎皮椒支付跳转链接 |
| POST | `/api/payment/notify` | 🌐 | 虎皮椒异步回调（更新订单与 VIP 状态） |
| GET | `/api/payment/orders` | 🔒 | 我的订单列表 |

#### banners（Banner）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/banners` | 🌐 | 公开 Banner 列表 |
| GET | `/api/admin/banners` | 👮 | 后台 Banner 列表 |
| POST | `/api/admin/banners/upload-target` | 👮 | Banner 直传目标 |
| POST | `/api/admin/banners/upload-image` | 👮 | 上传 Banner 图（multer） |
| POST | `/api/admin/banners` | 👮 | 创建 Banner |
| POST | `/api/admin/banners/reorder` | 👮 | 排序 Banner |
| PUT | `/api/admin/banners/:id` | 👮 | 更新 Banner |
| DELETE | `/api/admin/banners/:id` | 👮 | 删除 Banner |

#### preview（试听）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/preview/check` | 🌿 | 检查试听资格与配额 |
| POST | `/api/preview/play` | 🌿（限流） | 记录试听事件 |
| GET | `/api/preview/status` | 🌿 | 获取试听状态 |

#### forum（论坛 + 积分）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/forum/categories` | 🌐 | 分类列表 |
| GET | `/api/forum/topics` | 🌐 | 话题列表 |
| POST | `/api/forum/suggest-topics` | 🔒 | 根据内容推荐话题 |
| GET | `/api/forum/posts` | 🌿 | 帖子列表（分页/筛选） |
| GET | `/api/forum/posts/:id` | 🌿 | 帖子详情（含音乐/视频/图片） |
| POST | `/api/forum/posts` | 🔒（限流） | 发帖 |
| PUT | `/api/forum/posts/:id` | 🔒（限流） | 编辑帖子 |
| DELETE | `/api/forum/posts/:id` | 🔒 | 删除帖子 |
| POST | `/api/forum/posts/:id/like` | 🔒（限流） | 点赞帖子 |
| POST | `/api/forum/posts/:id/favorite` | 🔒（限流） | 收藏帖子 |
| GET | `/api/forum/favorites` | 🔒 | 我的论坛收藏 |
| GET | `/api/forum/posts/:id/comments` | 🌿 | 帖子评论列表 |
| POST | `/api/forum/posts/:id/comments` | 🔒（限流） | 发表评论 |
| DELETE | `/api/forum/comments/:id` | 🔒 | 删除评论 |
| POST | `/api/forum/comments/:id/like` | 🔒（限流） | 评论点赞 |
| GET | `/api/forum/sign-in/status` | 🔒 | 签到状态 |
| POST | `/api/forum/sign-in` | 🔒（限流） | 每日签到（+积分） |
| GET | `/api/forum/points/transactions` | 🔒 | 积分流水 |
| GET | `/api/forum/points/config` | 🌿 | 积分规则配置 |
| GET | `/api/forum/lottery/status` | 🌿 | 抽奖状态 |
| POST | `/api/forum/lottery` | 🔒（限流） | 积分抽奖 |
| POST | `/api/forum/points/exchange` | 🔒（限流） | 积分兑换 |
| GET | `/api/forum/points/download-permission` | 🔒 | 下载权限兑换状态 |
| POST | `/api/forum/points/exchange-download` | 🔒（限流） | 兑换下载权限 |
| GET | `/api/forum/my-posts` | 🔒 | 我的帖子 |
| GET | `/api/forum/my-likes` | 🔒 | 我点赞的帖子 |
| GET | `/api/forum/my-comments` | 🔒 | 我的评论 |
| POST | `/api/forum/admin/posts/:id/pin` | 🔒 | 置顶帖子 |
| POST | `/api/forum/admin/posts/:id/essence` | 🔒 | 加精帖子 |
| POST | `/api/forum/upload-target` | 🔒（限流） | 论坛资源直传目标 |
| POST | `/api/forum/upload-image` | 🔒（限流） | 上传论坛图片 |
| POST | `/api/forum/upload-audio` | 🔒（限流） | 上传论坛音频 |
| GET | `/api/forum/audio-bpm/:audioId` | 🔒 | 查询论坛音频 BPM |
| POST | `/api/forum/upload-video` | 🔒（限流） | 上传论坛视频 |

#### feedback（反馈）— 挂载于 `/api`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/feedback` | 🌿 | 提交反馈 |
| GET | `/api/feedback` | 🔒 | 查询自己的反馈 |
| GET | `/api/admin/feedback` | 👮 | 后台反馈列表 |
| GET | `/api/admin/feedback/new` | 👮 | 未回复反馈 |
| PUT | `/api/admin/feedback/:id/reply` | 👮 | 回复反馈 |
| DELETE | `/api/admin/feedback/:id` | 👮 | 删除反馈 |

### 5.5 服务层 services/

#### [storage.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/storage.ts)

统一存储抽象层，支持 `local` / `oss` 双驱动。

- `StorageKind`：`audio | cover | avatar | banner | forum_image | forum_audio | forum_video | forum_video_cover`。
- `initStorage()`：根据 `STORAGE_DRIVER` 初始化本地目录或 OSS 客户端。
- `saveBuffer(kind, { buffer, ... })`：保存二进制并返回 `{ storedValue, publicUrl }`。
- `saveText(kind, content, ...)`：保存文本文件。
- `deleteStoredAsset(kind, storedValue)`：删除资产。
- `resolvePublicAssetUrl(kind, storedValue)`：把存储值解析为可访问 URL。
- `resolveLocalAssetPath(kind, storedValue)`：解析本地文件路径（用于流式传输）。
- `isLocalStorageEnabled()` / `isRemoteStorageEnabled()`：判断当前驱动。
- `getSignedAssetUrl(...)`：生成签名 URL（远程存储）。
- `supportsDirectUpload()`：是否支持直传。
- `createDirectUploadTarget(kind, options)`：生成直传目标（`uploadUrl` + headers + `storedValue` + `publicUrl`）。

#### [bpmDetector.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/bpmDetector.ts)

Node.js 端 BPM 检测（Python sidecar 不可用时的降级方案）。

- `detectBpmFromBuffer(buffer)`：从 Buffer 检测。
- `detectBpmFromFile(filePath)`：从本地文件检测。
- `detectBpmFromUrl(ossUrl)`：从远程 URL 检测。

#### [audioAnalyzer.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/audioAnalyzer.ts)

- `detectAudioFeature(filePath)`：基于 `music-metadata` 提取音频元数据（时长、比特率、格式等）。

#### [imageAnalyzer.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/imageAnalyzer.ts)

- `analyzeImage(filePath)`：图片分析（基于 sharp + tesseract.js，含尺寸/OCR）。
- `closeWorker()`：关闭 OCR worker。

#### [videoProcessor.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/videoProcessor.ts)

论坛视频处理（依赖 ffmpeg）。

- `probeVideoMeta(buffer)`：探测视频元数据（时长、宽高、编码）。
- `extractVideoCover(buffer, atSecond=1)`：提取指定时间点的封面帧。

#### [points.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/points.ts)

论坛积分体系核心。

- `changePoints({ userId, change, reason, description })`：变更积分（写流水 + 更新总分）。
- `getTotalPoints(userId)`：查询用户总积分。
- `getPointTransactions(...)`：分页查询积分流水。
- `getTodayPointsByReason(...)`：查询当日某原因已获积分（防刷）。
- `getAvailableReward(...)`：查询可领取奖励。
- 常量：`pointReasonLabels`（原因标签）、`POINT_LEVEL_CONFIG`（等级配置）、`POINT_REWARDS`（奖励配置）、`POINT_DAILY_LIMITS`（每日上限）。

#### [rapperScore.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/rapperScore.ts)

Rapper 权重与排序计算。

- `RAPPER_WEIGHTS`：权重配置常量。
- `updateRapperSortOrderByName(rapperName)`：根据关联 Beat 的热度重算单个 Rapper 排序。
- `recalculateAllRapperWeights()`：全量重算（返回更新数）。

#### [topicEngine.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/topicEngine.ts)

论坛话题推荐引擎。

- `DEFAULT_TOPICS`：默认话题列表。
- `suggestTopics(...)`：根据帖子内容/标题推荐话题。

#### [topicManager.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/services/topicManager.ts)

话题持久化管理。

- `CATEGORY_TOPIC_MAP`：分类→话题映射。
- `findOrCreateTopic(slug, categoryId)`：按 slug 查找或创建话题。

### 5.6 工具层 utils/

#### [assets.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/utils/assets.ts)

资产 URL 序列化（把存储值转成完整可访问 URL，便于序列化返回前端）。

- `serializeUserAssets(user)`：序列化用户头像 URL。
- `serializeBeatAssets(beat)`：序列化 Beat 的音频/封面 URL。
- `serializeBannerAssets(banner)`：序列化 Banner 图片 URL。

#### [sanitize.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/utils/sanitize.ts)

富文本消毒（XSS 防护）。

- `sanitizeHtml(html)`：清洗 HTML（白名单标签/属性）。
- `escapeHtmlContent(text)`：纯文本转义。

#### [timezone.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/utils/timezone.ts)

时区处理（项目时区固定 Asia/Shanghai，数据库存 UTC，业务按本地日计算配额）。

- `getLocalDateString()` / `getLocalDate()`：本地日期字符串/对象。
- `getLocalDateTimeStart()` / `getLocalDateTimeEnd()`：当日开始/结束。
- `toDateTimeString(date)` / `toDateString(date)`：格式化。

### 5.7 后端脚本 scripts/

| 脚本 | 用途 |
|------|------|
| [create-admin.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/create-admin.ts) | 创建管理员账号（`npm run create-admin`） |
| [detect_bpm.py](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/detect_bpm.py) | Python BPM 检测脚本 |
| [fill-missing-keys.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/fill-missing-keys.ts) | 补全缺失的调性字段 |
| [migrate-forum-data.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/migrate-forum-data.ts) | 论坛数据迁移 |
| [migrate-local-assets-to-oss.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/migrate-local-assets-to-oss.ts) | 本地资产迁移到 OSS（`npm run migrate-local-assets-to-oss`） |
| [sanitize-forum-data.ts](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/sanitize-forum-data.ts) | 论坛数据消毒（`npm run sanitize-forum`） |
| [generate-jwt-secret.js](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/generate-jwt-secret.js) | 生成 JWT 密钥 |
| [api-full-test.mjs](file:///Users/wangzhe/Documents/work/rap-beats/server/src/scripts/api-full-test.mjs) | API 全量测试脚本 |

---

## 6. 前端 client（Vue 3 + Vite + TypeScript）

### 6.1 入口与启动流程

入口文件：[client/src/main.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/main.ts)

1. `createApp(App)`。
2. 安装 `pinia`。
3. `await useAuthStore().init()` —— 从 localStorage 恢复 token 并调用 `/api/auth/me` 校验，避免路由守卫跳转闪烁。
4. `app.use(router)`。
5. `app.mount('#app')`。

根组件 [App.vue](file:///Users/wangzhe/Documents/work/rap-beats/client/src/App.vue)：组合 `AppHeader`、`router-view`、`AudioPlayer`、`FeedbackFloatButton`、`MembershipBanner`，并控制路由切换时的播放器行为。

Vite 配置 [vite.config.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/vite.config.ts)：
- 别名 `@` → `./src`。
- `base` 取 `VITE_BASE_URL`。
- 开发代理：`/api`、`/audio`、`/covers`、`/avatars`、`/banners`、`/forum-images`、`/forum-audio` → `http://localhost:3000`。
- 构建分包：`vue`/`pinia`/`vue-router` → `vendor` chunk。

### 6.2 路由 router/

[router/index.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/router/index.ts)，History 模式，含导航守卫。

| 路径 | 组件 | meta |
|------|------|------|
| `/` | HomeView | `public` |
| `/login` | LoginView | `guest` |
| `/register` | RegisterView | `guest` |
| `/beats` | BeatsView | `requiresAuth` |
| `/beats/:id` | BeatDetailView | `requiresAuth` |
| `/rapper/:id` | RapperDetailView | — |
| `/upload` | UploadView | `requiresAuth, requiresAdmin` |
| `/profile` | ProfileView | `requiresAuth` |
| `/vip` | VipView | `public` |
| `/payment/success` | payment/SuccessView | `public` |
| `/payment/cancel` | payment/CancelView | `public` |
| `/admin` | AdminLayout（嵌套子路由） | `requiresAuth, requiresAdmin` |
| `/admin` → 子路由 | DashboardView / HotDataView / UsersView / BeatsView / RappersView / BannersView / ForumManageView / FeedbackView / LicenseView | — |
| `/forum` | ForumView | `public` |
| `/forum/post/:id` | ForumPostView | `public` |
| `/forum/new` | ForumNewView | `requiresAuth` |
| `/points` | PointsCenterView | `requiresAuth` |

**导航守卫**：
- `requiresAuth` 未登录 → 跳 `/login?redirect=...&requireAuth=1`。
- `requiresAdmin` 非管理员 → 跳 `/`。
- `guest` 已登录 → 跳 `/`。
- `scrollBehavior`：始终滚到顶部。

### 6.3 状态管理 stores/（Pinia）

#### [auth.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/stores/auth.ts) — 认证 store

- **state**：`user: User | null`、`token: string | null`。
- **getters**：`isAuthenticated`、`isAdmin`、`vipLevel`、`isVip`、`isPremiumOrAbove`、`isUltimate`、`canFullPreview`。
- **actions**：`register(username, email, password)`、`login(login, password)`、`logout()`、`checkAuth()`、`init()`、`saveAuth()`、`clearAuth()`。
- token 持久化到 `localStorage` 的 `rap-beats-token` key。

#### [beats.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/stores/beats.ts) — Beat 列表 store

- **state**：`beats`、`total`、`page`、`loading`、`filters`。
- **actions**：加载列表、过滤、分页相关方法。

#### [player.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/stores/player.ts) — 播放器 store

- **state**：当前 Beat、播放状态、进度、音量、播放列表、VIP/试用限制、A-B 循环等。

### 6.4 API 层 api/

统一请求封装 [request.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/api/request.ts)：
- 封装 `fetch`，自动注入 `Authorization: Bearer <token>`。
- 处理 401 → 清除认证并跳登录页。
- `getAuthUrl(path, params)`：生成带 `?token=` 的 URL（用于流媒体/下载场景）。

按业务域拆分的 API 模块：

| 文件 | 职责 |
|------|------|
| admin.ts | 后台管理接口（统计、用户、Beat 等） |
| banners.ts | Banner 接口 |
| beats.ts | Beat 列表/详情/流媒体/下载/license 等核心接口 |
| comments.ts | Beat 评论接口 |
| directUpload.ts | OSS 直传相关 |
| favorites.ts | 收藏接口 |
| feedback.ts | 反馈接口 |
| forum.ts | 论坛分类/帖子/评论/积分/签到/抽奖接口 |
| payment.ts | 支付订单接口 |
| preview.ts | 试听资格检查接口 |
| rappers.ts | Rapper 频道接口 |
| upload.ts | Beat 上传接口（管理员） |
| user.ts | 用户资料/头像/密码/VIP 状态接口 |

### 6.5 组件 components/

| 组件 | 职责 |
|------|------|
| AdminLayout.vue | 后台布局壳（侧边栏 + 子路由出口） |
| AppHeader.vue | 全局顶部导航（含登录态/搜索入口） |
| AudioPlayer.vue | 全局音频播放器（试听/下载/VIP 限制/A-B 循环） |
| AuthPromptModal.vue | 需登录时的提示弹窗 |
| BeatCard.vue | Beat 卡片（封面/标题/操作） |
| BeatLicenseAgreement.vue | Beat 使用协议弹窗 |
| CommentSection.vue | Beat 评论区块 |
| EmojiPicker.vue | 表情选择器（twemoji） |
| FeedbackFloatButton.vue | 悬浮反馈按钮 |
| FilterBar.vue | Beat 筛选栏（曲风/BPM/调性等） |
| ForumAuthPrompt.vue | 论坛需登录提示 |
| ForumMusicPlayer.vue | 论坛音乐播放器 |
| MembershipBanner.vue | 会员推广横幅 |
| RapperChannel.vue | Rapper 频道展示 |
| RapperNav.vue | Rapper 导航 |
| RichTextEditor.vue | 富文本编辑器（论坛发帖，含消毒） |
| SearchBar.vue | 搜索栏 |

### 6.6 视图 views/

**常规视图**：
- `HomeView.vue`：首页（公开精选 + Banner 轮播）。
- `BeatsView.vue`：Beat 列表（筛选 + 分页）。
- `BeatDetailView.vue`：Beat 详情（试听/下载/评论/协议）。
- `RapperDetailView.vue`：Rapper 频道详情。
- `LoginView.vue` / `RegisterView.vue`：登录/注册。
- `UploadView.vue`：Beat 上传（管理员）。
- `ProfileView.vue`：个人中心。
- `VipView.vue`：VIP 会员购买页。
- `ForumView.vue` / `ForumPostView.vue` / `ForumNewView.vue`：论坛列表/详情/发帖。
- `PointsCenterView.vue`：积分中心（签到/抽奖/兑换）。

**支付视图**（`payment/`）：`SuccessView.vue`、`CancelView.vue`：支付成功/取消回调页。

**后台视图**（`admin/`）：
- `DashboardView.vue`：后台仪表盘。
- `HotDataView.vue`：热门数据。
- `UsersView.vue`：用户管理。
- `BeatsView.vue`：Beat 管理。
- `RappersView.vue`：Rapper 管理。
- `BannersView.vue`：Banner 管理。
- `ForumManageView.vue`：论坛管理。
- `FeedbackView.vue`：反馈管理。
- `LicenseView.vue`：协议模板管理。

### 6.7 类型与常量 types / constants

#### [types/index.ts](file:///Users/wangzhe/Documents/work/rap-beats/client/src/types/index.ts)

核心类型：`Beat`、`BeatsResponse`、`BeatsFilters`、`VipLevel`（`free|basic|premium|ultimate`）、`User`、`VipStatus`、`Order`、`AuthResponse`、`Banner`。

#### constants/

- `genres.ts`：曲风常量列表。
- `vip.ts`：VIP 等级与权益常量。

### 6.8 工具层 utils/

- `assets.ts`：资产 URL 处理（与后端对应的前端版）。
- `sanitize.ts`：富文本消毒（DOMPurify 封装）。

---

## 7. BPM 微服务 bpm_service（Python + librosa）

入口文件：[bpm_service/server.py](file:///Users/wangzhe/Documents/work/rap-beats/bpm_service/server.py)

Flask 应用，默认端口 `5050`（可由 `PORT` 环境变量覆盖）。

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查，返回 `{"status": "ok"}` |
| POST | `/detect` | 接收 multipart `audio` 文件或 raw body，返回 BPM 检测结果 |

### 核心算法 `detect_bpm_v5(audio_bytes, filename)`

针对说唱 Beat 优化的高精度检测算法：

1. **多频段 onset 表征**：default / lowfreq（低通 150Hz，突出 kick）/ midfreq（带通 150–4000Hz）/ blend_kick（低频+默认混合）。
2. **多 seed beat_track**：用 11 个说唱常见 BPM seed（65–160）调用 `librosa.beat.beat_track`，避免单点收敛错误。
3. **候选八度扩展**：对每个原始 BPM 生成 0.5/1.5/2.0 倍数候选。
4. **三维评分**：对齐分 `align_s`（理论拍点对齐误差）、稳定性 `cv_s`（拍间间隔变异系数）、onset 峰值分 `onset_s`；加权 `composite = 0.55*align + 0.30*cv + 0.15*onset`。
5. **八度回退**：八度倍数候选间，偏好落在说唱合理区间 `[80, 180]` 的高 BPM。
6. **clamp**：`clamp_bpm` 将 BPM 规整到 `[50, 180]`。
7. **调性检测**：基于 `chroma_cqt` 推断根音 + 大小调。

### 返回结构

```json
{
  "bpm": 90,
  "confidence": 0.82,
  "duration_s": 60.0,
  "beat_count": 90,
  "key": "C Major",
  "key_confidence": 0.82,
  "cv": 0.12,
  "align_score": 0.85,
  "onset_score": 0.70,
  "onset_type": "blend_kick",
  "elapsed_ms": 1200,
  "error": null
}
```

### 降级机制

后端 `bpmDetector.ts` 优先调用 `BPM_SIDECAR_URL`（如 `http://rap-beats-bpm:5050`）；sidecar 不可用时回退到 Node.js 内置检测，保证上传链路不中断。

依赖：`librosa`、`numpy`、`scipy`、`flask`（见 `requirements.txt`）。

---

## 8. 数据库设计

项目使用 MySQL 8，**双库设计**：主库 `rap_beats` 与论坛库 `rap_beats_forum`。开发库带 `_dev` 后缀。详见 [docs/DATABASE-MAP.md](file:///Users/wangzhe/Documents/work/rap-beats/docs/DATABASE-MAP.md)。

### 8.1 主库表（rap_beats）

| 表 | 说明 | 关键字段 |
|----|------|----------|
| `rappers` | Rapper 信息 | name(唯一)、avatar_url、bio、sort_order |
| `users` | 用户 | username/email(唯一)、password_hash、role、vip_level、vip_expire_at、avatar_url |
| `beats` | Beat 主表 | title、producer、rapper、bpm、key、genre、tags、duration、file_path、cover_image、is_free、is_vip_only、uploaded_by(FK→users) |
| `beat_producers` | Beat-Rapper 多对多 | beat_id(FK)、rapper_id(FK)、rapper_name |
| `favorites` | 收藏 | user_id(FK)、beat_id(FK)，唯一(user,beat) |
| `comments` | Beat 评论 | user_id(FK)、beat_id(FK)、content |
| `downloads` | 下载记录 | user_id(FK)、beat_id(FK) |
| `play_events` | 播放事件 | user_id(FK)、beat_id(FK) |
| `preview_history` | 试听记录 | user_id、beat_id、preview_date、device_id、ip_address |
| `orders` | 订单 | user_id(FK)、vip_level、amount、stripe_session_id、status |
| `banners` | Banner | name、image_url、link_url、sort_order、is_active、overlay_opacity、display_duration |
| `feedback` | 反馈 | user_id(FK)、type、title、content、contact、status、reply |
| `beat_license_agreements` | 协议同意记录 | user_id、beat_id，唯一(user,beat) |
| `beat_license_templates` | 协议模板 | version、content、is_active |

### 8.2 论坛库表（rap_beats_forum）

| 表 | 说明 |
|----|------|
| `forum_categories` | 论坛分类（创作、说唱巅峰对决2026、涂鸦、说唱HIT-SONG、说唱、免费Beat分享、新人报道） |
| `forum_topics` | 话题（slug+category 唯一） |
| `forum_posts` | 帖子（含音乐/视频/图片/话题多模态字段） |
| `forum_comments` | 帖子评论（支持 parent_id 楼中楼） |
| `forum_comment_likes` | 评论点赞 |
| `forum_likes` | 帖子点赞 |
| `forum_favorites` | 帖子收藏 |
| `forum_sign_ins` | 每日签到 |
| `forum_user_points` | 用户积分总表 |
| `forum_point_transactions` | 积分流水 |
| `forum_lottery_records` | 抽奖记录 |
| `forum_point_download_permissions` | 积分兑换的下载权限 |

> 论坛库通过 `user_id` 软关联主库用户（**不建外键**），仅由业务层保证一致性。

### 初始化策略

后端启动时 `initDatabase()` 幂等执行 `CREATE TABLE IF NOT EXISTS`，并包含：
- 历史 schema 兼容迁移（`ALTER TABLE ... ADD COLUMN` 用 try/catch 忽略已存在）。
- 默认协议模板播种。
- 默认分类与话题播种（按 slug 同步）。
- 移除"综合"分类并迁移其帖子。

---

## 9. 依赖关系

### 9.1 模块依赖（后端）

```
routes/*  ──依赖──►  services/*    （存储、BPM、积分、Rapper 权重）
          ──依赖──►  database/*    （数据访问）
          ──依赖──►  middleware/*  （鉴权、限流、VIP）
          ──依赖──►  utils/*       （资产序列化、消毒、时区）
services/bpmDetector ──HTTP──► bpm_service (Python sidecar，可降级)
services/storage      ──驱动──► local FS / ali-oss
database/client       ──驱动──► mysql2 (主库 + 论坛库连接池)
```

### 9.2 前端依赖

```
views/*     ──依赖──►  components/* + stores/* + api/*
components  ──依赖──►  stores/*（响应式状态）+ api/*（数据）
api/*       ──依赖──►  api/request.ts（统一封装）+ types/*
stores/auth ──依赖──►  router（登出跳转）+ api/request
router      ──依赖──►  stores/auth（导航守卫）
```

### 9.3 跨系统依赖

| 来源 | 目标 | 通道 | 说明 |
|------|------|------|------|
| 前端 | 后端 | HTTP `/api`（代理/反代） | 所有业务请求 |
| 前端 | OSS | HTTP PUT（直传） | `directUpload` 模式绕过后端 |
| 后端 | MySQL | mysql2 连接池 | 主库 + 论坛库 |
| 后端 | BPM sidecar | HTTP `/detect` | 可选，降级到 JS |
| 后端 | OSS | ali-oss SDK | 远程存储模式 |
| 后端 | ffmpeg | 子进程 | 视频/音频处理 |
| 后端 | 虎皮椒 | HTTP | 支付下单与回调 |

### 9.4 后端运行时依赖

| 依赖 | 用途 |
|------|------|
| express | Web 框架 |
| mysql2 | MySQL 驱动 |
| jsonwebtoken | JWT 签发/校验 |
| bcryptjs | 密码哈希 |
| multer | 文件上传 |
| ali-oss | 阿里云 OSS SDK |
| sharp | 图片处理 |
| music-metadata | 音频元数据 |
| tesseract.js | OCR |
| cors | 跨域 |

### 9.5 前端运行时依赖

| 依赖 | 用途 |
|------|------|
| vue | 框架 |
| vue-router | 路由 |
| pinia | 状态管理 |
| dompurify | 富文本消毒 |
| twemoji | 表情渲染 |

---

## 10. 项目运行方式

### 10.1 环境要求

- Node.js 18+，npm 9+
- MySQL 8/9（项目仅支持 MySQL，不再兼容 SQLite）
- （可选）Python 3 + librosa（BPM 精度检测，装不上会降级）
- （可选）ffmpeg（视频/音频处理）

### 10.2 本地开发

**推荐顺序**：数据库 → 后端 → 前端。

1. **启动 MySQL**（Docker）：
   ```bash
   docker compose -f docker-compose.dev.yml up -d mysql
   ```
   本地开发库：`rap_beats_dev` / `rap_beats_forum_dev`，端口 `3307`，用户 `dev_user` / 密码 `dev_pass_2024`。

2. **配置后端环境变量**：复制 `server/.env.example` → `server/.env`，按本地配置填写 `DB_*`、`STORAGE_DRIVER=local`、`JWT_SECRET`、`CLIENT_URL=http://localhost:5173` 等。

3. **启动后端**：
   ```bash
   cd server
   npm install
   npm run dev          # tsx --watch，监听 :3000
   ```

4. **启动前端**：
   ```bash
   cd client
   npm install
   npm run dev          # Vite，监听 :5173
   ```

**一键脚本**：
```bash
./deploy.sh local         # 启动所有本地服务
./deploy.sh local-stop    # 停止
./deploy.sh local-clean   # 清理本地数据库
```

### 10.3 关键 npm 脚本

**后端**（`server/package.json`）：
- `npm run dev`：开发模式（tsx watch）
- `npm run build`：`tsc` 编译到 `dist/`
- `npm start`：运行 `dist/index.js`
- `npm run create-admin`：创建管理员
- `npm run migrate-local-assets-to-oss`：本地资产迁移 OSS
- `npm run sanitize-forum`：论坛数据消毒

**前端**（`client/package.json`）：
- `npm run dev`：Vite 开发服务器
- `npm run build`：生产构建到 `dist/`
- `npm run preview`：预览构建产物

### 10.4 默认访问地址

- 前端首页：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- 健康检查：`GET http://localhost:3000/api/health`（探测主库 + 论坛库）

### 10.5 环境变量清单（后端）

核心变量（见 [server/.env.example](file:///Users/wangzhe/Documents/work/rap-beats/server/.env.example)）：

| 变量 | 说明 |
|------|------|
| `DB_DRIVER` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 主库连接 |
| `FORUM_DB_NAME`（及可选 `FORUM_DB_*`） | 论坛库（不配置则与主库共用） |
| `DB_POOL_SIZE` | 连接池大小（默认 10） |
| `JWT_SECRET` | JWT 密钥（生产必改） |
| `BASE_URL` / `CLIENT_URL` | 后端/前端域名（影响 CORS 与支付回调） |
| `STORAGE_DRIVER` | `local` 或 `oss` |
| `OSS_*` | 阿里云 OSS 配置（region/bucket/ak/endpoint/cdn/prefix） |
| `XUNHU_APPID` / `XUNHU_APPSECRET` / `XUNHU_GATEWAY` | 虎皮椒支付 |
| `BPM_SIDECAR_URL` | BPM 微服务地址（docker-compose 内置 `http://rap-beats-bpm:5050`） |

---

## 11. 部署与 DevOps

### 11.1 Docker 编排

[docker-compose.yml](file:///Users/wangzhe/Documents/work/rap-beats/docker-compose.yml) 定义 4 个服务：

| 服务 | 镜像/构建 | 端口 | 依赖 |
|------|-----------|------|------|
| `mysql` | mysql:8.0 | 3306 | — |
| `bpm` | Dockerfile.bpm（Python + librosa） | 5050（内部） | — |
| `server` | Dockerfile.server | 3000 | mysql(healthy)、bpm(healthy) |
| `client` | Dockerfile.client（Nginx + dist） | 80 | server |

网络 `rap-beats-net`（bridge），持久化卷 `mysql_data`。所有容器 `restart: unless-stopped`，server/bpm/mysql 均配置 healthcheck。

另有：
- `docker-compose.dev.yml`：仅本地 MySQL（端口 3307）。
- `docker-compose.prod.yml` / `docker-compose.test.yml`：生产/测试编排。

### 11.2 CI/CD

[.github/workflows/deploy.yml](file:///Users/wangzhe/Documents/work/rap-beats/.github/workflows/deploy.yml)：

推送 `main` 分支自动：
1. 构建 server/client Docker 镜像并推送到 ghcr.io。
2. SSH 登录服务器，先 `mysqldump` 备份双库。
3. 同步 compose 配置文件。
4. `docker compose up -d` 拉取新镜像重启（MySQL 数据卷保留）。
5. 健康检查。

**需配置的 GitHub Secrets/Variables**：`SERVER_SSH_PRIVATE_KEY`、`SERVER_HOST`、`SERVER_USER`、`SERVER_DEPLOY_DIR`、`DB_NAME`、`FORUM_DB_NAME`。

### 11.3 手动部署

```bash
./deploy.sh local     # 本地开发
./deploy.sh deploy    # 部署到服务器（构建镜像 + 同步 + 重启）
```

服务器首次设置：`./server-setup.sh`（装 Docker + 镜像加速）、`./deploy-prod.sh`（创建 `/opt/rap-beats` 目录结构）。

### 11.4 数据库备份

[scripts/backup.sh](file:///Users/wangzhe/Documents/work/rap-beats/scripts/backup.sh) 双库备份到 `/opt/rap-beats/backups`，可上传 OSS。Cron 示例：
```
0 3 * * * /opt/rap-beats/scripts/backup.sh >> /var/log/rap-beats/backup.log 2>&1
```

### 11.5 健康检查

- 后端：`curl http://127.0.0.1:3000/api/health`（同时探测主库与论坛库）。
- 前端：`curl http://127.0.0.1/`（返回 index.html）。

容器崩溃时 Docker `restart: unless-stopped` 自动重启。

---

> **补充说明**：后端启动时自动初始化所需数据表；本地静态资源目录包括 `audio`、`covers`、`avatars`、`banners`；修改数据库驱动或存储驱动后建议重启后端服务。
