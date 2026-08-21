# 本机 MySQL 数据库对照表（避免混淆）

> 本机有 6 个库，其中移动端与 PC 端库名仅差一个字母 s，极易混淆。本文档是唯一权威对照。

## 总览

| 库名 | 归属项目 | 用途 | 表数 | 当前状态 |
|---|---|---|---|---|
| `rap_beat`（单数） | **RAP-BEAT-APP（移动端 H5）** | 本项目唯一业务库 | 21 | 活跃（每日更新） |
| `rap_beats`（复数） | rap-beats（PC 端）生产 | PC 端主库 | 22 | 本地留存的 prod 副本 |
| `rap_beats_dev`（复数） | rap-beats（PC 端）开发 | PC 端 dev 主库（server/.env 引用） | 26 | 活跃 |
| `rap_beats_forum` | rap-beats（PC 端）生产 | PC 端论坛库 | 12 | 本地留存的 prod 副本 |
| `rap_beats_forum_dev` | rap-beats（PC 端）开发 | PC 端论坛 dev 库 | 12 | 活跃 |
| `testdb` | 无主 | 早期测试残留（仅 1 张 users 表） | 1 | 可考虑清理 |

## 记忆口诀

**单数移动，复数 PC；带 _dev 是开发库，不带是生产。**

- RAP-BEAT-APP（移动端）只有**一个**库：`rap_beat`（没有 dev/prod 之分，本地即开发库）
- rap-beats（PC 端）有**四个**库：主库 + 论坛库，各分 dev/prod

## 连接配置出处

| 项目 | 配置文件 | 值 |
|---|---|---|
| RAP-BEAT-APP（本项目） | `server/.env` | `DB_NAME=rap_beat`（host localhost:3306） |
| rap-beats（PC）开发 | `server/.env` / 根 `.env` | `DB_NAME=rap_beats_dev` + `FORUM_DB_NAME=rap_beats_forum_dev` |
| rap-beats（PC）生产 | `.env.production` | `DB_NAME=rap_beats` + `FORUM_DB_NAME=rap_beats_forum` |

## 高危操作提醒

1. **执行 mysqldump / mysql 导入前先核对库名**：`rap_beat` ≠ `rap_beats`，tab 补全很容易补错
2. **PC 端 Docker MySQL（3307 端口容器 rap-beats-dev-mysql）与本地 3306 是两个实例**，本项目用的是本地 3306
3. 永远不要对 `rap_beat` 执行来自 rap-beats 项目的 SQL 脚本（表结构不同：本项目 21 表 vs PC 端 26 表）
4. `testdb` 为无主残留，确认无用后可清理

## 若想彻底消除混淆（可选，需停服操作）

将 `rap_beat` 重命名为 `rap_beat_h5`（MySQL 无直接 RENAME DATABASE，需建新库 + dump 导入 + 改 .env）。
非必要不建议：当前文档 + .env 注释已足够防混淆。

---
*生成：2026-08-15，由全库扫描核实。两项目 docs/ 各存一份，改动库名时同步更新。*
