/**
 * 管理员通知 API 路由
 * GET  /api/admin/notifications           获取通知列表
 * GET  /api/admin/notifications/unread    获取未读数量
 * PATCH /api/admin/notifications/:id/read 标记单条已读
 * POST /api/admin/notifications/read-all   全部标记已读
 * DELETE /api/admin/notifications/:id     删除单条通知
 * DELETE /api/admin/notifications         清空所有通知
 */
import { Router } from 'express';
import { getDatabaseClient } from '../database/client.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/admin/notifications
 */
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const db = getDatabaseClient();
    const notifications = await db.queryMany<{
      id: number;
      type: string;
      title: string;
      content: string | null;
      data: string | null;
      is_read: number;
      created_at: string;
    }>(
      'SELECT id, type, title, content, extra_data AS data, is_read, created_at FROM admin_notifications ORDER BY id DESC LIMIT 200'
    );

    const parsed = notifications.map((n) => ({
      ...n,
      data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
    }));

    res.json({ notifications: parsed });
  } catch (err: any) {
    console.error('Failed to fetch admin notifications:', err);
    res.status(500).json({ error: '获取通知失败', detail: err?.message || String(err) });
  }
});

/**
 * GET /api/admin/notifications/unread
 */
router.get('/unread', requireAdmin, async (_req, res) => {
  try {
    const db = getDatabaseClient();
    const row = await db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM admin_notifications WHERE is_read = 0'
    );
    res.json({ unreadCount: row?.cnt ?? 0 });
  } catch (err) {
    console.error('Failed to get unread count:', err);
    res.status(500).json({ error: '获取未读数失败' });
  }
});

/**
 * PATCH /api/admin/notifications/:id/read
 */
router.patch('/:id/read', requireAdmin, async (req, res) => {
  try {
    const db = getDatabaseClient();
    const id = req.params.id as string;
    await db.execute(
      'UPDATE admin_notifications SET is_read = 1 WHERE id = ?',
      [parseInt(id, 10)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mark as read:', err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

/**
 * POST /api/admin/notifications/read-all
 */
router.post('/read-all', requireAdmin, async (_req, res) => {
  try {
    const db = getDatabaseClient();
    await db.execute('UPDATE admin_notifications SET is_read = 1');
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mark all as read:', err);
    res.status(500).json({ error: '标记全部已读失败' });
  }
});

/**
 * DELETE /api/admin/notifications/:id
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDatabaseClient();
    const id = req.params.id as string;
    await db.execute(
      'DELETE FROM admin_notifications WHERE id = ?',
      [parseInt(id, 10)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete notification:', err);
    res.status(500).json({ error: '删除通知失败' });
  }
});

/**
 * DELETE /api/admin/notifications
 */
router.delete('/', requireAdmin, async (_req, res) => {
  try {
    const db = getDatabaseClient();
    await db.execute('DELETE FROM admin_notifications');
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to clear notifications:', err);
    res.status(500).json({ error: '清空通知失败' });
  }
});

export default router;
