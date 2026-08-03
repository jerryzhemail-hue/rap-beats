import { Router, Response } from 'express';
import { requireAuth, optionalAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { toDateTimeString } from '../utils/timezone.js';

const router = Router();

// POST /api/feedback — 提交反馈（任意用户）
router.post('/feedback', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const { type, title, content, contact } = req.body;

  if (!type || !['bug', 'suggestion', 'other'].includes(type)) {
    return res.status(400).json({ error: '请选择反馈类型' });
  }
  if (!title || title.trim().length === 0 || title.trim().length > 100) {
    return res.status(400).json({ error: '标题不能为空且最多100字' });
  }
  if (!content || content.trim().length < 10 || content.trim().length > 1000) {
    return res.status(400).json({ error: '详细描述至少10字最多1000字' });
  }

  const userId = (req as any).user?.id ?? null;
  const contactVal = contact?.trim() || null;

  await database.execute(
    `INSERT INTO feedback (user_id, type, title, content, contact) VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title.trim(), content.trim(), contactVal]
  );

  res.json({ message: '反馈已提交，感谢你的意见！' });
});

// GET /api/feedback — 我的反馈列表（需登录）
router.get('/feedback', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const userId = (req as any).user!.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const offset = (page - 1) * limit;

  const [rows, countRow] = await Promise.all([
    database.queryMany(
      `SELECT id, type, title, content, contact, status, reply, created_at, updated_at
       FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    ),
    database.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM feedback WHERE user_id = ?',
      [userId]
    )
  ]);

  res.json({
    feedback: rows,
    total: countRow?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countRow?.count ?? 0) / limit)
  });
});

// ── Admin 路由 ───────────────────────────────────────────────────────────────

// GET /api/admin/feedback — 反馈列表（管理员）
router.get('/admin/feedback', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 15));
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;

  let where = '1=1';
  const params: any[] = [];
  if (status && ['pending', 'replied', 'closed'].includes(status)) {
    where += ' AND f.status = ?';
    params.push(status);
  }
  if (search && search.trim()) {
    where += ' AND (f.title LIKE ? OR f.content LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const countKey = params.length;
  const [rows, totalRow] = await Promise.all([
    database.queryMany(
      `SELECT f.id, f.type, f.title, f.content, f.contact, f.status, f.reply,
              f.created_at, f.updated_at,
              u.username, u.email
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       WHERE ${where}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    database.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM feedback f WHERE ${where}`,
      params
    )
  ]);

  res.json({
    feedback: rows,
    total: totalRow?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((totalRow?.count ?? 0) / limit)
  });
});

// GET /api/admin/feedback/new — 轮询新反馈（返回 since 之后新增的，不含分页）
// 用于后台实时监控，前端每 5 秒调用一次
router.get('/admin/feedback/new', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const since = req.query.since as string | undefined;

  let rows: any[] = [];
  if (since) {
    rows = await database.queryMany(
      `SELECT f.id, f.type, f.title, f.content, f.contact, f.status, f.reply,
              f.created_at, f.updated_at,
              u.username, u.email
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       WHERE f.created_at > ?
       ORDER BY f.created_at ASC`,
      [since]
    );
  }

  res.json({
    items: rows,
    // 返回当前服务端时间，下次轮询带上这个值作为 since
    serverTime: new Date().toISOString(),
    count: rows.length
  });
});

// PUT /api/admin/feedback/:id/reply — 回复反馈
router.put('/admin/feedback/:id/reply', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { reply, status } = req.body;

  if (!reply || reply.trim().length === 0) {
    return res.status(400).json({ error: '回复内容不能为空' });
  }
  if (status && !['pending', 'replied', 'closed'].includes(status)) {
    return res.status(400).json({ error: '无效的状态' });
  }

  const newStatus = status || 'replied';
  await database.execute(
    `UPDATE feedback SET reply = ?, status = ?, updated_at = ? WHERE id = ?`,
    [reply.trim(), newStatus, toDateTimeString(new Date()), id]
  );

  res.json({ message: '回复成功' });
});

// DELETE /api/admin/feedback/:id — 删除反馈
router.delete('/admin/feedback/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await database.execute('DELETE FROM feedback WHERE id = ?', [id]);
  res.json({ message: '删除成功' });
});

export default router;
