-- ============================================================
-- 论坛用户补齐脚本：将 forum 库帖子引用的 user_id 同步到主库 users
-- 背景：forum 库没有 users 表，所有 user_id 都是裸外键
-- 策略：在主库为缺失的 user_id 创建占位用户（username=forum_user_{id}）
-- 幂等：可重复执行（已存在会跳过）
-- ============================================================
--
-- 用法：
--   docker exec -i rap-beats-dev-mysql mysql -udev_user rap_beats_dev < scripts/seed-forum-users.sql
--

-- 1. 缺失的 forum user_id 列表（调试用）
SELECT '=== 缺失的 forum user_id ===' AS step;

SELECT f.user_id
FROM (
    SELECT DISTINCT user_id FROM rap_beats_forum.forum_posts
    UNION
    SELECT DISTINCT user_id FROM rap_beats_forum.forum_comments
) AS f
LEFT JOIN users u ON u.id = f.user_id
WHERE u.id IS NULL
ORDER BY f.user_id;

-- 2. 补插（按 forum_user_{id} 命名）
SELECT '=== 开始补插 ===' AS step;

INSERT INTO users (id, username, email, password_hash, avatar_url, created_at, updated_at)
SELECT
    f.user_id                                          AS id,
    CONCAT('forum_user_', f.user_id)                   AS username,
    CONCAT('forum_user_', f.user_id, '@forum.placeholder') AS email,
    '!'                                                AS password_hash,  -- 永远无法登录的占位密码
    NULL                                               AS avatar_url
FROM (
    SELECT DISTINCT user_id FROM rap_beats_forum.forum_posts
    UNION
    SELECT DISTINCT user_id FROM rap_beats_forum.forum_comments
) AS f
LEFT JOIN users u ON u.id = f.user_id
WHERE u.id IS NULL
  AND f.user_id > 0;

-- 3. 验证
SELECT '=== 补插结果 ===' AS step;

SELECT
    COUNT(*) AS forum_user_count,
    GROUP_CONCAT(id ORDER BY id) AS forum_user_ids
FROM users
WHERE username LIKE 'forum_user_%';
