import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { decryptIdCard, maskIdCard, hashIdCard } from '../utils/idcard-cipher.js';
import { createSystemNotification } from './system-notifications-helper.js';

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

// ─── GET /api/admin/beatmaker-applications/stats ──────────────
// 概览统计
router.get('/stats', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();

  const beatmakerCount = await database.queryOne<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM beatmaker_profiles'
  );
  const pendingCount = await database.queryOne<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM beatmaker_applications WHERE status = 'pending'"
  );
  const beatsCount = await database.queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM beats b INNER JOIN users u ON u.id = b.uploaded_by WHERE u.is_beatmaker = 1`
  );
  const downloadsSum = await database.queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(b.download_count), 0) AS total FROM beats b INNER JOIN users u ON u.id = b.uploaded_by WHERE u.is_beatmaker = 1`
  );

  return res.json({
    total_beatmakers: beatmakerCount?.cnt ?? 0,
    pending_applications: pendingCount?.cnt ?? 0,
    total_beats: beatsCount?.cnt ?? 0,
    total_downloads: downloadsSum?.total ?? 0,
  });
});

// ─── GET /api/admin/beatmaker-applications/beatmakers ──────────
// 认证 Beatmaker 列表（搜索 / 排序 / 分页）
router.get('/beatmakers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const search = ((req.query.search as string) || '').trim();
  const sort = (req.query.sort as string) || 'certified_at';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const where = ['1=1'];
  const params: unknown[] = [];
  if (search) {
    where.push('(u.username LIKE ? OR p.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const sortColumn = sort === 'total_beats' ? 'beat_count' : sort === 'total_downloads' ? 'dl_sum' : 'p.certified_at';
  const sortDir = sort === 'total_beats' || sort === 'total_downloads' ? 'DESC' : 'DESC';

  const total = await database.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM beatmaker_profiles p
       INNER JOIN users u ON u.id = p.user_id
      WHERE ${where.join(' AND ')}`,
    params
  );

  const rows = await database.queryMany<{
    user_id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    portfolio_url: string | null;
    certified_at: string;
    beat_count: number;
    dl_sum: number;
    like_sum: number;
  }>(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url, p.bio,
            p.portfolio_url, p.certified_at, p.total_likes AS like_sum,
            (SELECT COUNT(*) FROM beats b WHERE b.uploaded_by = p.user_id) AS beat_count,
            (SELECT COALESCE(SUM(b.download_count), 0) FROM beats b WHERE b.uploaded_by = p.user_id) AS dl_sum
       FROM beatmaker_profiles p
       INNER JOIN users u ON u.id = p.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return res.json({
    total: total?.total ?? 0,
    page,
    limit,
    items: rows,
  });
});

// ─── POST /api/admin/beatmaker-applications/beatmakers/:userId/revoke ─
// 撤销 Beatmaker 认证
router.post('/beatmakers/:userId/revoke', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const userId = parseInt(req.params.userId as string, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户 ID' });

  const user = await database.queryOne<{ is_beatmaker: number }>(
    'SELECT is_beatmaker FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!user.is_beatmaker) return res.status(409).json({ error: '该用户未认证 Beatmaker' });

  // 1. 撤销 users.is_beatmaker
  await database.execute(
    'UPDATE users SET is_beatmaker = 0, beatmaker_certified_at = NULL WHERE id = ?',
    [userId]
  );
  // 2. 删除 beatmaker_profiles 记录
  await database.execute(
    'DELETE FROM beatmaker_profiles WHERE user_id = ?',
    [userId]
  );

  return res.json({ message: '已撤销认证' });
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
    sample_audio_url: string | null;
    bio: string | null;
    id_card_no_enc: string | null;
  }>(
    'SELECT id, user_id, real_name, status, portfolio_url, sample_work_url, sample_audio_url, bio, id_card_no_enc FROM beatmaker_applications WHERE id = ?',
    [id]
  );
  if (!app) return res.status(404).json({ error: '申请不存在' });
  if (app.status === 'approved') return res.status(409).json({ error: '该申请已通过' });
  if (app.status === 'rejected') return res.status(409).json({ error: '该申请已被驳回，请先重新提交' });

  // ─── 账号级 1:1：用户必须不是已认证状态（防止管理员绕过申请入口直接 approve 导致不一致）
  const userState = await database.queryOne<{ is_beatmaker: number; username: string }>(
    'SELECT is_beatmaker, username FROM users WHERE id = ?',
    [app.user_id]
  );
  if (!userState) return res.status(404).json({ error: '申请人账号不存在' });
  if (userState.is_beatmaker === 1) {
    return res.status(409).json({
      error: '该账号已是 Beatmaker，一个账号只能拥有一个认证身份',
      code: 'ACCOUNT_ALREADY_BEATMAKER'
    });
  }

  // ─── 身份证级 1:1：如果申请包含已加密身份证号，需要反算 hash，并校验
  // 1) 其他账号的 applications 已存在 approved（并发下另一个管理员刚通过了）
  // 2) 其他账号的 beatmaker_profiles 已经绑定此证件号
  let idCardHash: string | null = null;
  if (app.id_card_no_enc) {
    try {
      const plain = decryptIdCard(app.id_card_no_enc);
      idCardHash = hashIdCard(plain);
      // 回写 hash（兼容历史申请数据，后续 approve 才能走唯一索引）
      await database.execute('UPDATE beatmaker_applications SET id_card_hash = ? WHERE id = ?', [idCardHash, id]);
    } catch (_) {
      idCardHash = null;
    }
  }

  if (idCardHash) {
    const conflictApproved = await database.queryOne<{ user_id: number }>(
      "SELECT user_id FROM beatmaker_applications WHERE status = 'approved' AND id_card_hash = ? LIMIT 1",
      [idCardHash]
    );
    if (conflictApproved && conflictApproved.user_id !== app.user_id) {
      return res.status(409).json({
        error: '该身份证号已通过另一个账号的 Beatmaker 认证，一个身份证号只能认证一个账号',
        code: 'IDCARD_ALREADY_APPROVED'
      });
    }
    const conflictProfile = await database.queryOne<{ user_id: number }>(
      'SELECT user_id FROM beatmaker_profiles WHERE id_card_hash = ? LIMIT 1',
      [idCardHash]
    );
    if (conflictProfile && conflictProfile.user_id !== app.user_id) {
      return res.status(409).json({
        error: '该身份证号已绑定到其他 Beatmaker 账号，一个身份证号只能认证一个账号',
        code: 'IDCARD_ALREADY_BOUND'
      });
    }
  }

  const now = new Date();
  try {
    // 1. 标记 users.is_beatmaker = 1
    await database.execute(
      'UPDATE users SET is_beatmaker = 1, beatmaker_certified_at = ? WHERE id = ?',
      [now, app.user_id]
    );
    // 2. 写入 beatmaker_profiles（主键 user_id 保证 1:1；UNIQUE id_card_hash 保证证件唯一）
    await database.execute(
      `INSERT INTO beatmaker_profiles
         (user_id, display_name, avatar_url, bio, portfolio_url, sample_audio_url, certified_at, id_card_hash)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         bio = VALUES(bio),
         portfolio_url = VALUES(portfolio_url),
         sample_audio_url = VALUES(sample_audio_url),
         certified_at = VALUES(certified_at),
         id_card_hash = VALUES(id_card_hash)`,
      [app.user_id, app.real_name, app.bio, app.portfolio_url, app.sample_audio_url ?? app.sample_work_url, now, idCardHash]
    );
    // 3. 更新申请状态
    await database.execute(
      `UPDATE beatmaker_applications
          SET status = 'approved', reviewed_by = ?, reviewed_at = ?
        WHERE id = ?`,
      [reviewerId, now, id]
    );
  } catch (error: any) {
    // 唯一索引命中（主键 user_id 冲突 / id_card_hash 冲突）→ 翻译成 409
    if (error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062) {
      const keyName = String(error?.sqlMessage || '');
      if (keyName.includes('id_card_hash')) {
        // 回滚 users.is_beatmaker（避免写了一半）
        await database.execute(
          'UPDATE users SET is_beatmaker = 0, beatmaker_certified_at = NULL WHERE id = ?',
          [app.user_id]
        ).catch(() => {});
        return res.status(409).json({
          error: '该身份证号已绑定到其他 Beatmaker 账号，一个身份证号只能认证一个账号',
          code: 'IDCARD_ALREADY_BOUND'
        });
      }
      if (keyName.includes('approved_id_card')) {
        return res.status(409).json({
          error: '该身份证号刚刚已被另一个账号完成认证，一个身份证号只能认证一个账号',
          code: 'IDCARD_ALREADY_APPROVED'
        });
      }
      // PRIMARY 冲突：profile 已经存在，意味着并发下其他 approve 先成功
      await database.execute(
        'UPDATE users SET is_beatmaker = 0, beatmaker_certified_at = NULL WHERE id = ?',
        [app.user_id]
      ).catch(() => {});
      return res.status(409).json({
        error: '该账号已完成 Beatmaker 认证，无需重复审核',
        code: 'ACCOUNT_ALREADY_BEATMAKER'
      });
    }
    throw error;
  }

  // 4. 发送系统通知给申请人
  await createSystemNotification(
    app.user_id,
    'beatmaker_approved',
    '🎉 Beatmaker 认证已通过',
    `恭喜！你已完成账号与 Beatmaker 身份的一对一绑定（账号：${userState.username}），现在可以上传原创伴奏、建立制作人主页、展示作品集了。`,
    reviewerId,
    'beatmaker_application',
    id
  ).catch(() => {});

  // 5. 记录管理员通知
  const { createAdminNotification } = await import('./admin-notifications-helper.js');
  createAdminNotification({
    type: 'beatmaker_approved',
    title: 'Beatmaker 认证通过',
    content: `申请 ID ${id} 已通过审核（账号与身份证一对一绑定校验已通过）`,
    data: { applicationId: id, userId: app.user_id, reviewerId }
  }).catch(() => {});

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

  const app = await database.queryOne<{ id: number; user_id: number; status: string }>(
    'SELECT id, user_id, status FROM beatmaker_applications WHERE id = ?',
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

  // 发送系统通知给申请人
  await createSystemNotification(
    app.user_id,
    'beatmaker_rejected',
    '😞 Beatmaker 认证未通过',
    `很遗憾，你的认证申请未通过审核。原因：${reject_reason.trim()}。修改资料后可重新申请。`,
    reviewerId,
    'beatmaker_application',
    id
  ).catch(() => {});

  // 记录管理员通知
  const { createAdminNotification } = await import('./admin-notifications-helper.js');
  createAdminNotification({
    type: 'beatmaker_rejected',
    title: 'Beatmaker 认证驳回',
    content: `申请 ID ${id} 已被驳回`,
    data: { applicationId: id, userId: app.user_id, reviewerId, rejectReason: reject_reason.trim() }
  }).catch(() => {});

  return res.json({ message: '已拒绝' });
});

export default router;
