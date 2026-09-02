import { Router, Response } from 'express';
import { getDatabaseClient } from '../database/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

interface SystemNotificationRow {
  id: number;
  type: string;
  title: string;
  content: string | null;
  is_read: number;
  actor_id: number | null;
  target_type: string | null;
  target_id: number | null;
  created_at: string;
  actor_username: string | null;
}

// GET /api/system-notifications — 获取当前用户的系统通知列表
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;

  const notifications = await db.queryMany<SystemNotificationRow>(
    `SELECT sn.*, u.username AS actor_username
       FROM system_notifications sn
       LEFT JOIN users u ON u.id = sn.actor_id
      WHERE sn.user_id = ?
      ORDER BY sn.created_at DESC
      LIMIT 50`,
    [userId]
  );

  return res.json({ notifications });
});

// GET /api/system-notifications/unread-count — 未读数
router.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;

  const row = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM system_notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  return res.json({ unread_count: row?.count ?? 0 });
});

// PUT /api/system-notifications/:id/read — 标记单条已读
router.put('/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: '无效的 id' });

  await db.execute(
    'UPDATE system_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return res.json({ message: '已标记为已读' });
});

// PUT /api/system-notifications/read-all — 全部已读
router.put('/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;

  await db.execute(
    'UPDATE system_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  return res.json({ message: '已全部标记为已读' });
});

// DELETE /api/system-notifications/:id — 删除单条
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: '无效的 id' });

  await db.execute(
    'DELETE FROM system_notifications WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return res.json({ message: '已删除' });
});

// DELETE /api/system-notifications/clear — 清空所有
router.delete('/clear', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const userId = req.user!.id;

  await db.execute(
    'DELETE FROM system_notifications WHERE user_id = ?',
    [userId]
  );

  return res.json({ message: '已清空' });
});

export default router;
