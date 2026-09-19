import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';
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

// PUT /api/user/profile — 修改个人信息（username / email / nickname / bio）
router.put('/user/profile', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const { username, email, nickname, bio } = req.body as { username?: string; email?: string; nickname?: string; bio?: string };

  if (!username || !email) {
    return res.status(400).json({ error: '用户名和邮箱不能为空' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名需要3-20个字符' });
  }
  // 用户名仅允许字母/数字/下划线/连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: '用户名仅支持字母、数字、下划线和连字符' });
  }
  // 邮箱长度限制
  if (email.length > 254) {
    return res.status(400).json({ error: '邮箱长度不能超过 254 字符' });
  }

  // 昵称校验（可选字段）
  if (nickname !== undefined && nickname !== null && nickname !== '') {
    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ error: '昵称需要2-20个字符' });
    }
    // 禁止 HTML / 控制字符，避免任何潜在的 v-html 误用造成 XSS
    if (/[<>]|[\x00-\x1F\x7F]/.test(nickname)) {
      return res.status(400).json({ error: '昵称不允许包含 < > 或控制字符' });
    }
  }
  const finalNickname = (nickname && nickname.trim()) || null;

  // bio 校验（可选字段，最多 500 字）
  if (bio !== undefined && bio !== null && bio !== '') {
    if (bio.length > 500) {
      return res.status(400).json({ error: '个人简介不能超过 500 字符' });
    }
    if (/[<>]/.test(bio)) {
      return res.status(400).json({ error: '个人简介不允许包含 < >' });
    }
  }
  const finalBio = (bio !== undefined) ? (bio || null) : undefined;

  // 唯一性冲突检查（用户名 / 邮箱 / 昵称三者均不能与他人重复）
  const existing = await database.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE (username = ? OR email = ? OR (nickname = ? AND nickname IS NOT NULL)) AND id != ?',
    [username, email, finalNickname, userId]
  );
  if (existing) {
    return res.status(400).json({ error: '用户名、邮箱或昵称已被使用' });
  }

  // 生成 nickname_pinyin（简易：取昵称全字符小写去空格，给前端做扩展用）
  const nicknamePinyin = finalNickname ? finalNickname.toLowerCase().replace(/\s+/g, '') : null;

  // bio 为 undefined 时不更新该字段（保持原值）
  if (finalBio !== undefined) {
    await database.execute(
      'UPDATE users SET username = ?, email = ?, nickname = ?, nickname_pinyin = ?, bio = ? WHERE id = ?',
      [username, email, finalNickname, nicknamePinyin, finalBio, userId]
    );
  } else {
    await database.execute(
      'UPDATE users SET username = ?, email = ?, nickname = ?, nickname_pinyin = ? WHERE id = ?',
      [username, email, finalNickname, nicknamePinyin, userId]
    );
  }
  const user = await getUserProfileById(userId);
  res.json({
    message: '更新成功',
    user: {
      ...serializeUserAssets(user as UserProfileRow),
      nickname: finalNickname,
      bio: finalBio !== undefined ? finalBio : (user as any)?.bio,
    }
  });
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

// ─── 个人中心 - 完整个人资料（聚合 stats + IP 归属地） ────────────────────────
//
// GET /api/user/profile/full?user_id=X&ip_view=login|register
//   - 默认看自己（user_id 可省）
//   - 看别人时，IP 归属地对他人隐藏（前端按 is_self 判断）
//   - 返回 4 项关键统计：关注 / 粉丝 / 获赞（总）/ 收藏（总）
router.get('/user/profile/full', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const forumDb = getForumDatabaseClient();

  const targetId = req.query.user_id ? parseInt(req.query.user_id as string) : req.user!.id;
  const viewerId = req.user!.id;
  const isSelf = targetId === viewerId;

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  // 基础资料（主库）
  const user = await database.queryOne<{
    id: number;
    username: string;
    nickname: string | null;
    bio: string | null;
    email: string;
    role: string;
    vip_level: string;
    vip_expire_at: string | null;
    avatar_url: string | null;
    created_at: string;
    is_beatmaker: number;
  }>(
    `SELECT id, username, nickname, bio, email, role, vip_level, vip_expire_at,
            avatar_url, created_at, is_beatmaker
       FROM users WHERE id = ?`,
    [targetId]
  );
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 隐私：邮箱对外人隐藏
  const publicEmail = isSelf ? user.email : null;

  // 关注 / 粉丝数：优先从 forum_user_profiles 取（已有计数），fallback COUNT(*)
  const profile = await forumDb.queryOne<{
    follower_count: number;
    following_count: number;
    post_count: number;
  }>(
    'SELECT follower_count, following_count, post_count FROM forum_user_profiles WHERE user_id = ?',
    [targetId]
  );

  const [followersRow, followingsRow] = await Promise.all([
    forumDb.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM forum_follows WHERE following_id = ?', [targetId]),
    forumDb.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM forum_follows WHERE follower_id = ?', [targetId]),
  ]);

  // 获赞（总）：beats 评论点赞（暂未维护 likes 表，统计 forum_comment_likes 中针对该用户的评论）+ 帖子点赞 + 帖子评论点赞
  //   - 帖子获赞：直接读 forum_posts.like_count 累计（COUNT(*) SUM）
  //   - 评论获赞：读 forum_comments.like_count SUM
  const [postLikesRow, commentLikesRow] = await Promise.all([
    forumDb.queryOne<{ total: number | null }>(
      'SELECT COALESCE(SUM(like_count), 0) AS total FROM forum_posts WHERE user_id = ?',
      [targetId]
    ),
    forumDb.queryOne<{ total: number | null }>(
      'SELECT COALESCE(SUM(like_count), 0) AS total FROM forum_comments WHERE user_id = ?',
      [targetId]
    ),
  ]);

  // 收藏（总）：beats 收藏 + 帖子收藏
  const [beatFavRow, postFavRow] = await Promise.all([
    database.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?', [targetId]),
    forumDb.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM forum_favorites WHERE user_id = ?', [targetId]),
  ]);

  // 我是否关注了他 / 他是否关注了我
  const [followingMe, followMe] = await Promise.all([
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [targetId, viewerId]
    ),
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [viewerId, targetId]
    ),
  ]);

  const stats = {
    following_count: Number(profile?.following_count ?? followingsRow?.c ?? 0),
    follower_count:  Number(profile?.follower_count  ?? followersRow?.c  ?? 0),
    post_count:      Number(profile?.post_count      ?? 0),
    likes_received:  Number(postLikesRow?.total ?? 0) + Number(commentLikesRow?.total ?? 0),
    favorites_count: Number(beatFavRow?.c ?? 0) + Number(postFavRow?.c ?? 0),
    beats_uploaded:  Number((await database.queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM beats WHERE uploaded_by = ?', [targetId]
    ))?.c ?? 0),
  };

  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname || user.username,  // 昵称缺省回退 username
    bio: user.bio,
    email: publicEmail,
    avatar_url: user.avatar_url || null,
    role: user.role,
    vip_level: getEffectiveVipLevel(user),
    vip_expire_at: user.role === 'admin' ? null : user.vip_expire_at,
    is_beatmaker: user.is_beatmaker ?? 0,
    created_at: user.created_at,
    is_self: isSelf,
    // 关注关系（相对当前 viewer）
    is_followed_by_me: !!followMe,
    is_following_me: !!followingMe,
    // 4 个关键 stats
    stats,
  });
});

// ─── 用户搜索升级：双模式（rapbeats 账号 / 昵称模糊） ──────────────────────
//
// GET /api/users/search?q=&type=rapbeats|nickname&page=1&limit=20
//   - type=rapbeats：精确 / 前缀匹配 username（RAP BEATS 账号搜索）
//   - type=nickname：LIKE %q% 模糊匹配 nickname
//   - 默认 rapbeats（兼容旧调用）

export default router;
