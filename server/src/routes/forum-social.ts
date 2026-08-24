import { createForumRouter, getForumDatabaseClient, getDatabaseClient, requireAuth, type AuthRequest, enrichWithUsers, type ForumUser, type ForumUserProfile } from './forum-common.js';
import { createNotification } from './forum-notifications-helper.js';
import fs from 'fs';

const router = createForumRouter();

router.post('/forum/blocks/:userId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }
  if (userId === targetId) {
    return res.status(400).json({ error: '不能拉黑自己' });
  }

  const existing = await db.queryOne(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [userId, targetId]
  );
  if (existing) {
    return res.json({ success: true, already: true });
  }

  await db.execute(
    'INSERT INTO forum_blocks (user_id, blocked_user_id) VALUES (?, ?)',
    [userId, targetId]
  );
  res.json({ success: true });
});

// 取消拉黑
router.delete('/forum/blocks/:userId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  await db.execute(
    'DELETE FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [userId, targetId]
  );
  res.json({ success: true });
});

// 检查我对某用户的拉黑状态
router.get('/forum/blocks/:userId/status', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [blockedByMe, blockedMe] = await Promise.all([
    db.queryOne<{ user_id: number }>(
      'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
      [userId, targetId]
    ),
    db.queryOne<{ user_id: number }>(
      'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
      [targetId, userId]
    ),
  ]);

  res.json({
    blocked_by_me: !!blockedByMe,
    blocked_me: !!blockedMe,
  });
});

// 拉黑列表
router.get('/forum/blocks', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;

  const blocks = await db.queryMany<{ blocked_user_id: number; created_at: Date }>(
    'SELECT blocked_user_id, created_at FROM forum_blocks WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  if (blocks.length === 0) {
    return res.json({ users: [] });
  }

  const userIds = blocks.map((b) => b.blocked_user_id);
  const placeholders = userIds.map(() => '?').join(',');
  const users = await mainDb.queryMany<{ id: number; username: string; avatar_url: string | null }>(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${placeholders})`,
    userIds
  );

  res.json({ users });
});

// ════════════════════════════════════════════════════════════════════════════════
// 用户资料与关注功能
// ════════════════════════════════════════════════════════════════════════════════

// 获取用户资料
router.get('/forum/users/:userId', async (req, res) => {
  const mainDb = getDatabaseClient();
  const forumDb = getForumDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const user = await mainDb.queryOne<Omit<ForumUser, 'forum_profile'>>(
    'SELECT id, username, avatar_url FROM users WHERE id = ?',
    [userIdNum]
  );

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 获取论坛资料
  let profile = await forumDb.queryOne<ForumUserProfile>(
    'SELECT * FROM forum_user_profiles WHERE user_id = ?',
    [userIdNum]
  );

  // 如果没有资料，创建一个默认的
  if (!profile) {
    await forumDb.execute(
      'INSERT INTO forum_user_profiles (user_id) VALUES (?)',
      [userIdNum]
    );
    profile = await forumDb.queryOne<ForumUserProfile>(
      'SELECT * FROM forum_user_profiles WHERE user_id = ?',
      [userIdNum]
    );
  }

  res.json({
    user: {
      ...user,
      forum_profile: {
        ...profile,
        social_links: profile?.social_links ? JSON.parse(profile.social_links as unknown as string) : {},
      },
    },
  });
});

// 更新当前用户资料
router.put('/forum/users/profile', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const userId = req.user!.id;
  const { bio, location, website, social_links } = req.body as {
    bio?: string;
    location?: string;
    website?: string;
    social_links?: Record<string, string>;
  };

  // 验证字段长度
  if (bio && bio.length > 500) {
    return res.status(400).json({ error: '简介不能超过500字' });
  }
  if (location && location.length > 100) {
    return res.status(400).json({ error: '所在地不能超过100字' });
  }
  if (website && website.length > 255) {
    return res.status(400).json({ error: '个人网站不能超过255字' });
  }

  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, bio, location, website, social_links)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       bio = COALESCE(?, bio),
       location = COALESCE(?, location),
       website = COALESCE(?, website),
       social_links = COALESCE(?, social_links)`,
    [userId, bio || null, location || null, website || null, social_links ? JSON.stringify(social_links) : null, bio, location, website, social_links ? JSON.stringify(social_links) : null]
  );

  const profile = await forumDb.queryOne<ForumUserProfile>(
    'SELECT * FROM forum_user_profiles WHERE user_id = ?',
    [userId]
  );

  res.json({
    profile: {
      ...profile,
      social_links: profile?.social_links ? JSON.parse(profile.social_links as unknown as string) : {},
    },
  });
});

// 获取用户发布的帖子列表
router.get('/forum/users/:userId/posts', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_posts WHERE user_id = ? AND status = ?',
    [userIdNum, 'published']
  );

  const posts = await forumDb.queryMany<any>(
    `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
     FROM forum_posts fp
     LEFT JOIN forum_categories fc ON fp.category_id = fc.id
     WHERE fp.user_id = ? AND fp.status = 'published'
     ORDER BY fp.created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 补充用户信息
  const enrichedPosts = await enrichWithUsers(posts, mainDb);

  res.json({
    posts: enrichedPosts,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// 关注用户
router.post('/forum/users/:userId/follow', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  if (followerId === followingId) {
    return res.status(400).json({ error: '不能关注自己' });
  }

  // 验证目标用户存在
  const targetUser = await mainDb.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [followingId]);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 黑名单检查：任一方拉黑另一方则不能关注
  const blocked = await forumDb.queryOne<{ user_id: number }>(
    `SELECT user_id FROM forum_blocks
     WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)`,
    [followerId, followingId, followingId, followerId]
  );
  if (blocked) {
    return res.status(403).json({ error: '由于拉黑关系，无法关注该用户' });
  }

  // 检查是否已关注
  const existing = await forumDb.queryOne<{ follower_id: number }>(
    'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  if (existing) {
    return res.status(409).json({ error: '已经关注过了' });
  }

  // 创建关注关系
  await forumDb.execute(
    'INSERT INTO forum_follows (follower_id, following_id) VALUES (?, ?)',
    [followerId, followingId]
  );

  // 更新关注数和粉丝数（INSERT OR UPDATE 确保 profile 存在）
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, following_count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE following_count = following_count + 1`,
    [followerId]
  );
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, follower_count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE follower_count = follower_count + 1`,
    [followingId]
  );

  // 发送关注通知
  await createNotification(followingId, 'follow', followerId);

  res.status(201).json({ success: true, message: '关注成功' });
});

// 取消关注
router.delete('/forum/users/:userId/follow', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  // 检查是否有关注关系
  const existing = await forumDb.queryOne<{ follower_id: number }>(
    'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  if (!existing) {
    return res.status(404).json({ error: '未关注该用户' });
  }

  // 删除关注关系
  await forumDb.execute(
    'DELETE FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  // 更新关注数和粉丝数（INSERT OR UPDATE 确保 profile 存在，COALESCE 防负数）
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, following_count) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE following_count = GREATEST(0, following_count - 1)`,
    [followerId]
  );
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, follower_count) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE follower_count = GREATEST(0, follower_count - 1)`,
    [followingId]
  );

  res.json({ success: true, message: '已取消关注' });
});

// 检查关注状态
router.get('/forum/users/:userId/follow-status', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [isFollowing, isFollowedBy] = await Promise.all([
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    ),
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [followingId, followerId]
    ),
  ]);

  res.json({
    is_following: !!isFollowing,
    is_followed_by: !!isFollowedBy,
  });
});

// 获取用户粉丝列表
router.get('/forum/users/:userId/followers', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_follows WHERE following_id = ?',
    [userIdNum]
  );

  const followers = await forumDb.queryMany<{ follower_id: number; created_at: Date }>(
    `SELECT follower_id, created_at FROM forum_follows
     WHERE following_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 获取用户信息
  const userIds = followers.map(f => f.follower_id);
  const users = userIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      )
    : [];

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = followers.map(f => ({
    ...userMap.get(f.follower_id),
    followed_at: f.created_at,
  }));

  res.json({
    followers: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// 获取用户关注列表
router.get('/forum/users/:userId/followings', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_follows WHERE follower_id = ?',
    [userIdNum]
  );

  const followings = await forumDb.queryMany<{ following_id: number; created_at: Date }>(
    `SELECT following_id, created_at FROM forum_follows
     WHERE follower_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 获取用户信息
  const userIds = followings.map(f => f.following_id);
  const users = userIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      )
    : [];

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = followings.map(f => ({
    ...userMap.get(f.following_id),
    followed_at: f.created_at,
  }));

  res.json({
    followings: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// GET /api/forum/friends — 获取互相关注的好友列表
router.get('/forum/friends', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  // 互相关注：A 关注 B 且 B 关注 A
  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    `SELECT COUNT(*) as total
     FROM forum_follows f1
     JOIN forum_follows f2
       ON f1.following_id = f2.follower_id
      AND f2.following_id = f1.follower_id
     WHERE f1.follower_id = ?`,
    [userId]
  );

  const friends = await forumDb.queryMany<{ following_id: number; followed_at: Date }>(
    `SELECT f1.following_id, f1.created_at as followed_at
     FROM forum_follows f1
     JOIN forum_follows f2
       ON f1.following_id = f2.follower_id
      AND f2.following_id = f1.follower_id
     WHERE f1.follower_id = ?
     ORDER BY f1.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, pageSize, offset]
  );

  if (friends.length === 0) {
    return res.json({ friends: [], pagination: { page: pageNum, page_size: pageSize, total: 0, total_pages: 0 } });
  }

  const userIds = friends.map(f => f.following_id);
  const users = await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
    userIds
  );

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = friends.map(f => ({
    ...userMap.get(f.following_id),
    followed_at: f.followed_at,
  }));

  res.json({
    friends: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

export default router;
