import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import {
  canAccessHighQuality,
  canAccessVipContent,
  canFullPreview,
  FREE_PREVIEW_DURATION_SECONDS,
  getDailyDownloadCount,
  getDailyDownloadLimit,
  getDailyPreviewTrackCount,
  getDailyPreviewTrackLimit,
  getEffectiveVipLevel,
  getUserVipLevel
} from '../middleware/vip.js';
import { createDirectUploadTarget, deleteStoredAsset, saveBuffer, supportsDirectUpload } from '../services/storage.js';
import { serializeBeatAssets, serializeUserAssets } from '../utils/assets.js';

const router = Router();

type UserProfileRow = {
  id: number;
  username: string;
  email: string;
  role: string;
  vip_level: string;
  vip_expire_at: string | null;
  avatar_url: string | null;
  created_at: string;
};

type UserAvatarRow = {
  avatar_url: string | null;
};

async function getUserProfileById(userId: number): Promise<UserProfileRow | undefined> {
  const database = getDatabaseClient();
  const user = await database.queryOne<UserProfileRow>(
    'SELECT id, username, email, role, vip_level, vip_expire_at, avatar_url, created_at FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return undefined;
  return {
    ...user,
    vip_level: getEffectiveVipLevel(user),
    vip_expire_at: user.role === 'admin' ? null : user.vip_expire_at
  };
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase() : '';
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('头像仅支持 jpg、png、webp 格式'));
    }
  }
});

// POST /api/user/avatar/upload-target
router.post('/user/avatar/upload-target', requireAuth, (req: AuthRequest, res) => {
  if (!supportsDirectUpload()) {
    return res.json({ direct_upload: false });
  }

  const { file } = req.body as { file?: { name?: string; type?: string } };
  if (!file?.name) {
    return res.status(400).json({ error: '请提供头像文件信息' });
  }

  const target = createDirectUploadTarget('avatar', {
    originalName: file.name,
    contentType: file.type || 'image/jpeg'
  });

  res.json({
    direct_upload: true,
    target
  });
});

// GET /api/user/uploads — 当前用户上传的伴奏
router.get('/user/uploads', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const offset = (page - 1) * limit;

  const total = (await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM beats WHERE uploaded_by = ?',
    [userId]
  ))?.count ?? 0;
  const beats = await database.queryMany(
    'SELECT * FROM beats WHERE uploaded_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, limit, offset]
  );

  res.json({ beats: beats.map((beat) => serializeBeatAssets(beat as any)), total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/user/downloads — 当前用户下载记录
router.get('/user/downloads', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const offset = (page - 1) * limit;

  const total = (await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM downloads WHERE user_id = ?',
    [userId]
  ))?.count ?? 0;
  const downloads = await database.queryMany(`
    SELECT d.id, d.created_at as downloaded_at, b.*
    FROM downloads d
    INNER JOIN beats b ON b.id = d.beat_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);

  res.json({ downloads: downloads.map((item) => serializeBeatAssets(item as any)), total, page, totalPages: Math.ceil(total / limit) });
});

// PUT /api/user/profile — 修改个人信息
router.put('/user/profile', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: '用户名和邮箱不能为空' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名需要3-20个字符' });
  }

  const existing = await database.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
    [username, email, userId]
  );
  if (existing) {
    return res.status(400).json({ error: '用户名或邮箱已被使用' });
  }

  await database.execute('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, userId]);
  const user = await getUserProfileById(userId);
  res.json({ message: '更新成功', user: serializeUserAssets(user as UserProfileRow) });
});

// POST /api/user/avatar — 上传头像
router.post('/user/avatar', requireAuth, avatarUpload.single('avatar'), async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  if (!req.file) {
    return res.status(400).json({ error: '请选择头像文件' });
  }

  const userId = req.user!.id;
  const currentUser = await database.queryOne<UserAvatarRow>('SELECT avatar_url FROM users WHERE id = ?', [userId]);

  await deleteStoredAsset('avatar', currentUser?.avatar_url);
  const avatarAsset = await saveBuffer('avatar', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });

  await database.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarAsset.storedValue, userId]);
  const user = await getUserProfileById(userId);

  res.json({
    message: '头像上传成功',
    user: serializeUserAssets(user as UserProfileRow)
  });
});

// POST /api/user/avatar/direct — 直传 OSS 后写入头像
router.post('/user/avatar/direct', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const { avatar_url } = req.body as { avatar_url?: string };
  if (!avatar_url) {
    return res.status(400).json({ error: '缺少头像地址' });
  }

  const userId = req.user!.id;
  const currentUser = await database.queryOne<UserAvatarRow>('SELECT avatar_url FROM users WHERE id = ?', [userId]);

  await deleteStoredAsset('avatar', currentUser?.avatar_url);
  await database.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar_url, userId]);
  const user = await getUserProfileById(userId);

  res.json({
    message: '头像上传成功',
    user: serializeUserAssets(user as UserProfileRow)
  });
});

// DELETE /api/user/avatar — 删除头像并恢复默认
router.delete('/user/avatar', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const currentUser = await database.queryOne<UserAvatarRow>('SELECT avatar_url FROM users WHERE id = ?', [userId]);

  await deleteStoredAsset('avatar', currentUser?.avatar_url);

  await database.execute('UPDATE users SET avatar_url = NULL WHERE id = ?', [userId]);
  const user = await getUserProfileById(userId);

  res.json({
    message: '已恢复默认头像',
    user: serializeUserAssets(user as UserProfileRow)
  });
});

// PUT /api/user/password — 修改密码
router.put('/user/password', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请填写旧密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
  }

  const user = await database.queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: '旧密码错误' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await database.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  res.json({ message: '密码修改成功' });
});

// GET /api/user/vip-status
router.get('/user/vip-status', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const user = await database.queryOne<{ role: string | null; vip_level: string | null; vip_expire_at: string | null }>(
    'SELECT role, vip_level, vip_expire_at FROM users WHERE id = ?',
    [req.user!.id]
  );
  const vipLevel = await getUserVipLevel(req);
  const dailyDownloadCount = await getDailyDownloadCount(req.user!.id);
  const dailyDownloadLimit = getDailyDownloadLimit(vipLevel);
  const dailyPreviewCount = await getDailyPreviewTrackCount(req.user!.id);
  const dailyPreviewLimit = getDailyPreviewTrackLimit(vipLevel);

  res.json({
    vip_level: vipLevel,
    vip_expire_at: user?.role === 'admin' ? null : (user?.vip_expire_at || null),
    daily_downloads: dailyDownloadCount,
    daily_limit: dailyDownloadLimit,
    remaining_downloads: dailyDownloadLimit !== null ? Math.max(0, dailyDownloadLimit - dailyDownloadCount) : null,
    daily_preview_tracks: dailyPreviewCount,
    preview_daily_limit: dailyPreviewLimit,
    remaining_preview_tracks: dailyPreviewLimit !== null ? Math.max(0, dailyPreviewLimit - dailyPreviewCount) : null,
    // 已登录用户无论 VIP 等级都可以完整试听
    preview_duration_seconds: null,
    can_access_vip_content: canAccessVipContent(vipLevel),
    can_access_high_quality: canAccessHighQuality(vipLevel),
    can_full_preview: true
  });
});

// GET /api/users/search — 搜索全站用户（支持用户名/邮箱/手机号）
router.get('/users/search', requireAuth, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

  if (!q) {
    return res.json({ users: [] });
  }

  // 拉黑过滤：排除我拉黑的人，以及拉黑我的人
  const blockedMe = await db.queryMany<{ blocker_id: number }>(
    'SELECT blocker_id FROM user_blocks WHERE blocked_id = ?',
    [req.user!.id]
  );
  const iBlocked = await db.queryMany<{ blocked_id: number }>(
    'SELECT blocked_id FROM user_blocks WHERE blocker_id = ?',
    [req.user!.id]
  );
  const excludeIds = [req.user!.id, ...blockedMe.map(b => b.blocker_id), ...iBlocked.map(b => b.blocked_id)];
  const excludePlaceholders = excludeIds.map(() => '?').join(',');

  // 先探测 users 表是否包含 phone / email 字段，缺失时跳过对应匹配条件，避免 1054 报错
  const cols = await db.queryMany<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const colSet = new Set(cols.map(c => c.COLUMN_NAME));
  const hasEmail = colSet.has('email');
  const hasPhone = colSet.has('phone');
  const hasAvatarUrl = colSet.has('avatar_url');
  const avatarCol = hasAvatarUrl ? 'avatar_url' : (colSet.has('avatar') ? 'avatar' : 'NULL');

  const conditions: string[] = ['username LIKE ?'];
  const params: any[] = [`%${q}%`];
  if (hasEmail) {
    conditions.push('email LIKE ?');
    params.push(`%${q}%`);
  }
  if (hasPhone) {
    conditions.push('phone = ?', 'phone LIKE ?');
    params.push(q, `%${q}%`);
  }

  const users = await db.queryMany<{ id: number; username: string; email: string; phone: string | null; avatar_url: string }>(
    `SELECT id, username, email, phone, ${avatarCol} AS avatar_url
       FROM users
      WHERE id NOT IN (${excludePlaceholders})
        AND (${conditions.join(' OR ')})
      ORDER BY
        CASE WHEN username = ? THEN 0
             WHEN username LIKE ? THEN 1
             ELSE 2 END,
        id ASC
      LIMIT ?`,
    [...excludeIds, ...params, q, `${q}%`, limit]
  );

  res.json({ users: users.map(u => ({
    id: u.id,
    username: u.username || u.email || u.phone || `用户${u.id}`,
    avatar_url: u.avatar_url || null,
  })) });
});

export default router;
