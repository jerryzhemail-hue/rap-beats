import express, { Request, Response } from 'express';
import { getDatabaseClient } from '../database/index.js';
import multer from 'multer';
import { saveBuffer } from '../services/storage.js';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';
import { RAPPER_WEIGHTS, recalculateAllRapperWeights } from '../services/rapperScore.js';

const router = express.Router();

export interface Rapper {
  id: number;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

// 头像上传中间件
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    if (allowed.includes(ext) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，请上传 jpg/png/webp/gif'));
    }
  }
});

// GET /api/rappers - 获取 rapper 列表（公开接口，兼容前端）
router.get('/', async (_req: Request, res: Response) => {
  const db = getDatabaseClient();

  // 返回 rapper 列表和每个 rapper 的伴奏数量
  // 伴奏数量从 beat_producers 表统计（支持合作作品的正确统计）
  const rows = await db.queryMany<{ id: number; name: string; avatar_url: string | null; bio: string | null; sort_order: number; count: number }>(
    `SELECT r.id, r.name, r.avatar_url, r.bio, r.sort_order, COUNT(bp.beat_id) as count
     FROM rappers r
     LEFT JOIN beat_producers bp ON bp.rapper_id = r.id
     GROUP BY r.id, r.name, r.avatar_url, r.bio, r.sort_order
     ORDER BY r.sort_order ASC, count DESC, r.name ASC`
  );

  res.json({ rappers: rows });
});

// GET /api/rappers/simple - 获取简单列表（用于下拉选择）
router.get('/simple', async (_req: Request, res: Response) => {
  const db = getDatabaseClient();
  const rows = await db.queryMany<{ name: string }>(
    'SELECT name FROM rappers ORDER BY sort_order ASC, name ASC'
  );
  res.json({ rappers: rows.map(r => r.name) });
});

// POST /api/admin/rappers/upload-avatar - 上传 rapper 头像
router.post('/upload-avatar', requireAdmin, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();

  if (!req.file) {
    res.status(400).json({ error: '请上传头像图片' });
    return;
  }

  try {
    const result = await saveBuffer('avatar', {
      buffer: req.file.buffer,
      originalName: req.file.originalname
    });

    res.json({
      message: '头像上传成功',
      avatar_url: result.publicUrl,
      stored_value: result.storedValue
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '上传失败' });
  }
});

// GET /api/rappers/export - 导出 CSV（必须在 /:id 之前）
router.get('/export', async (_req: Request, res: Response) => {
  const db = getDatabaseClient();

  const rows = await db.queryMany<{ id: number; name: string; avatar_url: string | null; bio: string | null; sort_order: number }>(
    'SELECT id, name, avatar_url, bio, sort_order FROM rappers ORDER BY sort_order ASC, name ASC'
  );

  const headers = ['Name', 'avatar_url', 'bio', 'sort_order'];
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const values = [
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${(row.avatar_url || '').replace(/"/g, '""')}"`,
      `"${(row.bio || '').replace(/"/g, '""')}"`,
      row.sort_order || 0
    ];
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rappers.csv"');
  res.send(csv);
});

// POST /api/rappers/import - 批量导入 CSV（必须在 /:id 之前）
router.post('/import', requireAdmin, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const { rappers: importRappers } = req.body as { rappers: Array<{ name: string; avatar_url?: string; bio?: string; sort_order?: number }> };

  if (!Array.isArray(importRappers) || importRappers.length === 0) {
    res.status(400).json({ error: 'Invalid data format' });
    return;
  }

  const results = {
    success: 0,
    skipped: 0,
    errors: [] as string[]
  };

  for (let i = 0; i < importRappers.length; i++) {
    const rapper = importRappers[i];

    if (!rapper.name || typeof rapper.name !== 'string' || rapper.name.trim() === '') {
      results.errors.push(`第 ${i + 1} 行：名称不能为空`);
      continue;
    }

    const trimmedName = rapper.name.trim();

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM rappers WHERE name = ?',
      [trimmedName]
    );

    if (existing) {
      results.skipped++;
      continue;
    }

    try {
      await db.execute(
        'INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, ?, ?, ?)',
        [trimmedName, rapper.avatar_url || null, rapper.bio || null, rapper.sort_order || 0]
      );
      results.success++;
    } catch (err: any) {
      results.errors.push(`第 ${i + 1} 行（${trimmedName}）：${err.message || '导入失败'}`);
    }
  }

  res.json(results);
});

// POST /api/admin/rappers/recalculate - 手动触发权重重新计算（管理员专用）
router.post('/recalculate', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await recalculateAllRapperWeights();
    res.json({
      success: true,
      message: `已重新计算 ${result.updated} 个 rapper 的权重`,
      weights: RAPPER_WEIGHTS
    });
  } catch (err: any) {
    console.error('Failed to recalculate rapper weights:', err);
    res.status(500).json({ error: '权重计算失败' });
  }
});

// GET /api/rappers/stats - 获取所有 rapper 的详细统计数据（必须在 /:id 之前）
router.get('/stats', async (_req: Request, res: Response) => {
  const db = getDatabaseClient();

  const stats = await db.queryMany<{
    id: number;
    name: string;
    beat_count: number;
    play_count: number;
    download_count: number;
    favorite_count: number;
    score: number;
    sort_order: number;
  }>(`
    SELECT
      r.id,
      r.name,
      COUNT(DISTINCT bp.beat_id) as beat_count,
      COALESCE(SUM((SELECT COUNT(*) FROM play_events pe WHERE pe.beat_id = b.id)), 0) as play_count,
      COALESCE(SUM(b.download_count), 0) as download_count,
      COUNT(DISTINCT f.id) as favorite_count,
      (
        COUNT(DISTINCT bp.beat_id) * ? +
        COALESCE(SUM((SELECT COUNT(*) FROM play_events pe WHERE pe.beat_id = b.id)), 0) * ? +
        COALESCE(SUM(b.download_count), 0) * ? +
        COUNT(DISTINCT f.id) * ?
      ) as score,
      r.sort_order
    FROM rappers r
    LEFT JOIN beat_producers bp ON bp.rapper_id = r.id
    LEFT JOIN beats b ON b.id = bp.beat_id
    LEFT JOIN favorites f ON f.beat_id = b.id
    GROUP BY r.id, r.name, r.sort_order
    ORDER BY score DESC, r.name ASC
  `, [RAPPER_WEIGHTS.beat_count, RAPPER_WEIGHTS.play_count, RAPPER_WEIGHTS.download_count, RAPPER_WEIGHTS.favorite_count]);

  res.json({ stats, weights: RAPPER_WEIGHTS });
});

// GET /api/rappers/:id - 获取单个 rapper（必须在 /export, /stats 之后，避免被捕获）
router.get('/:id', async (req: Request, res: Response) => {
  const db = getDatabaseClient();
  const { id } = req.params;

  const rapper = await db.queryOne<Rapper>(
    'SELECT * FROM rappers WHERE id = ?',
    [id]
  );

  if (!rapper) {
    res.status(404).json({ error: 'Rapper not found' });
    return;
  }

  const countResult = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM beat_producers WHERE rapper_id = ?',
    [id]
  );

  res.json({ rapper: { ...rapper, count: countResult?.count || 0 } });
});

// POST /api/rappers - 创建 rapper（需要管理员权限）
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const { name, avatar_url, bio, sort_order } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const trimmedName = name.trim();

  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM rappers WHERE name = ?',
    [trimmedName]
  );

  if (existing) {
    res.status(409).json({ error: 'Rapper already exists' });
    return;
  }

  try {
    const result = await db.execute(
      'INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, ?, ?, ?)',
      [trimmedName, avatar_url || null, bio || null, sort_order || 0]
    );
    const insertId = (result as any).insertId;
    const newRapper = await db.queryOne<Rapper>(
      'SELECT * FROM rappers WHERE id = ?',
      [insertId]
    );
    res.status(201).json({ rapper: { ...newRapper, count: 0 } });
  } catch (error: any) {
    // 并发下 SELECT-then-INSERT 之间另一请求先插入：UNIQUE(name) 报 ER_DUP_ENTRY，转成 409
    if (error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062) {
      return res.status(409).json({ error: `制作人「${trimmedName}」已存在，请勿重复创建` });
    }
    throw error;
  }
});

// PUT /api/rappers/:id - 更新 rapper
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const { id } = req.params;
  const { name, avatar_url, bio, sort_order } = req.body;

  const existing = await db.queryOne<Rapper>(
    'SELECT * FROM rappers WHERE id = ?',
    [id]
  );
  if (!existing) {
    res.status(404).json({ error: 'Rapper not found' });
    return;
  }

  const trimmedName = typeof name === 'string' && name.trim() !== '' ? name.trim() : existing.name;
  try {
    await db.execute(
      'UPDATE rappers SET name = ?, avatar_url = COALESCE(?, avatar_url), bio = COALESCE(?, bio), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [trimmedName, avatar_url ?? null, bio ?? null, sort_order ?? null, id]
    );
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062) {
      return res.status(409).json({ error: `制作人「${trimmedName}」已存在，无法重命名为该名称` });
    }
    throw error;
  }

  const updated = await db.queryOne<Rapper>('SELECT * FROM rappers WHERE id = ?', [id]);
  const count = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM beat_producers WHERE rapper_id = ?',
    [id]
  );
  res.json({ rapper: { ...updated, count: count?.count ?? 0 } });
});

// DELETE /api/rappers/:id - 删除 rapper
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const db = getDatabaseClient();
  const { id } = req.params;

  const existing = await db.queryOne<Rapper>(
    'SELECT * FROM rappers WHERE id = ?',
    [id]
  );

  if (!existing) {
    res.status(404).json({ error: 'Rapper not found' });
    return;
  }

  // 删除 rapper
  await db.execute('DELETE FROM rappers WHERE id = ?', [id]);

  res.json({ success: true, message: 'Rapper deleted' });
});

export default router;
