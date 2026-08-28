/**
 * 管理员通知辅助函数
 * 用于在关键业务事件发生时向管理员推送通知
 */
import { getDatabaseClient } from '../database/client.js';

export type AdminNotificationType =
  | 'new_user_registered'
  | 'beatmaker_application'
  | 'beatmaker_approved'
  | 'beatmaker_rejected'
  | 'vip_purchased'
  | 'system_event';

export interface CreateAdminNotificationParams {
  type: AdminNotificationType;
  title: string;
  content?: string;
  data?: Record<string, unknown>;
}

/**
 * 创建管理员通知（不抛异常，失败静默）
 */
export async function createAdminNotification(
  params: CreateAdminNotificationParams
): Promise<void> {
  try {
    const db = getDatabaseClient();
    await db.execute(
      'INSERT INTO admin_notifications (type, title, content, extra_data) VALUES (?, ?, ?, ?)',
      [
        params.type,
        params.title,
        params.content || null,
        params.data ? JSON.stringify(params.data) : null
      ]
    );
  } catch (err) {
    console.warn('[admin-notification] create failed:', err);
  }
}

/**
 * 通知类型映射：用于前端展示图标和样式
 */
export const ADMIN_NOTIFICATION_META: Record<
  AdminNotificationType,
  { label: string; icon: string; color: string }
> = {
  new_user_registered: { label: '新用户注册', icon: '👤', color: '#3b82f6' },
  beatmaker_application: { label: 'Beatmaker 申请', icon: '🎭', color: '#8b5cf6' },
  beatmaker_approved: { label: 'Beatmaker 认证通过', icon: '✅', color: '#10b981' },
  beatmaker_rejected: { label: 'Beatmaker 认证驳回', icon: '❌', color: '#ef4444' },
  vip_purchased: { label: '会员购买', icon: '👑', color: '#f59e0b' },
  system_event: { label: '系统事件', icon: '⚙️', color: '#6b7280' }
};
