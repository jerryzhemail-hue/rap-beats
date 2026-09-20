# 本项目数据库对照表（rap-beats PC 端）

> **重要**：本仓库是 rap-beats PC 端项目，统一使用 `rap_beats*` 复数库。
> **不是** RAP-BEAT-APP 移动端 H5（那个项目用的是单数 `rap_beat` 库，21 张表，与本仓库无关）。

## 总览

| 库名 | 用途 | 连接配置 | 当前状态 |
|---|---|---|---|
| `rap_beats` | **生产主库** | `docker-compose.prod.yml`（prod compose 注入） | 活跃 |
| `rap_beats_forum` | **生产论坛库** | `FORUM_DB_NAME` | 活跃 |
| `rap_beats_membership` | **生产会员库**（积分 / VIP） | `MEMBERSHIP_DB_NAME` | 活跃 |
| `rap_beats_dev` | 本地开发主库（端口 3307） | `server/.env.dev.example` | 活跃 |
| `rap_beats_forum_dev` | 本地开发论坛库 | 同上 | 活跃 |
| `rap_beats_membership_dev` | 本地开发会员库 | 同上 | 活跃 |
| `rap_beats_test` | 测试主库（vitest 用） | `server/.env.test` | 活跃 |
| `rap_beats_forum_test` | 测试论坛库 | 同上 | 活跃 |
| `rap_beats_membership_test` | 测试会员库 | 同上 | 活跃 |

## 记忆口诀

**带 `_dev` 是开发库（端口 3307），带 `_test` 是测试库（独立库避免污染 dev），不带是生产。**
**复数 `rap_beats`（不是单数 `rap_beat`），单数那个库属于 RAP-BEAT-APP 移动端项目，与本仓库无关。**

## 连接配置出处

| 环境 | 配置文件 | 值 |
|------|---------|---|
| 本地开发 | `server/.env.dev.example` → `server/.env` | `DB_NAME=rap_beats_dev` + `FORUM_DB_NAME=rap_beats_forum_dev` + `MEMBERSHIP_DB_NAME=rap_beats_membership_dev` |
| 本地测试 | `server/.env.test` | `DB_NAME=rap_beats_test` + `FORUM_DB_NAME=rap_beats_forum_test` + `MEMBERSHIP_DB_NAME=rap_beats_membership_test` |
| CI | `.github/workflows/test.yml` | inline 注入 + 测试库前缀 `_test` |
| 生产 | `.env.production`（由部署脚本生成，不入库） | `DB_NAME=rap_beats` + `FORUM_DB_NAME=rap_beats_forum` + `MEMBERSHIP_DB_NAME=rap_beats_membership` |

## 高危操作提醒

1. **执行 mysqldump / mysql 导入前先核对库名**：本项目用复数 `rap_beats`（不是单数 `rap_beat`），tab 补全很容易补错
2. **本地 MySQL 容器（3307 端口 rap-beats-dev-mysql）与可能的本地 3306 是两个实例**，确认 `DB_PORT` 正确
3. **schema_migrations 表**：所有库结构变更必须走 `server/src/database/index.ts` 里的 migrate() 函数，不要直接 ALTER 后忘记录入
4. 测试库必须每次测试前干净 —— `tests/setup.ts` 通过 `npm run db:reset:test` 或 drop database 重置
5. 永远不要对 `rap_beat`（单数）执行本仓库的 SQL 脚本（表结构不同）

## 库名变更（重大决策）

如要彻底消除与移动端 H5 项目的混淆，可考虑：
- 本仓库改名 `rap_beats_pc_*`，但需要迁数据，**不建议**
- 移动端 H5 改名 `rap_beat_h5_*`，同样需要迁移
- 当前约定：复数 = PC，单数 = 移动，已经有 DATABASE-MAP.md 兜底，**暂不动**

---
*最近更新：2026-09-20，与代码仓库同步。schema 变更必须同步更新本文档。*
