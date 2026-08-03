import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { updateRapperSortOrderByName } from '../services/rapperScore.js';

const router = Router();

// POST /api/favorites/:beatId — 收藏
router.post('/favorites/:beatId', requireAuth, rateLimitMiddleware('favorites', 30), async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { beatId } = req.params;
  const userId = req.user!.id;

  // 检查 beat 是否存在，获取 rapper 信息
  const beat = await database.queryOne<{ id: number; rapper: string | null }>('SELECT id, rapper FROM beats WHERE id = ?', [beatId]);
  if (!beat) return res.status(404).json({ error: '伴奏不存在' });

  try {
    await database.execute('INSERT INTO favorites (user_id, beat_id) VALUES (?, ?)', [userId, beatId]);
    
    // 自动更新关联 rapper 的权重
    if (beat.rapper) {
      updateRapperSortOrderByName(beat.rapper).catch(err => {
        console.error('Failed to update rapper weight after favorite:', err);
      });
    }
    
    res.status(201).json({ message: '收藏成功' });
  } catch (e: any) {
    const message = String(e?.message || '');
    if (message.includes('UNIQUE constraint') || message.includes('Duplicate entry')) {
      res.json({ message: '已收藏' });
    } else {
      res.status(500).json({ error: '操作失败' });
    }
  }
});

// DELETE /api/favorites/:beatId — 取消收藏
router.delete('/favorites/:beatId', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { beatId } = req.params;
  const userId = req.user!.id;

  // 获取 beat 的 rapper 信息（取消收藏前）
  const beat = await database.queryOne<{ id: number; rapper: string | null }>('SELECT id, rapper FROM beats WHERE id = ?', [beatId]);

  await database.execute('DELETE FROM favorites WHERE user_id = ? AND beat_id = ?', [userId, beatId]);
  
  // 自动更新关联 rapper 的权重
  if (beat?.rapper) {
    updateRapperSortOrderByName(beat.rapper).catch(err => {
      console.error('Failed to update rapper weight after unfavorite:', err);
    });
  }
  
  res.json({ message: '已取消收藏' });
});

// GET /api/favorites — 获取当前用户收藏列表
router.get('/favorites', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const offset = (page - 1) * limit;

  const total = (await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
    [userId]
  ))?.count ?? 0;
  const favorites = await database.queryMany(`
    SELECT b.* FROM beats b
    INNER JOIN favorites f ON f.beat_id = b.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);

  res.json({
    beats: favorites,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

export default router;
