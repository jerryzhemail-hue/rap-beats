import { getDatabaseClient } from '../database/client.js';
import { pushToUser } from '../services/messageEvents.js';

/**
 * 系统通知类型
 */
export type SystemNotificationType =
  | 'beatmaker_approved'
  | 'beatmaker_rejected'
  | 'system'
  | 'vip_expiring'
  | 'vip_expired';

export interface SystemNotificationPayload {
  id: number;
  type: SystemNotificationType;
  title: string;
  content: string | null;
  is_read: number;
  actor_id: number | null;
  actor_username?: string;
  target_type: string | null;
  target_id: number | null;
  created_at: string;
}

/**
 * 创建系统通知并通过 SSE 推送给在线用户。
 * 离线用户下次拉取时可见。
 */
export async function createSystemNotification(
  userId: number,
  type: SystemNotificationType,
  title: string,
  content: string | null,
  actorId: number | null = null,
  targetType: string | null = null,
  targetId: number | null = null,
): Promise<{ id: number } | null> {
  const db = getDatabaseClient();

  const result = await db.execute(
    `INSERT INTO system_notifications (user_id, type, title, content, is_read, actor_id, target_type, target_id)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    [userId, type, title, content, actorId, targetType, targetId]
  );

  const insertId = Number(result.insertId) || 0;
  if (!insertId) return null;

  // 获取操作者用户名（用于 SSE 推送）
  let actorUsername: string | undefined;
  if (actorId) {
    const actor = await db.queryOne<{ username: string }>(
      'SELECT username FROM users WHERE id = ?',
      [actorId]
    );
    actorUsername = actor?.username;
  }

  // SSE 推送
  pushToUser(userId, 'system_notification', {
    id: insertId,
    type,
    title,
    content,
    is_read: 0,
    actor_id: actorId,
    actor_username: actorUsername,
    target_type: targetType,
    target_id: targetId,
    created_at: new Date().toISOString(),
  });

  return { id: insertId };
}
