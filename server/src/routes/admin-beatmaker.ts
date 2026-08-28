import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { decryptIdCard, maskIdCard } from '../utils/idcard-cipher.js';

const router = Router();

// ─── GET /api/admin/beatmaker-applications ────────────────────
// 列表（按状态过滤）
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const status = (req.query.status as string) || '';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const where = ['1=1'];
  const params: unknown[] = [];
  if (['pending', 'approved', 'rejected'].includes(status)) {
    where.push('a.status = ?');
    params.push(status);
  }

  const total = await database.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM beatmaker_applications a WHERE ${where.join(' AND ')}`,
    params
  );

  const rows = await database.queryMany<{
    id: number;
    user_id: number;
    username: string;
    email: string;
    real_name: string;
    id_card_no_enc: string;
    portfolio_url: string;
    sample_work_url: string;
    bio: string;
    status: 'pending' | 'approved' | 'rejected';
    reject_reason: string | null;
    reviewed_by: number | null;
    reviewer_name: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>(
    `SELECT a.id, a.user_id, u.username, u.email, a.real_name, a.id_card_no_enc,
            a.portfolio_url, a.sample_work_url, a.bio, a.status,
            a.reject_reason, a.reviewed_by, ru.username AS reviewer_name,
            a.reviewed_at, a.created_at
       FROM beatmaker_applications a
       INNER JOIN users u ON u.id = a.user_id
       LEFT JOIN users ru ON ru.id = a.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY (a.status = 'pending') DESC, a.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 脱敏身份证号返回（解密后展示前 4 + 后 4）
  const items = rows.map((r) => {
    let masked = '****';
    try {
      if (r.id_card_no_enc) {
        const plain = decryptIdCard(r.id_card_no_enc);
        masked = maskIdCard(plain);
      }
    } catch {
      masked = '****';
    }
    return {
      ...r,
      id_card_no_enc: undefined,
      id_card_masked: masked
    };
  });

  return res.json({
    total: total?.total ?? 0,
    page,
    limit,
    items
  });
});

// ─── GET /api/admin/beatmaker-applications/:id ─────────────────
// 单条详情（含加密身份证号，仅用于审计）
router.get('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const id = parseInt(req.params.id as string, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: '无效的 id' });

  const row = await database.queryOne(
    `SELECT a.*, u.username, u.email, ru.username AS reviewer_name
       FROM beatmaker_applications a
       INNER JOIN users u ON u.id = a.user_id
       LEFT JOIN users ru ON ru.id = a.reviewed_by
      WHERE a.id = ?`,
    [id]
  );
  if (!row) return res.status(404).json({ error: '申请不存在' });
  return res.json({ application: row });
});

// ─── POST /api/admin/beatmaker-applications/:id/approve ────────
// 通过 → 写入 users.is_beatmaker=1 + beatmaker_profiles
router.post('/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const id = parseInt(req.params.id as string, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: '无效的 id' });
  const reviewerId = req.user!.id;

  const app = await database.queryOne<{
    id: number;
    user_id: number;
    real_name: string;
    status: string;
    portfolio_url: string | null;
    sample_work_url: string | null;
    bio: string | null;
  }>(
    'SELECT id, user_id, real_name, status, portfolio_url, sample_work_url, bio FROM beatmaker_applications WHERE id = ?',
    [id]
  );
  if (!app) return res.status(404).json({ error: '申请不存在' });
  if (app.status === 'approved') return res.status(409).json({ error: '该申请已通过' });

  const now = new Date();
  // 1. 标记 users.is_beatmaker = 1
  await database.execute(
    'UPDATE users SET is_beatmaker = 1, beatmaker_certified_at = ? WHERE id = ?',
    [now, app.user_id]
  );
  // 2. 写入 beatmaker_profiles
  await database.execute(
    `INSERT INTO beatmaker_profiles
       (user_id, display_name, avatar_url, bio, portfolio_url, sample_audio_url, certified_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       bio = VALUES(bio),
       portfolio_url = VALUES(portfolio_url),
       sample_audio_url = VALUES(sample_audio_url),
       certified_at = VALUES(certified_at)`,
    [app.user_id, app.real_name, app.bio, app.portfolio_url, app.sample_work_url, now]
  );
  // 3. 更新申请状态
  await database.execute(
    `UPDATE beatmaker_applications
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?
      WHERE id = ?`,
    [reviewerId, now, id]
  );

  return res.json({ message: '已通过认证' });
});

// ─── POST /api/admin/beatmaker-applications/:id/reject ─────────
// 拒绝
router.post('/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const id = parseInt(req.params.id as string, 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: '无效的 id' });
  const reviewerId = req.user!.id;
  const { reject_reason } = req.body ?? {};
  if (!reject_reason || typeof reject_reason !== 'string' || reject_reason.trim().length < 5) {
    return res.status(400).json({ error: '请填写拒绝原因（至少 5 字）' });
  }

  const app = await database.queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM beatmaker_applications WHERE id = ?',
    [id]
  );
  if (!app) return res.status(404).json({ error: '申请不存在' });
  if (app.status !== 'pending') return res.status(409).json({ error: '只能拒绝待审核的申请' });

  const now = new Date();
  await database.execute(
    `UPDATE beatmaker_applications
        SET status = 'rejected',
            reject_reason = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            last_rejected_at = ?
      WHERE id = ?`,
    [reject_reason.trim(), reviewerId, now, now, id]
  );

  return res.json({ message: '已拒绝' });
});

export default router;
