import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';
import { type Beat } from '../database/index.js';
import { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient } from '../database/client.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  FREE_PREVIEW_DURATION_SECONDS,
  FREE_PREVIEW_MAX_BYTES,
  ANONYMOUS_USER_ID,
  getDailyDownloadCount,
  getUserVipLevel,
  getDailyDownloadLimit,
  canAccessVipContent,
  canFullPreview,
  canDownload,
  type VipLevel
} from '../middleware/vip.js';
import {
  createDirectUploadTarget,
  deleteStoredAsset,
  getSignedAssetUrl,
  isRemoteStorageEnabled,
  normalizeStoredAssetValue,
  resolveLocalAssetPath,
  saveBuffer,
  supportsDirectUpload
} from '../services/storage.js';
import { serializeBeatAssets } from '../utils/assets.js';
import { normalizeArtistName } from '../utils/artistNames.js';
import { toDateTimeString } from '../utils/timezone.js';
import { invalidateVipCache, recordPreviewAccess, getGuestTodayPreviewCount, extractGuestSessionId, GUEST_PREVIEW_LIMIT } from '../middleware/vip.js';
import { updateRapperSortOrderByName } from '../services/rapperScore.js';
import { ensureRapperExists } from './upload.js';

const router = Router();

const playEventLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: '播放事件发送过于频繁，请稍后再试',
});

const PREVIEW_MAX_BYTES = FREE_PREVIEW_MAX_BYTES;
const coverUpload = multer({
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
      cb(new Error('封面仅支持 jpg、png、webp 格式'));
    }
  }
});

type BeatRecord = Beat & {
  uploaded_by?: number | null;
  is_vip_only?: number;
  recent_downloads?: number;
  favorite_count?: number;
  recent_favorites?: number;
  play_count?: number;
  recent_plays?: number;
  hot_score?: number;
};

async function canManageBeat(req: AuthRequest, beat: BeatRecord) {
  if (!req.user) return false;

  const database = getDatabaseClient();
  const currentUser = await database.queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [req.user.id]);
  return currentUser?.role === 'admin' || beat.uploaded_by === req.user.id;
}

/**
 * 同步 beatmaker_profiles 统计字段（total_beats / total_likes / total_downloads）。
 * 仅在上传者是已认证 Beatmaker 时更新，非 Beatmaker 静默跳过。
 * 使用 INSERT ... ON DUPLICATE KEY UPDATE 确保即使 profiles 记录不存在也不报错。
 */
export async function syncBeatmakerStat(
  uploaderId: number,
  field: 'total_beats' | 'total_likes' | 'total_downloads',
  delta: number,
): Promise<void> {
  const database = getDatabaseClient();
  // 仅对认证 Beatmaker 更新，避免对 admin/普通用户产生无效记录
  const bm = await database.queryOne<{ is_beatmaker: number }>(
    'SELECT is_beatmaker FROM users WHERE id = ?',
    [uploaderId],
  );
  if (!bm || bm.is_beatmaker !== 1) return;
  await database.execute(
    `INSERT INTO beatmaker_profiles (user_id, display_name, certified_at, ${field})
     VALUES (?, '', NOW(), GREATEST(0, ?))
     ON DUPLICATE KEY UPDATE ${field} = GREATEST(0, ${field} + ?)`,
    [uploaderId, delta, delta],
  );
}

/**
 * 向客户端返回 beat 文件（远程签名 URL 重定向 或 本地文件流）。
 */
function serveBeatFile(res: Response, beat: BeatRecord): void {
  if (isRemoteStorageEnabled()) {
    const signedUrl = getSignedAssetUrl('audio', beat.file_path, {
      expiresInSeconds: 300,
      forceDownload: true,
      downloadFileName: getDownloadFileName(beat),
    });
    if (!signedUrl) {
      res.status(404).json({ error: 'Audio file not found' });
      return;
    }
    res.redirect(signedUrl);
    return;
  }

  const filePath = resolveLocalAssetPath('audio', beat.file_path);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  const downloadName = getDownloadFileName(beat);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="beat-${beat.id}${path.extname(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  );
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(filePath).pipe(res);
}

function getDownloadFileName(beat: BeatRecord): string {
  const rawSource = beat.file_path.startsWith('http://') || beat.file_path.startsWith('https://') || beat.file_path.startsWith('//')
    ? new URL(beat.file_path.startsWith('//') ? `https:${beat.file_path}` : beat.file_path).pathname
    : beat.file_path;
  const ext = path.extname(rawSource) || '.mp3';
  const safeTitle = beat.title.replace(/[\\/:*?"<>|]/g, '_').trim() || `beat-${beat.id}`;
  return `${safeTitle}${ext}`;
}

async function proxyRemoteAudioStream(fetchUrl: string, req: AuthRequest, res: Response, preview: boolean) {
  const headers = new Headers();
  if (preview) {
    const previewEnd = PREVIEW_MAX_BYTES - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/i.exec(req.headers.range);
      if (match) {
        const start = parseInt(match[1], 10);
        const requestedEnd = match[2] ? parseInt(match[2], 10) : undefined;
        // 如果请求的起始位置超出预览范围，调整到有效范围
        if (start >= PREVIEW_MAX_BYTES) {
          // 请求超出预览范围，返回 416 或空响应
          res.status(416);
          res.setHeader('Content-Range', `bytes */${PREVIEW_MAX_BYTES}`);
          res.setHeader('X-Preview', 'true');
          res.setHeader('X-Preview-Duration', String(FREE_PREVIEW_DURATION_SECONDS));
          res.end();
          return;
        }
        // 调整结束位置到预览范围内
        const end = requestedEnd !== undefined ? Math.min(requestedEnd, previewEnd) : previewEnd;
        headers.set('Range', `bytes=${start}-${end}`);
      } else {
        headers.set('Range', `bytes=0-${previewEnd}`);
      }
    } else {
      headers.set('Range', `bytes=0-${previewEnd}`);
    }
  } else if (req.headers.range) {
    headers.set('Range', req.headers.range);
  }

  let upstream;
  try {
    upstream = await fetch(fetchUrl, { headers });
  } catch (err) {
    res.status(502).json({ error: '音频流获取失败' });
    return;
  }
  
  if (!upstream.ok && upstream.status !== 206) {
    res.status(upstream.status === 404 ? 404 : 502).json({ error: '音频流获取失败' });
    return;
  }

  const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');

  res.status(upstream.status === 206 ? 206 : 200);
  res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);

  if (preview) {
    res.setHeader('X-Preview', 'true');
    res.setHeader('X-Preview-Duration', String(FREE_PREVIEW_DURATION_SECONDS));
    res.setHeader('Accept-Ranges', 'bytes');
  } else {
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body as never).pipe(res);
}

// GET /api/beats - 公开访问（不需要登录）
router.get('/beats', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 12));
  const offset = (page - 1) * limit;

  const { genre, bpm_min, bpm_max, key, search, is_free, sort, rapper, tag } = req.query as Record<string, string>;
  const popularSince = new Date();
  popularSince.setDate(popularSince.getDate() - 7);
  const popularSinceText = toDateTimeString(popularSince);

  // 全部伴奏：只显示管理员上传的作品（creator_role = 'admin'）。
  // Beatmaker 原创作品请使用 /api/beats/beatmaker。
  const conditions: string[] = ["b.creator_role = 'admin'"];
  const params: unknown[] = [];

  if (genre) {
    conditions.push('b.genre = ?');
    params.push(genre);
  }
  if (rapper) {
    // 支持 rapper ID 或名字过滤
    // 通过 beat_producers 表关联，支持合作作品
    const rapperId = parseInt(rapper);
    if (!isNaN(rapperId)) {
      // rapper 是数字 ID，通过 beat_producers 表查询
      conditions.push('EXISTS (SELECT 1 FROM beat_producers bp WHERE bp.beat_id = b.id AND bp.rapper_id = ?)');
      params.push(rapperId);
    } else {
      // rapper 是名字，通过 beat_producers 表查询
      conditions.push('EXISTS (SELECT 1 FROM beat_producers bp WHERE bp.beat_id = b.id AND bp.rapper_name = ?)');
      params.push(rapper);
    }
  }
  if (tag) {
    // tags 是 JSON 数组，用 LIKE 模糊匹配
    conditions.push("b.tags LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (bpm_min) {
    conditions.push('b.bpm >= ?');
    params.push(parseInt(bpm_min));
  }
  if (bpm_max) {
    conditions.push('b.bpm <= ?');
    params.push(parseInt(bpm_max));
  }
  if (key) {
    conditions.push('b.`key` = ?');
    params.push(key);
  }
  if (search) {
    conditions.push('(b.title LIKE ? OR b.producer LIKE ? OR b.rapper LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (is_free === '1') {
    conditions.push('b.is_free = 1');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause =
    sort === 'popular'
      ? `FROM beats b
         LEFT JOIN (
           SELECT beat_id, COUNT(*) AS recent_downloads
           FROM downloads
           WHERE created_at >= ?
           GROUP BY beat_id
         ) recent_downloads ON recent_downloads.beat_id = b.id
         LEFT JOIN (
           SELECT beat_id, COUNT(*) AS favorite_count
           FROM favorites
           GROUP BY beat_id
         ) favorites_total ON favorites_total.beat_id = b.id
         LEFT JOIN (
           SELECT beat_id, COUNT(*) AS recent_favorites
           FROM favorites
           WHERE created_at >= ?
           GROUP BY beat_id
         ) favorites_recent ON favorites_recent.beat_id = b.id
         LEFT JOIN (
           SELECT beat_id, COUNT(*) AS play_count
           FROM play_events
           GROUP BY beat_id
         ) plays_total ON plays_total.beat_id = b.id
         LEFT JOIN (
           SELECT beat_id, COUNT(*) AS recent_plays
           FROM play_events
           WHERE created_at >= ?
           GROUP BY beat_id
         ) plays_recent ON plays_recent.beat_id = b.id`
      : 'FROM beats b';
  const selectClause =
    sort === 'popular'
      ? `SELECT DISTINCT b.*,
           COALESCE(recent_downloads.recent_downloads, 0) AS recent_downloads,
           COALESCE(favorites_total.favorite_count, 0) AS favorite_count,
           COALESCE(favorites_recent.recent_favorites, 0) AS recent_favorites,
           COALESCE(plays_total.play_count, 0) AS play_count,
           COALESCE(plays_recent.recent_plays, 0) AS recent_plays,
           (
             COALESCE(recent_downloads.recent_downloads, 0) * 5 +
             COALESCE(b.download_count, 0) * 1 +
             COALESCE(favorites_recent.recent_favorites, 0) * 3 +
             COALESCE(favorites_total.favorite_count, 0) * 1 +
             COALESCE(plays_recent.recent_plays, 0) * 1 +
             COALESCE(plays_total.play_count, 0) * 0.2
           ) AS hot_score`
      : 'SELECT DISTINCT b.*';
  const orderBy =
    sort === 'popular'
      ? `ORDER BY hot_score DESC,
           COALESCE(recent_downloads.recent_downloads, 0) DESC,
           COALESCE(favorites_recent.recent_favorites, 0) DESC,
           COALESCE(plays_recent.recent_plays, 0) DESC,
           b.download_count DESC,
           b.created_at DESC,
           b.id DESC`
      : 'ORDER BY b.created_at DESC, b.id DESC';

  const total = (await database.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT b.id) as count FROM beats b ${where}`,
    params
  ))?.count ?? 0;

  const popularParams = sort === 'popular' ? [popularSinceText, popularSinceText, popularSinceText] : [];
  const beats = await database.queryMany<BeatRecord>(
    `${selectClause} ${fromClause} ${where} ${orderBy} LIMIT ? OFFSET ?`,
    [...popularParams, ...params, limit, offset]
  );

  // 如果用户已登录，批量查询收藏状态
  let favoriteIds: Set<number> = new Set();
  if (req.user) {
    const favs = await database.queryMany<{ beat_id: number }>(
      'SELECT beat_id FROM favorites WHERE user_id = ?',
      [req.user.id]
    );
    favoriteIds = new Set(favs.map((f) => f.beat_id));
  }

  const beatsWithFav = beats.map((b: any) => serializeBeatAssets({
    ...b,
    is_favorited: favoriteIds.has(b.id)
  }));

  res.json({
    beats: beatsWithFav,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/beats/beatmaker - 获取所有 Beatmaker 原创作品
router.get('/beats/beatmaker', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 12));
  const offset = (page - 1) * limit;

  const { genre, bpm_min, bpm_max, key, search, is_free, sort } = req.query as Record<string, string>;

  // 筛选条件：只取 creator_role = 'beatmaker' 的作品
  const conditions: string[] = ["b.creator_role = 'beatmaker'"];
  const params: unknown[] = [];

  if (genre) {
    conditions.push('b.genre = ?');
    params.push(genre);
  }
  if (bpm_min) {
    conditions.push('b.bpm >= ?');
    params.push(parseInt(bpm_min));
  }
  if (bpm_max) {
    conditions.push('b.bpm <= ?');
    params.push(parseInt(bpm_max));
  }
  if (key) {
    conditions.push('b.`key` = ?');
    params.push(key);
  }
  if (search) {
    conditions.push('(b.title LIKE ? OR b.producer LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (is_free === '1') {
    conditions.push('b.is_free = 1');
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // JOIN beatmaker_profiles 获取上传者信息
  const fromClause = `
    FROM beats b
    LEFT JOIN beatmaker_profiles bp ON bp.user_id = b.uploaded_by
    LEFT JOIN users u ON u.id = b.uploaded_by
    LEFT JOIN (
      SELECT beat_id, COUNT(*) AS favorite_count
      FROM favorites
      GROUP BY beat_id
    ) fav ON fav.beat_id = b.id`;

  const selectClause = `
    SELECT b.*,
           bp.display_name AS beatmaker_display_name,
           bp.avatar_url AS beatmaker_avatar,
           bp.portfolio_url,
           COALESCE(fav.favorite_count, 0) AS favorite_count`;

  // 排序
  const orderBy = sort === 'popular'
    ? 'ORDER BY b.download_count DESC, fav.favorite_count DESC, b.created_at DESC, b.id DESC'
    : 'ORDER BY b.created_at DESC, b.id DESC';

  const total = (await database.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM beats b ${where}`,
    params
  ))?.count ?? 0;

  const beats = await database.queryMany<any>(
    `${selectClause} ${fromClause} ${where} ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 登录用户批量查询收藏状态
  let favoriteIds: Set<number> = new Set();
  if (req.user && beats.length > 0) {
    const beatIds = beats.map((b: any) => b.id);
    const placeholders = beatIds.map(() => '?').join(',');
    const favs = await database.queryMany<{ beat_id: number }>(
      `SELECT beat_id FROM favorites WHERE user_id = ? AND beat_id IN (${placeholders})`,
      [req.user.id, ...beatIds]
    );
    favoriteIds = new Set(favs.map((f) => f.beat_id));
  }

  res.json({
    beats: beats.map((b: any) => serializeBeatAssets({
      ...b,
      is_favorited: favoriteIds.has(b.id)
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// GET /api/beats/:id
router.get('/beats/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  // 查询 beat 并 LEFT JOIN 创作者资料（优先取 beatmaker_profiles.display_name，其次 users.username）
  const beat = await database.queryOne<any>(
    `SELECT b.*,
            bp.display_name AS creator_display_name,
            bp.avatar_url AS creator_avatar,
            CASE WHEN bp.user_id IS NOT NULL THEN 1 ELSE 0 END AS creator_is_beatmaker,
            u.username AS creator_username
       FROM beats b
       LEFT JOIN beatmaker_profiles bp ON bp.user_id = b.uploaded_by
       LEFT JOIN users u ON u.id = b.uploaded_by
      WHERE b.id = ?`,
    [req.params.id]
  );
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }
  // 规整 creator_* 字段：把 null 变成 undefined，display_name 为空时 fallback 到 creator_username
  beat.creator_display_name = beat.creator_display_name || beat.creator_username || beat.producer;
  beat.creator_is_beatmaker = Boolean(beat.creator_is_beatmaker);
  // serializeBeatAssets 已经处理 cover_image + tags 两个字段
  // 把 beat 里多出来的 creator_avatar 也送进去（需要被 sign）
  const serialized = serializeBeatAssets({ ...beat, is_favorited: false });
  // 单独给 creator_avatar 签名（因为 serializeBeatAssets 只处理 cover_image）
  if (serialized.creator_avatar) {
    serialized.creator_avatar = getSignedAssetUrl('avatar', serialized.creator_avatar, {
      expiresInSeconds: 60 * 60 * 24 * 7
    });
  }
  // 不要把内部 JOIN 字段暴露出去
  delete serialized.creator_username;

  // VIP专属内容访问控制
  const vipLevel = await getUserVipLevel(req);
  if (serialized.is_vip_only && !canAccessVipContent(vipLevel)) {
    return res.status(403).json({
      error: '此伴奏为高级专属内容，请升级至高级或至尊会员',
      code: 'VIP_ONLY',
      required_level: 'premium'
    });
  }
  // optionalAuth：游客可能没有 user，只有登录用户才查询收藏状态
  let isFavorited = false;
  if (req.user) {
    const favorite = await database.queryOne<{ id: number }>(
      'SELECT id FROM favorites WHERE user_id = ? AND beat_id = ?',
      [req.user.id, req.params.id]
    );
    isFavorited = !!favorite;
  }
  serialized.is_favorited = isFavorited;
  res.json(serialized);
});

// GET /api/beats/:id/stream
// 支持已登录用户和未登录用户（匿名 session 通过 Cookie 自动处理）
router.get('/beats/:id/stream', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }

  const isGuest = !req.user;
  let vipLevel: VipLevel = 'free';

  if (!isGuest) {
    try {
      vipLevel = await getUserVipLevel(req);
    } catch (err) {
      console.error('Failed to get VIP level:', err);
      vipLevel = 'free';
    }
  }

  const canFullPlay = canFullPreview(vipLevel);

  // VIP 专属内容访问控制
  if (!isGuest && beat.is_vip_only && !canAccessVipContent(vipLevel)) {
    return res.status(403).json({
      error: '此伴奏为高级专属内容，请升级至高级或至尊会员',
      code: 'VIP_ONLY',
      required_level: 'premium'
    });
  }

  // 游客：必须在 Cookie 中有 session 才允许试听（防止绕过）
  // stream 端点的计数检查和 /preview/play 一致，保证无法绕过
  if (isGuest) {
    const sessionId = extractGuestSessionId(req);
    if (!sessionId) {
      return res.status(403).json({
        error: '请先访问首页获取试用资格',
        code: 'NO_SESSION',
      });
    }
    const ip = req.socket?.remoteAddress || 'unknown';
    const count = await getGuestTodayPreviewCount(sessionId, ip);
    if (count >= GUEST_PREVIEW_LIMIT) {
      return res.status(403).json({
        error: `今日免费试听次数已用完（${count}/${GUEST_PREVIEW_LIMIT}）`,
        code: 'GUEST_LIMIT_REACHED',
        used: count,
        limit: GUEST_PREVIEW_LIMIT,
        remaining: 0,
      });
    }
    // 计数未超限，记录本次试听
    await recordPreviewAccess(ANONYMOUS_USER_ID, beat.id, sessionId, ip);
  }

  if (isRemoteStorageEnabled()) {
    const signedUrl = getSignedAssetUrl('audio', beat.file_path, { expiresInSeconds: 300 });
    if (!signedUrl) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    // 未登录或无全量试听权限：通过代理流式返回（截断预览）
    if (isGuest || !canFullPlay) {
      await proxyRemoteAudioStream(signedUrl, req, res, true);
      return;
    }

    // 会员或 basic 用户：完整播放
    return res.redirect(signedUrl);
  }

  const filePath = resolveLocalAssetPath('audio', beat.file_path);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  // 未登录用户或免费用户：预览40秒
  if (isGuest || !canFullPlay) {
    const previewDuration = FREE_PREVIEW_DURATION_SECONDS;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-Preview', 'true');
    res.setHeader('X-Preview-Duration', String(previewDuration));
    res.setHeader('Accept-Ranges', 'none');

    // 跳过 MP3 头延迟编码
    const ffmpegArgs = [
      '-loglevel', 'error',
      '-ss', '0',
      '-t', String(previewDuration),
      '-i', filePath,
      '-acodec', 'libmp3lame',
      '-b:a', '128k',
      '-write_xing', '1',
      '-f', 'mp3',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      console.error('[preview] ffmpeg:', chunk.toString());
    });
    ffmpeg.on('error', (err: Error) => {
      console.error('[preview] ffmpeg spawn error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    req.on('close', () => ffmpeg.kill('SIGKILL'));
    ffmpeg.stdout.pipe(res);
    return;
  }

  // 已登录会员用户：正常返回完整文件
  const rangeHeader = req.headers.range;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Range 无效时回退到完整文件，避免 416
    if (start >= fileSize || end >= fileSize || start > end) {
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /api/beats/:id/download
// GET /api/beats/:id/license
router.get('/beats/:id/license', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();

  const beat = await database.queryOne<BeatRecord>('SELECT id FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }

  // 获取当前活跃模板
  const template = await database.queryOne<{ content: string; version: string }>(
    'SELECT content, version FROM beat_license_templates WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  );

  // 查询用户是否已同意（仅对已登录用户）
  let agreed = false;
  if (req.user) {
    const agreement = await database.queryOne<{ id: number }>(
      'SELECT id FROM beat_license_agreements WHERE user_id = ? AND beat_id = ? LIMIT 1',
      [req.user.id, beat.id]
    );
    agreed = !!agreement;
  }

  res.json({
    content: template?.content ?? '',
    version: template?.version ?? '1.0',
    agreed
  });
});

// POST /api/beats/:id/license/agree
router.post('/beats/:id/license/agree', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();

  const beat = await database.queryOne<BeatRecord>('SELECT id FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }

  // 写入同意记录，ON DUPLICATE KEY UPDATE 确保幂等
  await database.execute(
    `INSERT INTO beat_license_agreements (user_id, beat_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE agreed_at = agreed_at`,
    [req.user!.id, beat.id]
  );

  res.json({ success: true });
});

router.get('/beats/:id/download', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const forumDb = getForumDatabaseClient();
  const membershipDb = getMembershipDatabaseClient();
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }

  // 协议同意校验（所有用户，包括会员，必须先同意协议）
  const agreement = await database.queryOne<{ id: number }>(
    'SELECT id FROM beat_license_agreements WHERE user_id = ? AND beat_id = ? LIMIT 1',
    [req.user!.id, beat.id]
  );
  if (!agreement) {
    return res.status(403).json({
      error: '请先阅读并同意使用协议',
      code: 'LICENSE_AGREEMENT_REQUIRED'
    });
  }

  // Beatmaker 下载自己上传的作品：跳过 VIP/积分/日限检查
  const isOwnBeat = beat.uploaded_by === req.user!.id;
  if (isOwnBeat) {
    // 记录下载日志（幂等）+ 累加 download_count，但不消耗 VIP 额度或积分权限
    const ownLogResult = await database.execute(
      `INSERT INTO downloads (user_id, beat_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [req.user!.id, beat.id]
    );
    if (Number(ownLogResult.affectedRows) === 1) {
      await database.execute(
        'UPDATE beats SET download_count = download_count + 1 WHERE id = ?',
        [beat.id]
      );
      // 同步 beatmaker_profiles.total_downloads（仅首次下载当天计次）
      await syncBeatmakerStat(beat.uploaded_by!, 'total_downloads', 1).catch(() => {});
    }
    // 更新关联 rapper 权重
    if (beat.rapper) {
      updateRapperSortOrderByName(beat.rapper).catch(err => {
        console.error('Failed to update rapper weight after download:', err);
      });
    }
    // 直接返回文件，跳过 VIP/积分/日限逻辑
    serveBeatFile(res, beat);
    return;
  }

  let vipLevel: VipLevel;
  try {
    vipLevel = await getUserVipLevel(req);
  } catch (err) {
    console.error('Failed to get VIP level:', err);
    vipLevel = 'free';
  }

  let usedPointPermission = false;

  // 免费用户：尝试使用积分兑换的下载权限
  if (!canDownload(vipLevel)) {
    // 免费用户每日下载次数上限（积分兑换权限同样计入，默认 5 次/天）
    const limit = getDailyDownloadLimit(vipLevel);
    if (limit !== null) {
      const dailyCount = await getDailyDownloadCount(req.user!.id);
      if (dailyCount >= limit) {
        return res.status(403).json({
          error: `今日下载次数已用完（${dailyCount}/${limit}），升级会员享更多下载`,
          code: 'DOWNLOAD_LIMIT_REACHED',
          daily_limit: limit,
          daily_used: dailyCount
        });
      }
    }

    // 查询是否有未使用的积分下载权限
    const permission = await membershipDb.queryOne<{ id: number }>(
      'SELECT id FROM point_download_permissions WHERE user_id = ? AND used = 0 LIMIT 1',
      [req.user!.id]
    );

    if (!permission) {
      return res.status(403).json({
        error: '下载伴奏需要开通会员或使用积分兑换',
        code: 'DOWNLOAD_REQUIRES_VIP',
        hint: '10积分可兑换1次下载权限'
      });
    }

    // 标记权限已使用
    await membershipDb.execute(
      'UPDATE point_download_permissions SET used = 1, used_at = ? WHERE id = ?',
      [toDateTimeString(new Date()), permission.id]
    );
    usedPointPermission = true;
  } else {
    // 会员用户：检查每日下载次数限制
    const limit = getDailyDownloadLimit(vipLevel);
    if (limit !== null) {
      const dailyCount = await getDailyDownloadCount(req.user!.id);
      if (dailyCount >= limit) {
        return res.status(403).json({
          error: `今日下载次数已用完（${dailyCount}/${limit}），升级会员享更多下载`,
          code: 'DOWNLOAD_LIMIT_REACHED',
          daily_limit: limit,
          daily_used: dailyCount
        });
      }
    }
  }

  // Record download log (幂等：UNIQUE(user_id, beat_id, created_date) 命中时静默 IODKU 不抛错)
  const logResult = await database.execute(
    `INSERT INTO downloads (user_id, beat_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [req.user!.id, beat.id]
  );
  // MySQL INSERT … ON DUPLICATE KEY UPDATE affected_rows 语义：
  //   - 真插入新行 = 1 → 今天首次下载 → 计数器 +1
  //   - 命中 UNIQUE / 纯 UPDATE 无变化 = 2 → 重复下载 → 不重复计次
  const isFirstDownloadToday = Number(logResult.affectedRows) === 1;
  if (isFirstDownloadToday) {
    // Increment download count (只有首次下载才累加)
    await database.execute(
      'UPDATE beats SET download_count = download_count + 1 WHERE id = ?',
      [beat.id]
    );
    // 同步 beatmaker_profiles.total_downloads（仅上传者是 Beatmaker 时生效）
    if (beat.uploaded_by) {
      syncBeatmakerStat(beat.uploaded_by, 'total_downloads', 1).catch(() => {});
    }
  }

  // 自动更新关联 rapper 的权重
  if (beat.rapper) {
    updateRapperSortOrderByName(beat.rapper).catch(err => {
      console.error('Failed to update rapper weight after download:', err);
    });
  }

  serveBeatFile(res, beat);
});

// GET /api/home/public - 公开首页数据，不需要登录
router.get('/home/public', async (_req: Request, res: Response) => {
  const database = getDatabaseClient();

  // 首页「最新/热门/免费」均只展示官方（管理员上传）作品，
  // Beatmaker 原创作品请在 /beats 页的「原创 Beatmaker 作品」Tab 查看。
  const ADMIN_ONLY = "b.creator_role = 'admin'";

  // 最新伴奏
  const latestBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           b.uploaded_by, b.creator_role,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    WHERE ${ADMIN_ONLY}
    ORDER BY b.created_at DESC
    LIMIT 6
  `);

  // 本周热门
  const popularBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           b.uploaded_by, b.creator_role,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    WHERE ${ADMIN_ONLY}
    ORDER BY b.download_count DESC
    LIMIT 6
  `);

  // 免费伴奏
  const freeBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           b.uploaded_by, b.creator_role,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    WHERE ${ADMIN_ONLY} AND b.is_free = 1
    ORDER BY b.created_at DESC
    LIMIT 6
  `);

  // 人气 Rapper（真实人气算法 = play_count*1 + download_count*3 + beat_count*5，二级排序保留运营置顶 sort_order）
  // 注意：play_events 表只累计历史播放增量；真正的实热在 beats.play_count 上（由 /api/beats/:id/play-events 自动 +1）
  const rappers = await database.queryMany<any>(`
    SELECT
      r.id,
      r.name,
      r.avatar_url,
      r.bio,
      COUNT(DISTINCT bp.beat_id)                                AS beat_count,
      COALESCE(SUM(b.play_count),     0)                        AS total_plays,
      COALESCE(SUM(b.download_count), 0)                        AS total_downloads,
      (
        COALESCE(SUM(b.play_count),     0) * 1
        + COALESCE(SUM(b.download_count), 0) * 3
        + COUNT(DISTINCT bp.beat_id) * 5
      )                                                         AS popularity
    FROM rappers r
    LEFT JOIN beat_producers bp ON bp.rapper_id = r.id
    LEFT JOIN beats b           ON b.id = bp.beat_id
    GROUP BY r.id, r.name, r.avatar_url, r.bio
    ORDER BY r.sort_order ASC, popularity DESC, total_downloads DESC, beat_count DESC
    LIMIT 8
  `);

  // 热门标签（仅统计官方伴奏库，避免被 Beatmaker 作品污染官方标签）
  const tagRows = await database.queryMany<{ tags: string | null }>(
    `SELECT tags FROM beats WHERE creator_role = 'admin' AND tags IS NOT NULL AND tags != '' AND tags != '[]'`
  );
  const tagCount: Record<string, number> = {};
  for (const row of tagRows) {
    try {
      const parsed = JSON.parse(row.tags || '[]') as string[];
      for (const tag of parsed) {
        const t = tag.trim();
        if (t) tagCount[t] = (tagCount[t] || 0) + 1;
      }
    } catch {
      // ignore parse errors
    }
  }
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  // 论坛最新帖子（先查 forum DB，再去主库取作者信息）
  const forumDb = getForumDatabaseClient();
  const forumPostRows = await forumDb.queryMany<any>(`
    SELECT id, title, view_count, comment_count AS reply_count, like_count, created_at, user_id
    FROM forum_posts
    WHERE status = 'published'
    ORDER BY created_at DESC
    LIMIT 4
  `);

  // 用主库补充作者信息（复用上面的 database 句柄）
  let forumPosts: Array<any> = [];
  if (forumPostRows.length > 0) {
    const userIds = [...new Set(forumPostRows.map((p: any) => p.user_id))];
    const placeholders = userIds.map(() => '?').join(',');
    const users = await database.queryMany<{ id: number; username: string; avatar_url: string | null }>(
      `SELECT id, username, avatar_url FROM users WHERE id IN (${placeholders})`,
      userIds
    );
    const userMap = new Map(users.map((u) => [u.id, u]));
    forumPosts = forumPostRows.map((p: any) => ({
      id: p.id,
      title: p.title,
      view_count: p.view_count,
      reply_count: p.reply_count,
      like_count: p.like_count,
      created_at: p.created_at,
      username: userMap.get(p.user_id)?.username || '匿名',
      author_avatar: userMap.get(p.user_id)?.avatar_url || null,
    }));
  }

  // 序列化封面图片（OSS 模式下生成签名 URL）
  const serializedLatest = latestBeats.map((b: any) => serializeBeatAssets(b));
  const serializedPopular = popularBeats.map((b: any) => serializeBeatAssets(b));
  const serializedFree = freeBeats.map((b: any) => serializeBeatAssets(b));

  res.json({
    latest: { beats: serializedLatest, total: serializedLatest.length },
    popular: { beats: serializedPopular, total: serializedPopular.length },
    free: { beats: serializedFree, total: serializedFree.length },
    rappers,
    tags: topTags,
    forumPosts,
  });
});

// POST /api/beats/:id/cover/upload-target — 获取封面直传目标
router.post('/beats/:id/cover/upload-target', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }
  if (!(await canManageBeat(req, beat))) {
    return res.status(403).json({ error: '无权修改该伴奏封面' });
  }

  if (!supportsDirectUpload()) {
    return res.json({ direct_upload: false });
  }

  const { file } = req.body as { file?: { name?: string; type?: string } };
  if (!file?.name) {
    return res.status(400).json({ error: '请提供封面文件信息' });
  }

  const target = createDirectUploadTarget('cover', {
    originalName: file.name,
    contentType: file.type || 'image/jpeg'
  });

  res.json({
    direct_upload: true,
    target
  });
});

// POST /api/beats/:id/cover — 上传伴奏封面
router.post('/beats/:id/cover', requireAuth, coverUpload.single('cover'), async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }
  if (!(await canManageBeat(req, beat))) {
    return res.status(403).json({ error: '无权修改该伴奏封面' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '请选择封面图片' });
  }

  const asset = await saveBuffer('cover', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });

  res.json({
    message: '封面上传成功',
    stored_value: asset.storedValue,
    cover_image: serializeBeatAssets({ cover_image: asset.storedValue }).cover_image
  });
});

// DELETE /api/beats/:id — 删除伴奏（管理员或上传者本人）
router.delete('/beats/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [id]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }
  if (!(await canManageBeat(req, beat))) {
    return res.status(403).json({ error: '无权删除该伴奏' });
  }

  const coverImage = (beat as any).cover_image as string | null | undefined;
  const uploaderId = beat.uploaded_by;

  await database.transaction(async (tx) => {
    await tx.execute('DELETE FROM favorites WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM comments WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM downloads WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM play_events WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM beats WHERE id = ?', [id]);
  });

  await deleteStoredAsset('audio', beat.file_path);
  await deleteStoredAsset('cover', coverImage);

  // 同步 beatmaker_profiles 统计：total_beats 递减
  if (uploaderId) {
    await syncBeatmakerStat(uploaderId, 'total_beats', -1).catch(() => {});
  }

  res.json({ message: '删除成功' });
});

// PUT /api/beats/:id — 编辑伴奏信息（管理员或上传者本人）
router.put('/beats/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [id]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }
  if (!(await canManageBeat(req, beat))) {
    return res.status(403).json({ error: '无权编辑该伴奏' });
  }
  const { title, producer, rapper, bpm, key, genre, tags, is_free, is_vip_only, cover_image } = req.body;

  if (bpm !== undefined && bpm !== null && bpm !== '') {
    const bpmNum = Number(bpm);
    if (isNaN(bpmNum) || bpmNum < 0 || bpmNum > 300) {
      return res.status(400).json({ error: 'BPM 必须在 0 到 300 之间' });
    }
  }

  // 客户端可能传回 /covers/xxx.jpg 这类公开 URL,先还原成数据库存储值,
  // 避免和旧值比较时误判为新封面,进而把刚上传的文件删掉。
  const nextCoverImage = cover_image === undefined
    ? beat.cover_image
    : cover_image == null
      ? null
      : normalizeStoredAssetValue('cover', cover_image);

  // 参与 rapper 频道关联的名字来自 producer + rapper 两个字段,
  // 都用 & 分隔合作者;字段未传时沿用数据库旧值。
  const finalProducer = producer === undefined ? beat.producer : producer;
  const finalRapper = rapper === undefined ? beat.rapper : rapper;

  await database.execute(`
    UPDATE beats SET
      title = COALESCE(?, title),
      producer = COALESCE(?, producer),
      rapper = ?,
      bpm = COALESCE(?, bpm),
      \`key\` = COALESCE(?, \`key\`),
      genre = COALESCE(?, genre),
      tags = COALESCE(?, tags),
      cover_image = ?,
      is_free = COALESCE(?, is_free),
      is_vip_only = COALESCE(?, is_vip_only)
    WHERE id = ?
  `, [title, producer, finalRapper, bpm, key, genre, tags, nextCoverImage, is_free, is_vip_only, id]);

  // 同步「制作人」关联到 beat_producers 表(频道按 producer 组织)。
  // producer 为空时才回退到 rapper;合作者用 & 分隔,并做同人不同写法归一化。
  const namesToSync = new Set<string>();
  const collectNames = (value: string | null | undefined) => {
    if (!value) return;
    for (const part of value.split('&')) {
      const name = normalizeArtistName(part.trim());
      if (name) namesToSync.add(name);
    }
  };
  if (finalProducer && finalProducer.trim()) {
    collectNames(finalProducer);
  } else {
    collectNames(finalRapper);
  }

  // 编辑会覆盖当前关联,先清掉旧记录,再按最新名字重建(避免改名后残留旧关联)
  await database.execute('DELETE FROM beat_producers WHERE beat_id = ?', [id]);

  for (const name of namesToSync) {
    await ensureRapperExists(database, name);

    const rapperRecord = await database.queryOne<{ id: number }>(
      'SELECT id FROM rappers WHERE name = ?',
      [name]
    );

    await database.execute(
      `INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rapper_id = VALUES(rapper_id), rapper_name = VALUES(rapper_name)`,
      [id, rapperRecord?.id || null, name]
    );
  }

  if (beat.cover_image && nextCoverImage !== beat.cover_image) {
    await deleteStoredAsset('cover', beat.cover_image);
  }

  // 更新关联 rapper 的权重(优先取 rapper 字段,否则取 producer 第一个名字)
  const weightName = finalRapper || finalProducer;
  if (weightName) {
    const primaryRapper = weightName.includes('&') ? weightName.split('&')[0].trim() : weightName;
    updateRapperSortOrderByName(primaryRapper).catch(err => {
      console.error('Failed to update rapper weight after edit:', err);
    });
  }

  const updated = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [id]);
  res.json(serializeBeatAssets(updated as any));
});

// PATCH /api/beats/:id/cover — 上传或移除封面（multipart，local/oss 均可用）
router.patch('/beats/:id/cover', requireAuth, coverUpload.single('cover'), async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const { id } = req.params;
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [id]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }
  if (!(await canManageBeat(req, beat))) {
    return res.status(403).json({ error: '无权编辑该伴奏' });
  }

  // 支持前端通过 cover=null 显式移除封面
  const removeCover = req.body.cover === 'null' || req.body.cover === null;

  let nextCoverImage: string | null = beat.cover_image;

  if (removeCover) {
    nextCoverImage = null;
  } else if (req.file) {
    const ext = req.file.originalname.includes('.')
      ? req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase()
      : '.jpg';
    const { storedValue } = await saveBuffer('cover', {
      buffer: req.file.buffer,
      originalName: `cover-${id}-${Date.now()}${ext}`
    });
    nextCoverImage = storedValue;
  }

  await database.execute(
    'UPDATE beats SET cover_image = ? WHERE id = ?',
    [nextCoverImage, id]
  );

  if (beat.cover_image && nextCoverImage !== beat.cover_image) {
    await deleteStoredAsset('cover', beat.cover_image);
  }

  const updated = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [id]);
  res.json(serializeBeatAssets(updated as any));
});

// POST /api/beats/:id/play-events — 记录有效播放事件
router.post('/beats/:id/play-events', playEventLimiter, optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beatIdRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const beatId = parseInt(beatIdRaw, 10);
  const beat = await database.queryOne<{ id: number; rapper: string | null }>('SELECT id, rapper FROM beats WHERE id = ?', [beatId]);
  if (!beat) {
    return res.status(404).json({ error: '伴奏不存在' });
  }

  // 已登录用户记录到 user_id，未登录用户记录到 anonymous user
  const userId = req.user?.id ?? ANONYMOUS_USER_ID;
  await database.execute(
    'INSERT INTO play_events (user_id, beat_id) VALUES (?, ?)',
    [userId, beatId]
  );

  // 同步累加 beats.play_count，供"人气 Rapper"模块的真实人气公式使用
  try {
    await database.execute(
      'UPDATE beats SET play_count = play_count + 1 WHERE id = ?',
      [beatId]
    );
  } catch (err) {
    // play_count 列可能尚未存在（旧库一次性回填失败时不阻塞接口）
    console.warn('[rapbeats] play_count 自增失败(可忽略):', (err as Error).message);
  }

  // 自动更新关联 rapper 的权重
  if (beat.rapper) {
    updateRapperSortOrderByName(beat.rapper).catch(err => {
      console.error('Failed to update rapper weight after play:', err);
    });
  }

  res.status(201).json({ message: '播放事件已记录' });
});

export default router;
