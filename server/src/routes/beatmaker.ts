import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { requireBeatmaker } from '../middleware/beatmaker.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';
import { encryptIdCard, decryptIdCard, maskIdCard, hashIdCard } from '../utils/idcard-cipher.js';
import { saveBuffer } from '../services/storage.js';
import { serializeBeatAssets } from '../utils/assets.js';

const router = Router();

const ID_CARD_RE = /^\d{15}(\d{2}[0-9Xx])?$/;
const REJECT_REAPPLY_DAYS = 3;

// ─── POST /api/beatmaker/apply ───────────────────────────────
// 已登录用户提交 Beatmaker 认证申请
router.post('/apply', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const { real_name, id_card_no, portfolio_url, sample_work_url, bio, sample_audio_url } = req.body ?? {};

  if (!real_name || typeof real_name !== 'string' || real_name.trim().length < 2) {
    return res.status(400).json({ error: '请填写真实姓名（至少 2 个字符）' });
  }
  if (!id_card_no || typeof id_card_no !== 'string' || !ID_CARD_RE.test(id_card_no.trim())) {
    return res.status(400).json({ error: '请填写有效的身份证号（15 位或 18 位）' });
  }
  if (!portfolio_url || typeof portfolio_url !== 'string' || !/^https?:\/\//.test(portfolio_url.trim())) {
    return res.status(400).json({ error: '请填写作品集链接（http(s):// 开头）' });
  }
  if (!sample_work_url || typeof sample_work_url !== 'string' || !/^https?:\/\//.test(sample_work_url.trim())) {
    return res.status(400).json({ error: '请填写代表作链接（http(s):// 开头）' });
  }
  if (!bio || typeof bio !== 'string' || bio.trim().length < 20) {
    return res.status(400).json({ error: '请填写个人简介（至少 20 个字符）' });
  }

  // 身份证号哈希（用于 1:1 绑定校验）
  const idCardPlain = id_card_no.trim();
  const idCardHash = hashIdCard(idCardPlain);

  // ─── 绑定规则 1：账号级 1:1（同一账号只能有 1 个 Beatmaker 身份）────────
  const u = await database.queryOne<{ is_beatmaker: number }>(
    'SELECT is_beatmaker FROM users WHERE id = ?',
    [userId]
  );
  if (u?.is_beatmaker === 1) {
    return res.status(409).json({
      error: '你已经是认证 Beatmaker，一个账号只能拥有一个认证身份，无需重复申请',
      code: 'ACCOUNT_ALREADY_BEATMAKER'
    });
  }

  // 检查是否已有 pending 申请
  const pending = await database.queryOne<{ id: number }>(
    "SELECT id FROM beatmaker_applications WHERE user_id = ? AND status = 'pending' LIMIT 1",
    [userId]
  );
  if (pending) {
    return res.status(409).json({
      error: '你已有待审核的申请，请耐心等待',
      code: 'APPLICATION_PENDING',
      application_id: pending.id
    });
  }

  // ─── 绑定规则 2：身份证级 1:1（同一身份证号只能绑定一个账号） ────────
  // 已在 beatmaker_profiles 存在 → 该身份证号已被其他账号占用
  const profileBinding = await database.queryOne<{ user_id: number }>(
    'SELECT user_id FROM beatmaker_profiles WHERE id_card_hash = ? LIMIT 1',
    [idCardHash]
  );
  if (profileBinding && profileBinding.user_id !== userId) {
    return res.status(409).json({
      error: '该身份证号已绑定到其他 Beatmaker 账号，一个身份证号只能认证一个账号',
      code: 'IDCARD_ALREADY_BOUND'
    });
  }
  // 已在 applications 存在一条 approved（同身份证号但其他账号申请通过了）
  const approvedOther = await database.queryOne<{ user_id: number }>(
    "SELECT user_id FROM beatmaker_applications WHERE status = 'approved' AND id_card_hash = ? LIMIT 1",
    [idCardHash]
  );
  if (approvedOther && approvedOther.user_id !== userId) {
    return res.status(409).json({
      error: '该身份证号已通过另一个账号的 Beatmaker 认证，一个身份证号只能认证一个账号',
      code: 'IDCARD_ALREADY_APPROVED'
    });
  }

  // 被拒后 3 天冷却
  const rejected = await database.queryOne<{ last_rejected_at: string }>(
    "SELECT last_rejected_at FROM beatmaker_applications WHERE user_id = ? AND status = 'rejected' ORDER BY last_rejected_at DESC LIMIT 1",
    [userId]
  );
  if (rejected?.last_rejected_at) {
    const lastRejected = new Date(rejected.last_rejected_at).getTime();
    const cooldownEnd = lastRejected + REJECT_REAPPLY_DAYS * 86400 * 1000;
    if (Date.now() < cooldownEnd) {
      const leftDays = Math.ceil((cooldownEnd - Date.now()) / 86400000);
      return res.status(429).json({
        error: `申请被拒后需等待 ${REJECT_REAPPLY_DAYS} 天才能重新申请（还剩 ${leftDays} 天）`,
        code: 'COOLDOWN',
        cooldown_end: new Date(cooldownEnd).toISOString()
      });
    }
  }

  const encrypted = encryptIdCard(idCardPlain);
  try {
    const result = await database.execute(
      `INSERT INTO beatmaker_applications
         (user_id, real_name, id_card_no_enc, id_card_hash, portfolio_url, sample_work_url, sample_audio_url, bio, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, real_name.trim(), encrypted, idCardHash, portfolio_url.trim(), sample_work_url.trim(), sample_audio_url?.trim() || null, bio.trim()]
    );

    // 通知管理员：有新的 Beatmaker 申请
    const { createAdminNotification } = await import('./admin-notifications-helper.js');
    const userInfo = await database.queryOne<{ username: string }>(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );
    createAdminNotification({
      type: 'beatmaker_application',
      title: 'Beatmaker 新认证申请',
      content: `用户 ${userInfo?.username || userId} 提交了 Beatmaker 认证申请（账号与身份证一对一绑定校验已通过）`,
      data: { applicationId: result.insertId, userId, realName: real_name.trim() }
    }).catch(() => {});

    return res.json({ message: '申请已提交，请等待审核', application_id: result.insertId });
  } catch (error: any) {
    // pending_user_unique 生成列 + UNIQUE 会拦截同一用户第 2 条 pending 申请，
    // 把底层冲突翻译成与应用层分支一致的 409，避免竞态下出现 500。
    if (error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062) {
      // key 名称 hint：若含 approved_id_card 则为身份证重复绑定（并发下其他账号同时 approve）
      const keyName = String(error?.sqlMessage || '');
      if (keyName.includes('approved_id_card')) {
        return res.status(409).json({
          error: '该身份证号刚刚已被另一个账号完成认证，一个身份证号只能认证一个账号',
          code: 'IDCARD_ALREADY_APPROVED'
        });
      }
      const existing = await database.queryOne<{ id: number }>(
        "SELECT id FROM beatmaker_applications WHERE user_id = ? AND status = 'pending' LIMIT 1",
        [userId]
      );
      return res.status(409).json({
        error: '你已有待审核的申请，请耐心等待',
        code: 'APPLICATION_PENDING',
        application_id: existing?.id ?? undefined
      });
    }
    throw error;
  }
});

// ─── POST /api/beatmaker/upload-audio ────────────────────────
// 申请上传音频样本文件
const beatmakerAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'];
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    if (!allowed.includes(ext)) {
      cb(new Error('音频仅支持 MP3、WAV、AAC、M4A、FLAC、OGG 格式'));
    } else {
      cb(null, true);
    }
  }
});

router.post('/upload-audio', requireAuth, (req: Request, res: Response, next) => {
  beatmakerAudioUpload.single('audio')(req, res, (err: any) => {
    if (err) {
      if (err.message?.includes('仅支持') || err.message?.includes('format')) {
        return res.status(400).json({ error: err.message });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小不能超过 20MB' });
      }
      return res.status(500).json({ error: '文件上传失败' });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择音频文件' });
  }
  try {
    const asset = await saveBuffer('audio', {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    });
    res.json({
      message: '音频上传成功',
      audio_url: asset.publicUrl,
      stored_value: asset.storedValue,
      original_name: req.file.originalname,
      size: req.file.size,
    });
  } catch (err: any) {
    console.error('[beatmaker-upload-audio] failed:', err);
    res.status(500).json({ error: '音频上传失败，请重试' });
  }
});

// ─── GET /api/beatmaker/application/me ────────────────────────
// 当前用户的最新申请状态
router.get('/application/me', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const row = await database.queryOne<{
    id: number;
    real_name: string;
    id_card_no_enc: string;
    status: 'pending' | 'approved' | 'rejected';
    reject_reason: string | null;
    portfolio_url: string | null;
    sample_work_url: string | null;
    sample_audio_url: string | null;
    bio: string | null;
    created_at: string;
    reviewed_at: string | null;
    last_rejected_at: string | null;
  }>(
    `SELECT id, real_name, id_card_no_enc, status, reject_reason, portfolio_url, sample_work_url, sample_audio_url, bio,
            created_at, reviewed_at, last_rejected_at
       FROM beatmaker_applications
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1`,
    [req.user!.id]
  );
  if (!row) return res.json({ application: null });

  // 脱敏展示身份证号（解密后再脱敏）
  let idCardMasked: string | null = null;
  try {
    const plain = decryptIdCard(row.id_card_no_enc as unknown as string);
    idCardMasked = maskIdCard(plain);
  } catch {
    idCardMasked = '****';
  }

  // 脱敏展示身份证号
  return res.json({
    application: {
      id: row.id,
      real_name: row.real_name,
      id_card_masked: idCardMasked,
      status: row.status,
      reject_reason: row.reject_reason,
      portfolio_url: row.portfolio_url,
      sample_work_url: row.sample_work_url,
      sample_audio_url: row.sample_audio_url,
      bio: row.bio,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      last_rejected_at: row.last_rejected_at,
      cooldown_end: row.status === 'rejected' && row.last_rejected_at
        ? new Date(new Date(row.last_rejected_at).getTime() + REJECT_REAPPLY_DAYS * 86400000).toISOString()
        : null
    }
  });
});

// ─── GET /api/beatmaker/profile/:userId ───────────────────────
// 公开的 Beatmaker 档案（已登录时附带关注/粉丝统计）
router.get('/profile/:userId', optionalAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = parseInt(req.params.userId as string, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的 userId' });

  const row = await database.queryOne<{
    user_id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    portfolio_url: string | null;
    sample_audio_url: string | null;
    certified_at: string;
    total_beats: number;
    total_likes: number;
    total_downloads: number;
  }>(
    `SELECT u.id AS user_id, u.username, p.display_name, p.avatar_url, p.bio,
            p.portfolio_url, p.sample_audio_url, p.certified_at,
            p.total_beats, p.total_likes, p.total_downloads
       FROM users u
       INNER JOIN beatmaker_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.is_beatmaker = 1`,
    [userId]
  );
  if (!row) return res.status(404).json({ error: '该用户未通过 Beatmaker 认证' });

  // 查询关注/粉丝数 + 已登录用户是否关注
  // 注意：关注关系表 forum_follows 存在于 forum schema，需使用 getForumDatabaseClient
  let followerCount = 0, followingCount = 0, isFollowing = false, isFollowedBy = false;
  try {
    const socialDb = getForumDatabaseClient();
    const fc = await socialDb.queryOne<{ follower: number; following: number }>(
      `SELECT
         (SELECT COUNT(*) FROM forum_follows WHERE following_id = ?) AS follower,
         (SELECT COUNT(*) FROM forum_follows WHERE follower_id = ?) AS following`,
      [userId, userId]
    );
    if (fc) { followerCount = fc.follower; followingCount = fc.following; }
    if (req.user && req.user.id !== userId) {
      const st = await socialDb.queryOne<{ is_following: number; is_followed_by: number }>(
        `SELECT
           EXISTS(SELECT 1 FROM forum_follows WHERE follower_id = ? AND following_id = ?) AS is_following,
           EXISTS(SELECT 1 FROM forum_follows WHERE follower_id = ? AND following_id = ?) AS is_followed_by`,
        [req.user.id, userId, userId, req.user.id]
      );
      if (st) { isFollowing = !!st.is_following; isFollowedBy = !!st.is_followed_by; }
    }
  } catch { /* 社交数据缺失不影响基础档案 */ }

  return res.json({
    profile: {
      ...row,
      follower_count: followerCount,
      following_count: followingCount,
      is_following: isFollowing,
      is_followed_by: isFollowedBy,
      is_self: req.user?.id === userId
    }
  });
});

// ─── GET /api/beatmaker/profile/:userId/beats ─────────────────
// 某个 Beatmaker 的原创作品集列表
router.get('/profile/:userId/beats', optionalAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = parseInt(req.params.userId as string, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的 userId' });

  // 先确认是 Beatmaker
  const bm = await database.queryOne<{ user_id: number }>(
    'SELECT user_id FROM beatmaker_profiles WHERE user_id = ?',
    [userId]
  );
  if (!bm) return res.status(404).json({ error: '该用户未通过 Beatmaker 认证' });

  const page = Math.max(1, parseInt((req.query.page as string) || '1'));
  const limit = Math.max(1, Math.min(50, parseInt((req.query.limit as string) || '12')));
  const offset = (page - 1) * limit;

  const total = (await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM beats WHERE uploaded_by = ?',
    [userId]
  ))?.count ?? 0;

  const beatIds: number[] = [];
  const beats = await database.queryMany<any>(
    'SELECT * FROM beats WHERE uploaded_by = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    [userId, limit, offset]
  );
  beats.forEach((b: any) => beatIds.push(b.id));

  // 批量聚合 favorite_count
  const favCountMap = new Map<number, number>();
  if (beatIds.length > 0) {
    const placeholders = beatIds.map(() => '?').join(',');
    const favCounts = await database.queryMany<{ beat_id: number; cnt: number }>(
      `SELECT beat_id, COUNT(*) AS cnt FROM favorites WHERE beat_id IN (${placeholders}) GROUP BY beat_id`,
      beatIds
    );
    favCounts.forEach((r) => favCountMap.set(r.beat_id, r.cnt));
  }

  // 登录用户批量查询收藏状态
  let favoriteIds: Set<number> = new Set();
  if (req.user && beatIds.length > 0) {
    const placeholders = beatIds.map(() => '?').join(',');
    const favs = await database.queryMany<{ beat_id: number }>(
      `SELECT beat_id FROM favorites WHERE user_id = ? AND beat_id IN (${placeholders})`,
      [req.user.id, ...beatIds]
    );
    favoriteIds = new Set(favs.map((f) => f.beat_id));
  }

  return res.json({
    beats: beats.map((b: any) => serializeBeatAssets({
      ...b,
      favorite_count: favCountMap.get(b.id) ?? 0,
      is_favorited: favoriteIds.has(b.id)
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// ─── GET /api/beatmaker/list ─────────────────────────────────
// 公开的 Beatmaker 列表（首页推荐使用）
router.get('/list', async (_req: Request, res) => {
  const database = getDatabaseClient();
  const limit = Math.max(1, Math.min(50, parseInt((_req.query.limit as string) || '12') || 12));
  const rows = await database.queryMany<{
    user_id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    portfolio_url: string | null;
    certified_at: string;
    total_beats: number;
    total_likes: number;
    total_downloads: number;
  }>(
    `SELECT u.id AS user_id, u.username, p.display_name, p.avatar_url, p.bio,
            p.portfolio_url, p.certified_at,
            p.total_beats, p.total_likes, p.total_downloads
       FROM users u
       INNER JOIN beatmaker_profiles p ON p.user_id = u.id
      WHERE u.is_beatmaker = 1
      ORDER BY p.total_downloads DESC, p.total_beats DESC, p.certified_at DESC
      LIMIT ?`,
    [limit]
  );
  return res.json({ beatmakers: rows });
});

// ─── PUT /api/beatmaker/profile ───────────────────────────────
// Beatmaker 自己更新展示资料
router.put('/profile', requireAuth, requireBeatmaker, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const userId = req.user!.id;
  const { display_name, avatar_url, bio, portfolio_url, sample_audio_url } = req.body ?? {};

  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof display_name === 'string' && display_name.trim()) {
    if (display_name.trim().length < 2 || display_name.trim().length > 50) {
      return res.status(400).json({ error: '显示名称需 2-50 个字符' });
    }
    sets.push('display_name = ?');
    params.push(display_name.trim());
  }
  if (typeof avatar_url === 'string' || avatar_url === null) {
    sets.push('avatar_url = ?');
    params.push(avatar_url);
  }
  if (typeof bio === 'string') {
    if (bio.length > 500) return res.status(400).json({ error: '个人简介不能超过 500 字' });
    sets.push('bio = ?');
    params.push(bio);
  }
  if (typeof portfolio_url === 'string') {
    sets.push('portfolio_url = ?');
    params.push(portfolio_url.trim());
  }
  if (typeof sample_audio_url === 'string') {
    sets.push('sample_audio_url = ?');
    params.push(sample_audio_url.trim());
  }

  if (sets.length === 0) return res.json({ message: '无更新' });
  params.push(userId);
  await database.execute(
    `UPDATE beatmaker_profiles SET ${sets.join(', ')} WHERE user_id = ?`,
    params
  );
  return res.json({ message: '资料已更新' });
});

export default router;
