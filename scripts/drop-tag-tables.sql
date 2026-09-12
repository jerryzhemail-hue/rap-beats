-- ============================================================
-- 清理热门标签相关数据与表结构
-- 执行前请确认已备份数据库！
-- ============================================================

-- 步骤 1: 临时关闭外键检查（避免删除顺序问题）
SET FOREIGN_KEY_CHECKS = 0;

-- 步骤 2: 删除表（按依赖顺序：先删有外键引用的，再删被引用的）
DROP TABLE IF EXISTS forum_post_keywords;
DROP TABLE IF EXISTS beat_tag_usage;
DROP TABLE IF EXISTS beat_tags;

-- 步骤 3: 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 步骤 4: 确认删除结果（预期：这三个表已不存在）
-- SELECT TABLE_NAME
--   FROM information_schema.TABLES
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME IN ('beat_tags', 'beat_tag_usage', 'forum_post_keywords');
-- 预期结果：Empty set

-- 步骤 5: 清理 beats 表的 tags JSON 字段（可选，保留也无害）
-- -- 将所有 beats.tags 设为 NULL
-- UPDATE beats SET tags = NULL WHERE tags IS NOT NULL AND tags != '[]' AND tags != '';
