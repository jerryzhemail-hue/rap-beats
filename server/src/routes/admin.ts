import { Router, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';
import { deleteStoredAsset } from '../services/storage.js';
import { invalidateVipCache } from '../middleware/vip.js';
import { detectBpmFromUrl, detectBpmFromFile } from '../services/bpmDetector.js';
import { isRemoteStorageEnabled } from '../services/storage.js';
import { toDateTimeString } from '../utils/timezone.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GET /api/admin/stats — 数据看板统计
router.get('/admin/stats', requireAdmin, async (_req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const totalUsers = (await database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users'))?.count ?? 0;
  const totalBeats = (await database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM beats'))?.count ?? 0;
  const totalDownloads = (await database.queryOne<{ total: number | null }>('SELECT SUM(download_count) as total FROM beats'))?.total ?? 0;
  const totalComments = (await database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM comments'))?.count ?? 0;

  const recentUsers = await database.queryMany('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5');
  const recentBeats = await database.queryMany('SELECT id, title, producer, genre, bpm, created_at FROM beats ORDER BY created_at DESC LIMIT 5');

  res.json({
    stats: { totalUsers, totalBeats, totalDownloads, totalComments },
    recentUsers,
    recentBeats
  });
});

// GET /api/admin/hot-data — 热门数据看板
router.get('/admin/hot-data', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const days = Math.max(1, Math.min(30, parseInt(req.query.days as string) || 7));
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 10));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceText = toDateTimeString(since);

  const overview = {
    recentDownloads: (await database.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM downloads WHERE created_at >= ?',
      [sinceText]
    ))?.count ?? 0,
    recentFavorites: (await database.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM favorites WHERE created_at >= ?',
      [sinceText]
    ))?.count ?? 0,
    recentPlays: (await database.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM play_events WHERE created_at >= ?',
      [sinceText]
    ))?.count ?? 0
  };

  const beats = await database.queryMany(`
    SELECT
      b.id,
      b.title,
      b.producer,
      b.genre,
      b.bpm,
      b.download_count,
      b.created_at,
      COALESCE(rd.recent_downloads, 0) AS recent_downloads,
      COALESCE(ft.favorite_count, 0) AS favorite_count,
      COALESCE(fr.recent_favorites, 0) AS recent_favorites,
      COALESCE(pt.play_count, 0) AS play_count,
      COALESCE(pr.recent_plays, 0) AS recent_plays,
      (
        COALESCE(rd.recent_downloads, 0) * 5 +
        COALESCE(b.download_count, 0) * 1 +
        COALESCE(fr.recent_favorites, 0) * 3 +
        COALESCE(ft.favorite_count, 0) * 1 +
        COALESCE(pr.recent_plays, 0) * 1 +
        COALESCE(pt.play_count, 0) * 0.2
      ) AS hot_score
    FROM beats b
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS recent_downloads
      FROM downloads
      WHERE created_at >= ?
      GROUP BY beat_id
    ) rd ON rd.beat_id = b.id
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS favorite_count
      FROM favorites
      GROUP BY beat_id
    ) ft ON ft.beat_id = b.id
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS recent_favorites
      FROM favorites
      WHERE created_at >= ?
      GROUP BY beat_id
    ) fr ON fr.beat_id = b.id
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS play_count
      FROM play_events
      GROUP BY beat_id
    ) pt ON pt.beat_id = b.id
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS recent_plays
      FROM play_events
      WHERE created_at >= ?
      GROUP BY beat_id
    ) pr ON pr.beat_id = b.id
    ORDER BY hot_score DESC, recent_downloads DESC, recent_favorites DESC, recent_plays DESC, b.created_at DESC
    LIMIT ?
  `, [sinceText, sinceText, sinceText, limit]);

  res.json({ days, overview, beats });
});

// GET /api/admin/users — 用户列表
router.get('/admin/users', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string || '';
  const offset = (page - 1) * limit;

  let where = '';
  let params: any[] = [];
  if (search) {
    where = 'WHERE username LIKE ? OR email LIKE ?';
    params = [`%${search}%`, `%${search}%`];
  }

  const total = (await database.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM users ${where}`,
    params
  ))?.count ?? 0;
  const users = await database.queryMany(
    `SELECT id, username, email, role,
            CASE WHEN role = 'admin' THEN 'ultimate' ELSE COALESCE(vip_level, 'free') END AS vip_level,
            CASE WHEN role = 'admin' THEN NULL ELSE vip_expire_at END AS vip_expire_at,
            created_at
       FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
});

// PUT /api/admin/users/:id/role — 修改用户角色
router.put('/admin/users/:id/role', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: '角色只能是 admin 或 user' });
  }

  const user = await database.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  // 不能修改自己的角色
  if (parseInt(id as string) === req.user!.id) {
    return res.status(400).json({ error: '不能修改自己的角色' });
  }

  await database.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  res.json({ message: '角色修改成功' });
});

// PUT /api/admin/users/:id/vip — 设置用户VIP状态
router.put('/admin/users/:id/vip', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const { vip_level, days } = req.body;
  const userIdRaw = Array.isArray(id) ? id[0] : id;
  const userId = parseInt(userIdRaw, 10);

  if (!['free', 'basic', 'premium', 'ultimate'].includes(vip_level)) {
    return res.status(400).json({ error: '无效的会员等级' });
  }

  const targetUser = await database.queryOne<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = ?', [userIdRaw]);
  if (!targetUser) return res.status(404).json({ error: '用户不存在' });

  if (targetUser.role === 'admin') {
    await database.execute("UPDATE users SET vip_level = 'ultimate', vip_expire_at = NULL WHERE id = ?", [userIdRaw]);
    invalidateVipCache(userId);
    return res.json({ message: '管理员账号默认拥有永久至尊会员' });
  }

  if (vip_level === 'free') {
    await database.execute("UPDATE users SET vip_level = 'free', vip_expire_at = NULL WHERE id = ?", [userIdRaw]);
    invalidateVipCache(userId);
  } else {
    // 叠加时长：如果当前会员未过期，从现有到期时间叠加
    const existing = await database.queryOne<{ vip_expire_at: string | null }>(
      'SELECT vip_expire_at FROM users WHERE id = ?',
      [userIdRaw]
    );
    const now = new Date();
    let expireBase: Date;
    if (existing?.vip_expire_at && new Date(existing.vip_expire_at) > now) {
      expireBase = new Date(existing.vip_expire_at);
    } else {
      expireBase = now;
    }
    expireBase.setDate(expireBase.getDate() + (days || 30));
    await database.execute('UPDATE users SET vip_level = ?, vip_expire_at = ? WHERE id = ?', [
      vip_level,
      toDateTimeString(expireBase),
      userIdRaw
    ]);
    invalidateVipCache(userId);
  }

  const levelNames: Record<string, string> = { free: '免费', basic: '基础', premium: '高级', ultimate: '至尊' };
  res.json({ message: `已设为${levelNames[vip_level]}会员${vip_level !== 'free' ? `（${days || 30}天）` : ''}` });
});

// DELETE /api/admin/users/:id — 删除用户
router.delete('/admin/users/:id', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { id } = req.params;

  // 不能删除自己
  if (parseInt(id as string) === req.user!.id) {
    return res.status(400).json({ error: '不能删除自己' });
  }

  const user = await database.queryOne<{ id: number; avatar_url: string | null }>(
    'SELECT id, avatar_url FROM users WHERE id = ?',
    [id]
  );
  if (!user) return res.status(404).json({ error: '用户不存在' });

  // 删除用户相关数据
  const forumDb = getForumDatabaseClient();
  await database.transaction(async (tx) => {
    await tx.execute('DELETE FROM comments WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM favorites WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM downloads WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM play_events WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM preview_history WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM feedback WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM orders WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM beat_license_agreements WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM users WHERE id = ?', [id]);
  });
  // 清理论坛库孤儿数据
  await forumDb.execute('DELETE FROM forum_posts WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_comments WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_likes WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_favorites WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_sign_ins WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_user_points WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_point_transactions WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_lottery_records WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_point_download_permissions WHERE user_id = ?', [id]);
  await forumDb.execute('DELETE FROM forum_comment_likes WHERE user_id = ?', [id]);
  await deleteStoredAsset('avatar', user.avatar_url);

  res.json({ message: '用户已删除' });
});

// POST /api/admin/maintenance/clear-test-users — 清空除 admin 用户外的所有账号
router.post('/admin/maintenance/clear-test-users', requireAdmin, async (_req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const forumDb = getForumDatabaseClient();
  const adminUser = await database.queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'admin'");
  const userAssets = await database.queryMany<{ avatar_url: string | null }>(
    "SELECT avatar_url FROM users WHERE username <> 'admin' AND avatar_url IS NOT NULL"
  );

  if (!adminUser) {
    return res.status(400).json({ error: '未找到用户名为 admin 的管理员账号，无法执行清理' });
  }

  await database.transaction(async (tx) => {
    await tx.execute("DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM comments WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM downloads WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM play_events WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM preview_history WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM feedback WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM beat_license_agreements WHERE user_id IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("UPDATE beats SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM users WHERE username <> 'admin')");
    await tx.execute("DELETE FROM users WHERE username <> 'admin'");
  });

  // 清理论坛库孤儿数据
  await forumDb.execute("DELETE FROM forum_posts WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_comments WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_likes WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_favorites WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_sign_ins WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_user_points WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_point_transactions WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_lottery_records WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_point_download_permissions WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");
  await forumDb.execute("DELETE FROM forum_comment_likes WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'admin')");

  for (const userAsset of userAssets) {
    await deleteStoredAsset('avatar', userAsset.avatar_url);
  }

  const remainingUsers = (await database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users'))?.count ?? 0;
  res.json({ message: '已清空除 admin 外的所有账号', remainingUsers });
});

// POST /api/admin/maintenance/clear-demo-beats — 清空全部伴奏数据及关联文件
router.post('/admin/maintenance/clear-demo-beats', requireAdmin, async (_req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const beats = await database.queryMany<{
    id: number;
    file_path: string;
    cover_image: string | null;
  }>('SELECT id, file_path, cover_image FROM beats');

  await database.transaction(async (tx) => {
    await tx.execute('DELETE FROM favorites WHERE beat_id IN (SELECT id FROM beats)');
    await tx.execute('DELETE FROM comments WHERE beat_id IN (SELECT id FROM beats)');
    await tx.execute('DELETE FROM downloads WHERE beat_id IN (SELECT id FROM beats)');
    await tx.execute('DELETE FROM play_events WHERE beat_id IN (SELECT id FROM beats)');
    await tx.execute('DELETE FROM beats');
  });

  for (const beat of beats) {
    await deleteStoredAsset('audio', beat.file_path);
    await deleteStoredAsset('cover', beat.cover_image);
  }

  res.json({ message: '已清空全部伴奏数据', removedBeats: beats.length });
});

// POST /api/admin/beats/:id/detect-bpm — 对已有 beat 重新识别 BPM（admin 专用）
router.post('/admin/beats/:id/detect-bpm', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beat = await database.queryOne<{ id: number; title: string; file_path: string }>(
    'SELECT id, title, file_path FROM beats WHERE id = ?',
    [req.params.id]
  );

  if (!beat) {
    return res.status(404).json({ error: 'Beat not found' });
  }

  let result;
  if (isRemoteStorageEnabled()) {
    result = await detectBpmFromUrl(beat.file_path);
  } else {
    const localPath = path.resolve(__dirname, '../../storage/audio', beat.file_path);
    result = await detectBpmFromFile(localPath);
  }

  if (!result) {
    return res.status(422).json({
      error: 'BPM 识别失败，可能是音频文件损坏或格式不支持',
      code: 'BPM_DETECTION_FAILED'
    });
  }

  // 更新数据库中的 BPM、时长和调性
  await database.execute(
    'UPDATE beats SET bpm = ?, duration = ?, `key` = ? WHERE id = ?',
    [result.bpm, Math.round(result.duration_seconds), result.key || '', beat.id]
  );

  res.json({
    message: 'BPM 识别成功',
    beat_id: beat.id,
    bpm: result.bpm,
    confidence: result.confidence,
    beat_count: result.beat_count,
    duration_seconds: result.duration_seconds,
    key: result.key || null,
    key_confidence: result.key_confidence || null,
  });
});

// ─── 使用协议模板管理 ─────────────────────────────────────────────────────────

// GET /api/admin/license-templates — 获取所有协议模板列表
router.get('/admin/license-templates', requireAdmin, async (_req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const templates = await database.queryMany(
    'SELECT id, version, content, is_active, created_at, updated_at FROM beat_license_templates ORDER BY id DESC'
  );
  res.json({ templates });
});

// PUT /api/admin/license-templates/:id — 更新协议模板
router.put('/admin/license-templates/:id', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { version, content, is_active } = req.body as {
    version?: string;
    content?: string;
    is_active?: number;
  };

  const template = await database.queryOne<{ id: number }>(
    'SELECT id FROM beat_license_templates WHERE id = ?',
    [req.params.id]
  );
  if (!template) {
    res.status(404).json({ error: '模板不存在' });
    return;
  }

  if (is_active === 1) {
    await database.execute('UPDATE beat_license_templates SET is_active = 0');
  }

  await database.execute(
    'UPDATE beat_license_templates SET version = COALESCE(?, version), content = COALESCE(?, content), is_active = COALESCE(?, is_active), updated_at = NOW() WHERE id = ?',
    [version ?? null, content ?? null, is_active ?? null, req.params.id]
  );

  const updated = await database.queryOne(
    'SELECT id, version, content, is_active, created_at, updated_at FROM beat_license_templates WHERE id = ?',
    [req.params.id]
  );
  res.json({ template: updated });
});

// POST /api/admin/license-templates — 新建协议模板
router.post('/admin/license-templates', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { version, content, is_active } = req.body as {
    version?: string;
    content?: string;
    is_active?: number;
  };

  if (is_active === 1) {
    await database.execute('UPDATE beat_license_templates SET is_active = 0');
  }

  await database.execute(
    'INSERT INTO beat_license_templates (version, content, is_active) VALUES (?, ?, ?)',
    [version ?? '1.0', content ?? '', is_active ?? 0]
  );

  const template = await database.queryOne(
    'SELECT id, version, content, is_active, created_at, updated_at FROM beat_license_templates WHERE id = LAST_INSERT_ID()'
  );
  res.status(201).json({ template });
});

// DELETE /api/admin/license-templates/:id — 删除协议模板
router.delete('/admin/license-templates/:id', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const template = await database.queryOne<{ id: number }>(
    'SELECT id FROM beat_license_templates WHERE id = ?',
    [req.params.id]
  );
  if (!template) {
    res.status(404).json({ error: '模板不存在' });
    return;
  }

  await database.execute('DELETE FROM beat_license_templates WHERE id = ?', [req.params.id]);
  res.json({ message: '删除成功' });
});

// ─── 协议同意记录查询 ─────────────────────────────────────────────────────────

// GET /api/admin/license-agreements — 查询协议同意记录（支持按 beat / user 筛选）
router.get('/admin/license-agreements', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const beatId = req.query.beat_id ? parseInt(req.query.beat_id as string) : null;
  const userId = req.query.user_id ? parseInt(req.query.user_id as string) : null;
  const username = (req.query.username as string | undefined)?.trim();
  const beatTitle = (req.query.beat_title as string | undefined)?.trim();

  let whereClause = '1=1';
  const params: (string | number)[] = [];

  if (beatId) {
    whereClause += ' AND a.beat_id = ?';
    params.push(beatId);
  }
  if (userId) {
    whereClause += ' AND a.user_id = ?';
    params.push(userId);
  }
  if (username) {
    whereClause += ' AND u.username LIKE ?';
    params.push(`%${username}%`);
  }
  if (beatTitle) {
    whereClause += ' AND b.title LIKE ?';
    params.push(`%${beatTitle}%`);
  }

  const countRow = await database.queryOne<{ total: number }>(
    `SELECT COUNT(*) as total FROM beat_license_agreements a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN beats b ON b.id = a.beat_id
     WHERE ${whereClause}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = await database.queryMany(
    `SELECT a.id, a.user_id, a.beat_id, a.agreed_at,
            u.username, u.email,
            b.title as beat_title, b.producer
     FROM beat_license_agreements a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN beats b ON b.id = a.beat_id
     WHERE ${whereClause}
     ORDER BY a.agreed_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    records: rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/admin/license-agreements/export — 导出协议同意记录（CSV）
router.get('/admin/license-agreements/export', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const beatId = req.query.beat_id ? parseInt(req.query.beat_id as string) : null;
  const username = (req.query.username as string | undefined)?.trim();
  const beatTitle = (req.query.beat_title as string | undefined)?.trim();

  let whereClause = '1=1';
  const params: (string | number)[] = [];

  if (beatId) {
    whereClause += ' AND a.beat_id = ?';
    params.push(beatId);
  }
  if (username) {
    whereClause += ' AND u.username LIKE ?';
    params.push(`%${username}%`);
  }
  if (beatTitle) {
    whereClause += ' AND b.title LIKE ?';
    params.push(`%${beatTitle}%`);
  }

  const rows = await database.queryMany(
    `SELECT a.agreed_at, u.username, u.email, b.title as beat_title, b.producer
     FROM beat_license_agreements a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN beats b ON b.id = a.beat_id
     WHERE ${whereClause}
     ORDER BY a.agreed_at DESC`,
    params
  );

  const header = '\uFEFF同意时间,用户名,邮箱,伴奏标题,制作人';
  const lines = rows.map((r: any) =>
    [
      r.agreed_at ?? '',
      r.username ?? '',
      r.email ?? '',
      `"${(r.beat_title ?? '').replace(/"/g, '""')}"`,
      `"${(r.producer ?? '').replace(/"/g, '""')}"`
    ].join(',')
  );
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8-sig');
  res.setHeader('Content-Disposition', `attachment; filename="license-agreements-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
