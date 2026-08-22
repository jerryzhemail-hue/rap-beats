-- ============================================================
-- 本地开发 MySQL 初始化脚本
-- docker-compose.dev.yml 把整个目录挂到 /docker-entrypoint-initdb.d/,
-- MySQL 首次启动时会按文件名字母顺序执行 .sql / .sh。
-- 仅在数据目录为空时执行,重复 up 不会重跑。
-- ============================================================

-- 论坛独立库(与主库 rap_beats_dev 配套)
-- 名字必须与 server/.env 中的 FORUM_DB_NAME 保持一致
-- 否则 server 连不到这里建的库
CREATE DATABASE IF NOT EXISTS rap_beats_forum
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
