# Rap Beats 网站功能归纳与测试指南

> 适用范围：本地开发环境（`http://localhost:3000` 后端 + `http://localhost:5173` 前端）。
> OSS 隔离：本地使用同一 OSS 桶的 `dev/` 前缀（audio/covers/avatars/banners/forum-*），与线上根目录完全隔离；支付走模拟支付（`MOCK_PAYMENT_ENABLED=true`）。

## 一、功能模块归纳

| 模块 | 功能点 | 说明 |
| --- | --- | --- |
| 认证 | 注册 / 登录（用户名或邮箱）/ 获取当前用户 | JWT，注册后自动登录；密码 bcrypt 存储 |
| 首页 | Banner 轮播 / 最新伴奏 / 本周热榜 / 免费专区 / 风格分类 | `/api/home/public`、`/api/banners` 公开接口 |
| 伴奏库 | 列表、分页、曲风过滤、BPM 区间、调性、搜索、免费筛选、热度/最新排序、Rapper 频道 | `/api/beats` 支持多种过滤组合 |
| Beat 详情 | 详情、试听 stream（游客 40s 预览 / 会员完整播放）、VIP 专属内容控制、播放事件上报 | OSS 模式下游客走 960KB 截断代理 |
| 下载 | 许可协议（模板+同意记录）、下载权限校验（VIP 每日限额 / 积分兑换单次权限）、下载记录、OSS 302 签名直链 | 免费用户经积分兑换每天最多 5 次；basic 10、premium 30、ultimate 不限 |
| 收藏 | 收藏 / 取消收藏 / 我的收藏 | 幂等，列表批量返回收藏态 |
| 评论 | Beat 评论列表 / 发表 / 删除（作者或管理员） | 空内容 400，他人删除 403 |
| 用户中心 | 资料修改、头像上传/直传/删除、我的上传/下载、修改密码 | 头像上传本地校验格式与大小 |
| VIP/支付 | 会员方案（basic 19.9 / premium 49.9 / ultimate 99.9）、创建订单、模拟支付即时开通、订单列表、VIP 状态与到期时间 | 未配置虎皮椒且开启 mock 时走模拟支付 |
| 积分中心 | 等级体系、每日签到（连续/里程碑奖励）、积分流水、积分抽奖、积分兑换 VIP、积分兑换单次下载权限 | 见 `POINT_LEVEL_CONFIG`、`LOTTERY_PRIZES`、`POINTS_EXCHANGE_CONFIG` |
| 论坛 | 版块/话题、发帖/改帖/删帖、点赞、收藏、评论、评论点赞、置顶/加精、我的帖子/点赞/评论、图片/音频/视频上传、BPM 后台分析 | 发帖有积分奖励；XSS 过滤 |
| Rapper | 列表、详情、统计、CSV 导出、批量导入、创建/编辑/删除、头像上传、权重计算 | 支持合作作品（beat_producers 多对多） |
| Banner | 公开列表、后台 CRUD、上传（直传/转存）、排序、启停 | 首页轮播展示 |
| 反馈 | 游客/登录用户提交、我的反馈、后台列表、未回复数、回复、删除 | 匿名提交默认归到游客 |
| 管理后台 | 统计概览、热门数据看板、用户管理（角色/VIP/删除）、伴奏管理、Rapper 管理、Banner 管理、论坛管理、反馈管理、协议模板管理、协议记录导出 | 全部 requireAdmin |
| 伴奏上传 | 直传目标（OSS 签名 PUT）、multipart 上传（音频+封面）、直传地址落库、BPM/调性/时长自动识别、默认封面生成 | 管理员专属；上传文件写入 `dev/` 前缀 |
| OSS 存储 | local / OSS 双驱动、目录前缀隔离（`OSS_*_PREFIX`）、签名 URL、删除同步清理远端对象 | 本地 `.env` 已配置 dev/ 前缀 |

## 二、测试数据与隔离

1. 线上 OSS 的真实音频/封面已服务端复制到 `dev/audio`、`dev/covers`、`dev/avatars`、`dev/banners`（125 个对象），本地所有读写都在 `dev/` 前缀内。
2. 造数据脚本 `server/scripts/seed-test-data.mjs`：
   - 创建测试账号（密码见脚本注释）：`testadmin`（管理员）、`tester_free / basic / premium / ultimate / points / pay`；
   - 为恢复的 39 首 beat 补齐曲风/BPM/调性/时长/免费/VIP 标记并关联 Rapper；
   - 初始化积分、签到、收藏、下载、播放数据；创建 3 条带 OSS 图片/音频的论坛帖子和 1 个公开 Banner。
3. 全量接口测试 `server/scripts/api-full-test.mjs`：覆盖 A~R 共 18 个分组约 100 条断言，测试产生的上传全部落入 `dev/` 前缀，结束时自动清理测试数据。

## 三、测试用例（手工/验收维度）

优先级：P0=核心链路必须通过，P1=重要功能，P2=次要/边界。

### 1. 认证（AUTH）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| A-01 | P0 | 注册成功 | 注册合法用户名/邮箱/密码 | 201，返回 token 与用户信息 |
| A-02 | P0 | 重复注册 | 使用已注册的用户名/邮箱再注册 | 409 |
| A-03 | P1 | 参数校验 | 非法邮箱 / 密码<6位 / 用户名为空 | 400 |
| A-04 | P0 | 登录 | 用户名或邮箱 + 正确密码 | 200，返回 token |
| A-05 | P0 | 错误密码 | 错误密码登录 | 401 |
| A-06 | P1 | 获取当前用户 | 携带 token GET /auth/me | 200，返回当前用户 |
| A-07 | P0 | 未授权 | 无 token 访问受保护接口 | 401 |

### 2. Beat 浏览（BEATS）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| B-01 | P0 | 列表 | GET /api/beats | 200，含分页与 total；文件路径为 `dev/audio` |
| B-02 | P1 | 曲风过滤 | `?genre=Trap` | 仅返回匹配曲风 |
| B-03 | P1 | BPM/调性过滤 | `?bpm_min=&bpm_max=&key=` | 过滤生效 |
| B-04 | P1 | 搜索 | `?search=` 匹配标题/制作人/rapper/标签 | 返回相关结果 |
| B-05 | P1 | 免费筛选 | `?is_free=1` | 全部 is_free=1 |
| B-06 | P1 | 排序 | `sort=popular` / `sort=latest` | 按热度/时间排序 |
| B-07 | P0 | 详情 | GET /api/beats/:id | 200，字段完整 |
| B-08 | P1 | 不存在 | GET /api/beats/999999 | 404 |
| B-09 | P1 | 首页聚合 | GET /api/home/public | latest/popular/free 三组数据 |

### 3. 试听 / 流媒体（STREAM）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| S-01 | P0 | 游客无会话 | 不带 Cookie 访问 stream | 403 NO_SESSION |
| S-02 | P0 | 游客带会话 | 先 GET /preview/check 拿 Cookie 再 stream | 206/200 + `X-Preview: true`，内容 ≤960KB |
| S-03 | P1 | 游客次数限制 | 同一 session 试听 3 次后再次试听 | 403 GUEST_LIMIT_REACHED |
| S-04 | P0 | 免费用户 stream | 登录免费用户 stream | 预览代理（X-Preview） |
| S-05 | P0 | 会员 stream | basic+ 用户 stream | 302 签名直链 / 完整文件 |
| S-06 | P1 | VIP 专属 | 免费用户访问 is_vip_only beat | 403 VIP_ONLY |

### 4. 下载 / 授权（DOWNLOAD）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| D-01 | P0 | 未同意协议 | 未 agree 直接下载 | 403 LICENSE_AGREEMENT_REQUIRED |
| D-02 | P0 | 同意协议 | POST license/agree | 200，幂等 |
| D-03 | P0 | 免费用户无权限 | agree 后下载 | 403 DOWNLOAD_REQUIRES_VIP |
| D-04 | P0 | 会员下载 | premium 下载 | 302 → dev/audio 签名直链，下载数+1，写下载记录 |
| D-05 | P1 | 每日限额 | 免费用户经积分兑换下载满 5 次后第 6 次；basic 满 10 次后第 11 次 | 403 DOWNLOAD_LIMIT_REACHED |
| D-06 | P1 | 积分兑换下载 | 10 积分兑换权限后下载 | 成功，权限-1 |

### 5. 收藏 / 评论（SOCIAL）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| F-01 | P0 | 收藏/取消 | POST/DELETE /api/favorites/:beatId | 200/201 幂等，列表联动 |
| F-02 | P0 | 发表评论 | POST 非空内容 | 201，返回评论 |
| F-03 | P1 | 空评论 | 全空格内容 | 400 |
| F-04 | P1 | 删除权限 | 他人删我的评论 | 403；管理员可删 |

### 6. 用户中心（USER）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| U-01 | P0 | VIP 状态 | GET /user/vip-status | 返回 level/到期时间 |
| U-02 | P1 | 修改资料 | 修改用户名/邮箱 | 200；占用他人邮箱 400 |
| U-03 | P1 | 修改密码 | 旧密码错误→400；正确→200 后可新密码登录 | 符合预期 |
| U-04 | P1 | 头像 | 上传 / 直传 / 删除 | URL 落在 dev/avatars，删除恢复默认 |
| U-05 | P1 | 我的上传/下载 | GET /user/uploads、/user/downloads | 返回对应记录 |

### 7. 支付 / VIP（PAY）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| P-01 | P0 | 无效等级/支付方式 | 传非法 vip_level / pay_type | 400 |
| P-02 | P0 | 模拟支付开通 | basic/premium/ultimate + wechat/alipay | 200 mode=mock，立即开通对应 VIP 且时长叠加 |
| P-03 | P1 | 订单列表 | GET /payment/orders | 返回 completed 订单 |
| P-04 | P1 | 回调 | POST /payment/notify 空数据 | 不 5xx |

### 8. 积分 / 论坛（POINTS / FORUM）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| PT-01 | P0 | 签到 | 首次签到 / 重复签到 | 成功加分；重复 400 已签到 |
| PT-02 | P1 | 积分流水/规则 | GET points/transactions、points/config | 返回记录与规则 |
| PT-03 | P0 | 抽奖 | 积分充足抽奖 | 200，返回奖品与扣分/加分 |
| PT-04 | P1 | 积分不足抽奖 | 少于 5 分 | 400 |
| PT-05 | P0 | 兑换 VIP | 500/1200/3000 分兑换 basic/premium/ultimate | 扣分并开通 |
| PT-06 | P0 | 兑换下载权限 | 10 分兑换 | 剩余权限≥1 |
| FT-01 | P0 | 版块/话题 | GET /forum/categories、/forum/topics | 返回数据 |
| FT-02 | P0 | 发帖 | 带封面/音频/视频/图片发帖 | 200，返回 post_id 与积分奖励 |
| FT-03 | P1 | 发帖校验 | 缺标题/内容/分类 | 400 |
| FT-04 | P0 | 点赞/收藏/评论 | 帖子与评论点赞、收藏、评论 | 状态正确返回 |
| FT-05 | P1 | 我的帖子/点赞/评论 | GET /forum/my-* | 返回本人数据 |
| FT-06 | P1 | 置顶/加精 | 管理员操作 | 200 |
| FT-07 | P1 | 删除权限 | 非作者删除 → 403；作者/管理员可删 | 符合预期 |
| FT-08 | P1 | 上传 | 图片/音频/视频上传 | 200，URL 落在 dev/forum-*，BPM 分析 ready |

### 9. 后台 / 上传 / 其他（ADMIN / UPLOAD / MISC）

| 编号 | 优先级 | 用例 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| AD-01 | P0 | 权限隔离 | 普通用户访问 /admin/* | 403 |
| AD-02 | P0 | 统计/热门/用户 | GET /admin/stats、hot-data、users | 200 且数据合理 |
| AD-03 | P1 | 用户管理 | 改角色/VIP/删除自动测试号 | 200 |
| AD-04 | P1 | 协议模板 CRUD | 创建→删除 | 200 |
| AD-05 | P1 | 协议记录导出 | GET license-agreements/export | 200 |
| UP-01 | P0 | 直传目标 | /beats/upload-targets、avatar、banner、forum | direct_upload=true，URL 含 dev/ 对应前缀 |
| UP-02 | P0 | 上传 beat | multipart 音频+封面 | 201，文件落 dev/audio+covers，BPM 识别 |
| UP-03 | P1 | 直传落库 | upload-direct 带 dev/ URL | 201，file_path 为 dev/ |
| RN-01 | P1 | Rapper | 列表/详情/导入/导出/创建/编辑/头像 | 200 |
| BN-01 | P1 | Banner | 上传图→创建→公开列表可见→更新→排序→删除 | 全程 200 |
| FB-01 | P1 | 反馈 | 提交→我的列表→后台回复/删除 | 200 |

## 四、运行自动化测试

```bash
# 1. 启动后端（非沙箱，需能连 3307 MySQL 和 OSS）
cd server && node --import tsx/esm src/index.ts

# 2. 造数据（重置测试账号/补齐 beat 元数据/论坛/Banner）
cd server && node --import tsx/esm scripts/seed-test-data.mjs

# 3. 全量接口测试（A~R 分组，含 OSS 隔离断言）
cd server && node --import tsx/esm scripts/api-full-test.mjs
```

测试账号：普通用户统一 `Test@123456`，管理员 `testadmin / Admin@123456`。

> 本地 `.env` 已设置 `RATE_LIMIT_DISABLED=true`（仅本地开发），否则连续快速跑测试会触发
> 登录/注册/兑换/抽奖的 429 限流；生产环境不要设置该变量。

## 五、OSS 隔离检查点（安全）

- 本地 `.env` 必须存在 `OSS_*_PREFIX=dev/*` 8 个变量；线上环境不要设置。
- 上传类接口返回的 `uploadUrl` / `image_url` / `audio_url` 必须含 `/dev/`。
- 数据库 beats 的 `file_path` / `cover_image` 必须为 `dev/` 前缀 URL。
- 删除测试数据时，OSS 删除操作只会命中 `dev/` 对象；线上根目录对象零改动。
- 建议每次回归前后用 OSS 控制台对比 `audio/`、`covers/` 等根目录对象数量不变。

## 六、最近一次全量测试结果（2026-08-05）

`api-full-test.mjs` 实际执行：**172 / 172 通过，0 失败**（A~T 20 组，含 OSS 隔离断言；限流禁用后可连续重复运行）。

补充用例覆盖的缺口：`/api/health`、头像/Banner 直传目标、协议模板 PUT 更新、`PATCH /beats/:id/cover`、
VIP 专属 Beat 详情 403、游客每日试听 3 次上限、发帖 XSS 过滤、真实 OSS 签名 PUT + 公开 URL 回读、
音频/封面非法类型 400。

测试中发现并修复了 2 个真实 Bug：

1. **积分兑换 VIP / 抽奖中 VIP 奖励 500**：`forum.ts` 里 `points/exchange` 与 `lottery` 的 VIP 天数发放，
   用论坛库（`rap_beats_forum_dev`）读写 `users` 表，主库论坛分离后报
   `Table 'rap_beats_forum_dev.users' doesn't exist`。已改为用主库 `getDatabaseClient()` 读写用户 VIP 字段。
2. **OSS 模式下论坛音频 BPM 轮询 404**：`upload-audio` 返回的 `audio_id` 在 OSS 模式是完整 URL（含 `/`），
   作为路由参数无法匹配 `/forum/audio-bpm/:audioId`。已改为返回 URL 安全的文件名（去掉扩展名），
   本地/OSS 模式行为一致。
3. **积分抽奖「等级每日次数」未生效**：`getDailyLotteryChances()` 已实现但从未被调用，
   接口硬编码 `daily_chances: 999`，实际只扣 5 积分不限次数。已完善为闭环：
   - 次数统计口径修正：每次抽奖实际写 `lottery_cost` 流水，`getTodayLotteryCount` 原按
     `lottery_participation` 统计导致永远为 0，已改为按真实 reason 统计（兼容历史 reason）；
   - `POST /forum/lottery` 抽奖前校验当日次数，超限返回 403 `LOTTERY_DAILY_LIMIT_REACHED`；
   - `GET /forum/lottery/status` 与 `GET /forum/points/config` 返回真实的
     `daily_chances / remaining_chances / used_today`（按积分等级：毛胚/出道 1、炸场 2、厂牌 3、GOAT 5）。
4. **免费用户「每日下载上限」补全（产品拍板：5 次/天）**：原 `getDailyDownloadLimit('free')` 返回 3，
   但免费用户走「积分权限」下载分支时从不检查每日次数（限额分支只对会员生效），等于无上限。
   已按产品决定落地：`getDailyDownloadLimit('free')` 改为 **5**，下载接口免费分支在消耗积分权限前
   先检查每日次数，超限返回 `403 DOWNLOAD_LIMIT_REACHED`（积分兑换权限同样计入，即每天最多
   经积分兑换下载 5 次）。用例：`免费用户经积分兑换每日最多 5 次：第 6 次应 403`。

新增的状态流转用例（S 组）：
`免费用户经积分兑换每日最多 5 次`、`basic 会员每日 10 次下载上限`、`VIP 到期自动降级并同步落库`、
`POST /admin/beats/:id/detect-bpm 重新识别 BPM`、`抽奖 VIP 奖品分支（强制 VIP 1天，到期时间 +1 天）`。
其中抽奖 VIP 分支通过开发环境测试钩子确定性触发（`MOCK_PAYMENT_ENABLED=true` 时请求头
`x-lottery-force-prize` 可指定奖品，生产环境无此开关、该头会被忽略）。

积分/签到/转盘/发帖的**闭环核验**（T 组，均以全新注册用户 + 真实接口调用验证）：
1. **积分账本闭环**：签到 +1 → 发帖 +5×2 → 抽奖 -5+100 → 第 3 帖 0 分（每日上限触顶），
   全程 `sum(积分流水) == 积分总额 == 106`，各 reason（sign_in/post_created/lottery_cost/lottery_reward）计数正确，抽奖记录落库；
2. **签到闭环**：造 6 天历史签到后第 7 天签到，连续 7 天 → `2(签到)+3(连续奖励)+50(里程碑)=55`，
   三笔流水（sign_in/sign_in_streak/sign_in_milestone）齐全且 `sum=总额=55`，重复签到 400；
3. **点赞奖励闭环**：他人点赞给作者 +1（post_liked），作者发帖 +5（post_created），总额 6 与流水一致；
4. **抽奖账目**：强制奖品 100 积分时 `-5 消耗 +100 奖励 = 净 +95`，流水与 lottery_records 一致。
5. **签到里程碑（30/100 天）**：连续 30 天签到获得 `2+3+200=205`，连续 100 天获得 `2+3+500=505`，
   里程碑流水（sign_in_milestone）只发一次且 `sum=总额`；
6. **发帖奖励等级倍率**：炸场（≥500 分）发帖奖励 ×2（+10），当日 10 分上限触顶后第 2 帖 0 分，
   流水合计 10、总额 610（含 SQL 造数 600 基数）；
7. **评论奖励闭环**：5 条顶层评论 `+2×5=10`（每日上限触顶，第 6 条 0 分），他人点赞评论给作者 +1，
   总额 11 与流水一致（comment_created/comment_liked）。

实现上积分变动统一走 `changePoints()` 事务（写流水 + 原子更新总额），因此上述闭环是系统性的，
不依赖个别接口实现。

OSS 隔离复核：线上根目录 `audio/ 39 / covers/ 39 / avatars/ 43 / banners/ 4` 与操作前一致；
测试上传全部落入 `dev/` 前缀（covers +2、avatars +2、forum-images +2 为测试产生的 dev 资源）。

## 七、仍未覆盖的流程 / 细节清单

以下流程未进入自动化套件（多为破坏性、随机性或需要造大量数据），回归时可手工或单独脚本执行：

1. **破坏性维护接口**：`/admin/maintenance/clear-test-users`、`/admin/maintenance/clear-demo-beats`
   只验证了未授权 401，未实际执行（会清库/删 OSS 对象）。
2. ~~已有 Beat 重新识别 BPM~~ 已覆盖（S 组：`POST /admin/beats/:id/detect-bpm`，bpm=94、时长 185s）。
3. **真实支付通道**：虎皮椒未配置，全部走 mock；mock 下 `pay_type=alipay` 分支未单独覆盖。
4. ~~抽奖「VIP 1天」奖品分支~~ 已覆盖（S 组通过测试钩子强制触发并断言到期时间 +1 天）。
5. **积分兑换 premium / ultimate 档**：只测了 basic（500 分），1200/3000 分档未测。
6. **签到连续天数 / 里程碑奖励**：种子造了 2 天连续，7/30 天里程碑分支未触发。
7. **发帖积分奖励每日上限**：`POINT_REWARDS` 的每日可获取上限未测边界。
8. ~~免费用户每日下载限额~~ 已覆盖：产品决定免费用户经积分兑换每天最多 **5 次**，
   已实现并自动化验证（第 6 次 403，见第六节第 4 条）；basic 10 次/天也已自动化验证。
9. ~~VIP 到期自动降级~~ 已覆盖（S 组：过期后访问 vip-status 返回 free 且 DB 同步）。
10. **VIP 时长叠加**：续费时未过期（叠加 30 天）场景未测（测试都是先到期再开通）。
11. **上传边界**：帖子 images 6 张上限、视频 >180s / >30MB 拒绝、论坛音频 >20MB 拒绝、multer 50MB 上限未测。
12. **限流 429**：登录/发帖/评论/播放的 rate limit 未打满验证。
13. **CORS 预检**：浏览器跨域 OPTIONS 预检未测。
14. **分页/参数边界**：`page=999`、`limit=0`、`limit=100` 上限、非法数字未全部覆盖。
15. **删除级联断言**：删 Beat/用户后，OSS 对象与关联表清理未做显式断言（流程隐含执行）。
16. **修改密码后旧 token**：JWT 7 天有效，旧 token 在改密后仍可用（当前设计如此，需产品确认是否接受）。
17. **论坛 BPM 后台分析最终 ready=true**：本机无 librosa sidecar（`[BpmDetector] sidecar unavailable`），
    只能验证接口契约，无法验证真实分析结果。
18. **视频封面提取失败路径**：日志曾出现 `ffmpeg exited with 234`，上传成功但封面可能缺失，需人工确认兜底。
19. **游客试听跨天重置**：第 2 天次数归零未跨日验证。
20. **健康检查 degraded 分支**：数据库断开时 `/api/health` 返回 503 未测。

~~积分抽奖每日次数未生效~~ 已修复（见第六节第 3 条），测试用例：
`抽奖每日次数：config/status 按等级返回且联动一致`、`抽奖超过每日次数应 403 (LOTTERY_DAILY_LIMIT_REACHED)`。
