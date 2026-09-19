import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';

const router = Router();

// ─── 公开关注/粉丝列表聚合接口（个人中心 / PublicProfileView 使用） ────────────
//
// GET /api/user/social/list?user_id=X&type=following|followers&page=1&limit=20
//   - 返回每个用户带 nickname / is_beatmaker / is_followed_by_me（当前 viewer 视角）
//   - 未登录时 is_followed_by_me 全部 false
//   - 用于个人主页的关注/粉丝 Tab + 公开页 /u/:id
router.get('/user/social/list', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();

  const targetId = parseInt(req.query.user_id as string);
  const type = req.query.type === 'following' ? 'following' : 'followers';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  // 目标用户必须存在
  const exists = await mainDb.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE id = ?',
    [targetId]
  );
  if (!exists) return res.status(404).json({ error: '用户不存在' });

  const whereCol = type === 'following' ? 'follower_id' : 'following_id';
  const otherCol = type === 'following' ? 'following_id' : 'follower_id';

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    `SELECT COUNT(*) AS total FROM forum_follows WHERE ${whereCol} = ?`,
    [targetId]
  );

  const rows = await forumDb.queryMany<{ other_id: number; created_at: Date }>(
    `SELECT ${otherCol} AS other_id, created_at
       FROM forum_follows
      WHERE ${whereCol} = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [targetId, limit, offset]
  );

  if (rows.length === 0) {
    return res.json({
      type,
      users: [],
      pagination: { page, page_size: limit, total, total_pages: Math.ceil(total / limit) },
    });
  }

  const userIds = rows.map((r) => r.other_id);
  const placeholders = userIds.map(() => '?').join(',');

  const users = await mainDb.queryMany<{
    id: number; username: string; nickname: string | null;
    avatar_url: string | null; is_beatmaker: number; vip_level: string;
  }>(
    `SELECT id, username, nickname, avatar_url, is_beatmaker, vip_level
       FROM users WHERE id IN (${placeholders})`,
    userIds
  );

  // 当前 viewer 是否关注了这些人（未登录则跳过）
  const viewerId = req.user?.id;
  let followedSet = new Set<number>();
  if (viewerId) {
    const followRows = await forumDb.queryMany<{ following_id: number }>(
      `SELECT following_id FROM forum_follows
        WHERE follower_id = ? AND following_id IN (${placeholders})`,
      [viewerId, ...userIds]
    );
    followedSet = new Set(followRows.map((f) => f.following_id));
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const result = rows
    .map((r) => {
      const u = userMap.get(r.other_id);
      if (!u) return null; // 用户已删除时跳过
      return {
        id: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        avatar_url: u.avatar_url || null,
        is_beatmaker: u.is_beatmaker ?? 0,
        vip_level: u.vip_level || 'free',
        is_followed_by_me: followedSet.has(u.id),
        followed_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      };
    })
    .filter(Boolean);

  res.json({
    type,
    users: result,
    pagination: {
      page,
      page_size: limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
});

export default router;
