-- ============================================================
-- 本地开发 MySQL 初始化脚本
-- docker-compose.dev.yml 把整个目录挂到 /docker-entrypoint-initdb.d/，
-- MySQL 首次启动时会按文件名字母顺序执行 .sql / .sh。
-- 仅在数据目录为空时执行，重复 up 不会重跑。
-- ============================================================

-- 论坛库（与主库 rap_beats_dev 配套使用）
CREATE DATABASE IF NOT EXISTS rap_beats_forum_dev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
