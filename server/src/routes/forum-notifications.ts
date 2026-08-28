import {
  createForumRouter,
  getForumDatabaseClient,
  getDatabaseClient,
  requireAuth,
  type AuthRequest,
} from './forum-common.js';
import { pushToUser } from '../services/messageEvents.js';

const router = createForumRouter();

export type NotificationType = 'like_post' | 'like_comment' | 'comment' | 'follow' | 'system';

interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  actor_id: number;
  target_type: string | null;
  target_id: number | null;
  target_title: string | null;
  is_read: number;
  created_at: Date;
  actor_username?: string;
  actor_avatar?: string;
}

// ── 通知类型映射（用于前端显示）───────────────────────────────────────────────
const NOTIFICATION_MESSAGES: Record<NotificationType, (actor: string, title?: string) => string> = {
  like_post: (actor) => `${actor} 点赞了你的帖子`,
  like_comment: (actor) => `${actor} 点赞了你的评论`,
  comment: (actor, title) => `${actor} 评论了你的${title ? `帖子「${title}」` : '动态'}`,
  follow: (actor) => `${actor} 关注了你`,
  system: () => '系统通知',
};

/**
 * 创建通知并推送 SSE 事件
 */
async function createNotification(
  db: ReturnType<typeof getForumDatabaseClient>,
  mainDb: ReturnType<typeof getDatabaseClient>,
  userId: number,
  type: NotificationType,
  actorId: number,
  targetType?: string,
  targetId?: number,
  targetTitle?: string
): Promise<void> {
  // 不给自己发通知
  if (userId === actorId) return;

  // 幂等写入：复合唯一键 (user_id, type, actor_id, target_type(50), target_id)
  // 命中时 UPDATE is_read=0 会让已读的同目标通知重新变成未读（用户体验合理），
  // 同时 LAST_INSERT_ID(id) 保持 insertId 可用。
  const result = await db.execute(
    `INSERT INTO forum_notifications (user_id, type, actor_id, target_type, target_id, target_title)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_read = 0, created_at = CURRENT_TIMESTAMP`,
    [userId, type, actorId, targetType ?? null, targetId ?? null, targetTitle ?? null]
  );
  const affectedRows = Number(result.affectedRows) || 0;
  // 1 = 真插入新通知；2 = 命中 UNIQUE 并做了 UPDATE → 两种都要推 SSE
  if (affectedRows !== 1 && affectedRows !== 2) return;

  // 获取发送者信息用于实时推送
  const actorInfo = await mainDb.queryOne<{ username: string; avatar_url: string }>(
    'SELECT username, avatar_url FROM users WHERE id = ?',
    [actorId]
  );

  // 获取通知消息文本
  const message = NOTIFICATION_MESSAGES[type]?.(
    actorInfo?.username ?? '有人',
    targetTitle ?? undefined
  ) ?? '收到一条新通知';

  // 实时推送 SSE 事件
  pushToUser(userId, 'notification', {
    id: result.insertId ?? (result as any).insertId,
    type,
    actor_id: actorId,
    actor_username: actorInfo?.username,
    actor_avatar: actorInfo?.avatar_url,
    target_type: targetType,
    target_id: targetId,
    target_title: targetTitle,
    message,
    created_at: new Date().toISOString(),
  });
}

export { createNotification };

// ── 通知列表 ─────────────────────────────────────────────────────────────────

// GET /api/forum/notifications — 获取通知列表
router.get('/forum/notifications', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  // 通知记录（按时间倒序）
  const notifications = await db.queryMany<NotificationRow>(
    `SELECT * FROM forum_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, pageSize, offset]
  );

  // 统计总数
  const [{ count }] = await db.queryMany<{ count: number }>(
    'SELECT COUNT(*) as count FROM forum_notifications WHERE user_id = ?',
    [userId]
  );

  // 补充发送者信息
  const actorIds = [...new Set(notifications.map(n => n.actor_id))];
  const actors = actorIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${actorIds.map(() => '?').join(',')})`,
        actorIds
      )
    : [];
  const actorMap = new Map(actors.map(a => [a.id, a]));

  const enriched = notifications.map(n => {
    const actor = actorMap.get(n.actor_id);
    return {
      ...n,
      actor_username: actor?.username,
      actor_avatar: actor?.avatar_url,
      message: NOTIFICATION_MESSAGES[n.type]?.(actor?.username ?? '有人', n.target_title ?? undefined) ?? '收到一条新通知',
      time_ago: formatTimeAgo(n.created_at),
    };
  });

  res.json({
    notifications: enriched,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total: count,
      total_pages: Math.ceil(count / pageSize),
    },
  });
});

// GET /api/forum/notifications/unread-count — 未读通知数
router.get('/forum/notifications/unread-count', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;

  const [{ count }] = await db.queryMany<{ count: number }>(
    'SELECT COUNT(*) as count FROM forum_notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  res.json({ unread_count: count });
});

// PUT /api/forum/notifications/:id/read — 标记单条已读
router.put('/forum/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const { id } = req.params;

  await db.execute(
    'UPDATE forum_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  res.json({ success: true });
});

// PUT /api/forum/notifications/read-all — 全部已读
router.put('/forum/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;

  await db.execute(
    'UPDATE forum_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  res.json({ success: true });
});

// DELETE /api/forum/notifications/:id — 删除通知
router.delete('/forum/notifications/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const { id } = req.params;

  await db.execute(
    'DELETE FROM forum_notifications WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  res.json({ success: true });
});

// DELETE /api/forum/notifications/clear — 清空所有通知
router.delete('/forum/notifications/clear', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;

  await db.execute(
    'DELETE FROM forum_notifications WHERE user_id = ?',
    [userId]
  );

  res.json({ success: true });
});

// ── 辅助函数 ─────────────────────────────────────────────────────────────────
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

export default router;
