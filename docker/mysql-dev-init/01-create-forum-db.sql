-- ============================================================
-- 本地开发 MySQL 初始化脚本
-- docker-compose.dev.yml 把整个目录挂到 /docker-entrypoint-initdb.d/,
-- MySQL 首次启动时会按文件名字母顺序执行 .sql / .sh。
-- 仅在数据目录为空时执行,重复 up 不会重跑。
-- ============================================================

-- 主库 rap_beats_dev 由 compose 的 MYSQL_DATABASE 自动创建。
-- 这里补齐两个独立业务库,并给应用账号 dev_user 授权。
-- 名字必须与 server/.env 中的 FORUM_DB_NAME / MEMBERSHIP_DB_NAME 保持一致。

CREATE DATABASE IF NOT EXISTS rap_beats_forum
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS rap_beats_membership
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON rap_beats_forum.* TO 'dev_user'@'%';
GRANT ALL PRIVILEGES ON rap_beats_membership.* TO 'dev_user'@'%';
FLUSH PRIVILEGES;
