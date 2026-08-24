import { getForumDatabaseClient, getDatabaseClient } from './forum-common.js';
import { pushToUser } from '../services/messageEvents.js';

export type NotificationType = 'like_post' | 'like_comment' | 'comment' | 'follow' | 'system';

const NOTIFICATION_MESSAGES: Record<NotificationType, (actor: string, title?: string) => string> = {
  like_post: (actor) => `${actor} 点赞了你的帖子`,
  like_comment: (actor) => `${actor} 点赞了你的评论`,
  comment: (actor, title) => `${actor} 评论了你的${title ? `帖子「${title}」` : '动态'}`,
  follow: (actor) => `${actor} 关注了你`,
  system: () => '系统通知',
};

/**
 * 创建通知并推送 SSE 事件（不给自己发通知）
 */
export async function createNotification(
  userId: number,
  type: NotificationType,
  actorId: number,
  targetType?: string,
  targetId?: number,
  targetTitle?: string
): Promise<void> {
  if (userId === actorId) return;

  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();

  const result = await db.execute(
    `INSERT INTO forum_notifications (user_id, type, actor_id, target_type, target_id, target_title)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, actorId, targetType ?? null, targetId ?? null, targetTitle ?? null]
  );

  const actorInfo = await mainDb.queryOne<{ username: string; avatar_url: string }>(
    'SELECT username, avatar_url FROM users WHERE id = ?',
    [actorId]
  );

  const message = NOTIFICATION_MESSAGES[type]?.(
    actorInfo?.username ?? '有人',
    targetTitle ?? undefined
  ) ?? '收到一条新通知';

  pushToUser(userId, 'notification', {
    id: (result as any).insertId,
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
