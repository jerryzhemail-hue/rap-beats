import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';

const router = Router();

// GET /api/beats/:beatId/comments — 获取评论列表（公开）
router.get('/beats/:beatId/comments', async (req, res) => {
  const database = getDatabaseClient();
  const { beatId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const total = (await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM comments WHERE beat_id = ?',
    [beatId]
  ))?.count ?? 0;

  const comments = await database.queryMany(`
    SELECT c.id, c.content, c.created_at, c.user_id, u.username
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.beat_id = ?
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `, [beatId, limit, offset]);

  res.json({
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// POST /api/beats/:beatId/comments — 发表评论（需登录）
router.post('/beats/:beatId/comments', requireAuth, rateLimitMiddleware('comments', 20), async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { beatId } = req.params;
  const { content } = req.body;
  const userId = req.user!.id;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: '评论内容不能超过500字' });
  }

  // 检查 beat 是否存在
  const beat = await database.queryOne<{ id: number }>('SELECT id FROM beats WHERE id = ?', [beatId]);
  if (!beat) return res.status(404).json({ error: '伴奏不存在' });

  const result = await database.execute('INSERT INTO comments (user_id, beat_id, content) VALUES (?, ?, ?)', [
    userId,
    beatId,
    content.trim()
  ]);

  if (!result.insertId) {
    return res.status(500).json({ error: '评论发布失败，请稍后重试' });
  }

  const comment = await database.queryOne(`
    SELECT c.id, c.content, c.created_at, c.user_id, u.username
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `, [result.insertId]);

  res.status(201).json(comment);
});

// DELETE /api/comments/:id — 删除评论（自己的或admin）
router.delete('/comments/:id', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const userId = req.user!.id;

  const comment = await database.queryOne<{ id: number; user_id: number }>('SELECT id, user_id FROM comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: '评论不存在' });

  // 查询用户角色
  const user = await database.queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId]);

  // 只能删除自己的评论，或者 admin 可以删除任何评论
  if (comment.user_id !== userId && user?.role !== 'admin') {
    return res.status(403).json({ error: '无权删除此评论' });
  }

  await database.execute('DELETE FROM comments WHERE id = ?', [id]);
  res.json({ message: '删除成功' });
});

export default router;
