-- 清理脚本：将 rapper 字段包含 & 的记录拆分成独立的记录
USE rap_beats;

-- 1. 先拆分插入新记录
INSERT INTO beats (title, producer, rapper, bpm, `key`, genre, tags, duration, file_path, cover_image, is_free, download_count, uploaded_by, created_at)
SELECT 
  b.title,
  b.producer,
  TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.rapper, '&', numbers.n), '&', -1)) as new_rapper,
  b.bpm,
  b.`key`,
  b.genre,
  b.tags,
  b.duration,
  b.file_path,
  b.cover_image,
  b.is_free,
  0,
  b.uploaded_by,
  b.created_at
FROM beats b
JOIN (
  SELECT 1 as n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
) numbers ON n <= LENGTH(b.rapper) - LENGTH(REPLACE(b.rapper, '&', '')) + 1
WHERE b.rapper LIKE '%&%';

-- 2. 删除原来的合并记录
DELETE FROM beats WHERE rapper LIKE '%&%';

-- 3. 验证结果
SELECT '清理后的 beats 表记录:' as info;
SELECT id, title, rapper, producer FROM beats;
