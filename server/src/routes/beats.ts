import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';
import { type Beat } from '../database/index.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';
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
  resolveLocalAssetPath,
  saveBuffer,
  supportsDirectUpload
} from '../services/storage.js';
import { serializeBeatAssets } from '../utils/assets.js';
import { toDateTimeString } from '../utils/timezone.js';
import { invalidateVipCache, recordPreviewAccess, getGuestTodayPreviewCount, extractGuestSessionId, GUEST_PREVIEW_LIMIT } from '../middleware/vip.js';
import { updateRapperSortOrderByName } from '../services/rapperScore.js';

const router = Router();

const playEventLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: '播放事件发送过于频繁，请稍后再试',
});

const genreAliasMap: Record<string, string[]> = {
  '主流流行（Mainstream Pop）': ['主流流行（Mainstream Pop）', 'Pop'],
  '流行舞曲（Dance Pop）': ['流行舞曲（Dance Pop）', 'Dance Pop'],
  '抒情流行（Pop Ballad）': ['抒情流行（Pop Ballad）', 'Pop Ballad'],
  '国风流行（C-Pop 国风）': ['国风流行（C-Pop 国风）', 'C-Pop'],
  '经典摇滚（Classic Rock）': ['经典摇滚（Classic Rock）', 'Rock', 'Classic Rock'],
  '朋克摇滚（Punk Rock）': ['朋克摇滚（Punk Rock）', 'Punk Rock'],
  '英伦摇滚（Britpop）': ['英伦摇滚（Britpop）', 'Britpop'],
  '民谣摇滚（Folk Rock）': ['民谣摇滚（Folk Rock）', 'Folk Rock'],
  '老派说唱（Old School）': ['老派说唱（Old School）', 'Old School'],
  '东岸说唱（East Coast）': ['东岸说唱（East Coast）', 'East Coast'],
  '西岸说唱 / G-Funk': ['西岸说唱 / G-Funk', 'G-Funk'],
  '陷阱说唱（Trap）': ['陷阱说唱（Trap）', 'Trap'],
  '旋律说唱（Melodic Rap）': ['旋律说唱（Melodic Rap）', 'Melodic Rap'],
  '爵士说唱（Jazz Rap）': ['爵士说唱（Jazz Rap）', 'Jazz Rap', 'Jazz'],
  'Drill': ['Drill'],
  'Boom Bap': ['Boom Bap', 'boombap'],
  '经典 R&B': ['经典 R&B', 'R&B'],
  '灵魂乐（Soul）': ['灵魂乐（Soul）', 'Soul'],
  '新灵魂乐（Neo-Soul）': ['新灵魂乐（Neo-Soul）', 'Neo-Soul'],
  'Trap Soul': ['Trap Soul'],
  '放克（Funk）': ['放克（Funk）', 'Funk'],
  '另类 R&B（Alternative R&B）': ['另类 R&B（Alternative R&B）', 'Alternative R&B'],
  '浩室音乐（House）': ['浩室音乐（House）', 'House'],
  '科技舞曲（Techno）': ['科技舞曲（Techno）', 'Techno'],
  '鼓打贝斯（Drum & Bass）': ['鼓打贝斯（Drum & Bass）', 'Drum & Bass'],
  '迷幻出神（Trance）': ['迷幻出神（Trance）', 'Trance'],
  'Lo-Fi 电子': ['Lo-Fi 电子', 'Lo-fi', 'Lo-Fi'],
  '商业电子舞曲（EDM）': ['商业电子舞曲（EDM）', 'EDM']
};

function getGenreAliases(genre: string): string[] {
  const aliases = genreAliasMap[genre];
  if (!aliases) return [genre];
  return Array.from(new Set(aliases));
}
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

  const { genre, bpm_min, bpm_max, key, search, is_free, sort, rapper } = req.query as Record<string, string>;
  const popularSince = new Date();
  popularSince.setDate(popularSince.getDate() - 7);
  const popularSinceText = toDateTimeString(popularSince);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (genre) {
    const aliases = getGenreAliases(genre);
    conditions.push(`b.genre IN (${aliases.map(() => '?').join(', ')})`);
    params.push(...aliases);
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

// GET /api/beats/:id
router.get('/beats/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const beat = await database.queryOne<BeatRecord>('SELECT * FROM beats WHERE id = ?', [req.params.id]);
  if (!beat) {
    res.status(404).json({ error: 'Beat not found' });
    return;
  }
  // VIP专属内容访问控制
  const vipLevel = await getUserVipLevel(req);
  if (beat.is_vip_only && !canAccessVipContent(vipLevel)) {
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
  res.json(serializeBeatAssets({ ...beat, is_favorited: isFavorited }));
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
    // 查询是否有未使用的积分下载权限
    const permission = await forumDb.queryOne<{ id: number }>(
      'SELECT id FROM forum_point_download_permissions WHERE user_id = ? AND used = 0 LIMIT 1',
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
    await forumDb.execute(
      'UPDATE forum_point_download_permissions SET used = 1, used_at = ? WHERE id = ?',
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

  // Increment download count
  await database.execute('UPDATE beats SET download_count = download_count + 1 WHERE id = ?', [beat.id]);
  // Record download log
  await database.execute('INSERT INTO downloads (user_id, beat_id) VALUES (?, ?)', [req.user!.id, beat.id]);

  // 自动更新关联 rapper 的权重
  if (beat.rapper) {
    updateRapperSortOrderByName(beat.rapper).catch(err => {
      console.error('Failed to update rapper weight after download:', err);
    });
  }

  if (isRemoteStorageEnabled()) {
    const signedUrl = getSignedAssetUrl('audio', beat.file_path, {
      expiresInSeconds: 300,
      forceDownload: true,
      downloadFileName: getDownloadFileName(beat)
    });

    if (!signedUrl) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    return res.redirect(signedUrl);
  }

  const filePath = resolveLocalAssetPath('audio', beat.file_path);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${getDownloadFileName(beat)}"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(filePath).pipe(res);
});

// GET /api/genres
router.get('/genres', async (_req: Request, res: Response) => {
  const database = getDatabaseClient();
  const rows = await database.queryMany<{ genre: string }>('SELECT DISTINCT genre FROM beats ORDER BY genre ASC');
  const genres = rows.map((r) => r.genre);
  res.json({ genres });
});

  // GET /api/home/public - 公开首页数据，不需要登录
router.get('/home/public', async (_req: Request, res: Response) => {
  const database = getDatabaseClient();

  // 最新伴奏
  const latestBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    ORDER BY b.created_at DESC
    LIMIT 6
  `);

  // 本周热门
  const popularBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    ORDER BY b.download_count DESC
    LIMIT 6
  `);

  // 免费伴奏
  const freeBeats = await database.queryMany<any>(`
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           COALESCE(b.download_count, 0) as download_count
    FROM beats b
    WHERE b.is_free = 1
    ORDER BY b.created_at DESC
    LIMIT 6
  `);

  // 序列化封面图片（OSS 模式下生成签名 URL）
  const serializedLatest = latestBeats.map((b: any) => serializeBeatAssets(b));
  const serializedPopular = popularBeats.map((b: any) => serializeBeatAssets(b));
  const serializedFree = freeBeats.map((b: any) => serializeBeatAssets(b));

  res.json({
    latest: { beats: serializedLatest, total: serializedLatest.length },
    popular: { beats: serializedPopular, total: serializedPopular.length },
    free: { beats: serializedFree, total: serializedFree.length }
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

  await database.transaction(async (tx) => {
    await tx.execute('DELETE FROM favorites WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM comments WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM downloads WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM play_events WHERE beat_id = ?', [id]);
    await tx.execute('DELETE FROM beats WHERE id = ?', [id]);
  });

  await deleteStoredAsset('audio', beat.file_path);
  await deleteStoredAsset('cover', coverImage);

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

  const nextCoverImage = cover_image === undefined ? beat.cover_image : cover_image;

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
  `, [title, producer, rapper === undefined ? beat.rapper : rapper, bpm, key, genre, tags, nextCoverImage, is_free, is_vip_only, id]);

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

  // 自动更新关联 rapper 的权重
  if (beat.rapper) {
    updateRapperSortOrderByName(beat.rapper).catch(err => {
      console.error('Failed to update rapper weight after play:', err);
    });
  }

  res.status(201).json({ message: '播放事件已记录' });
});

export default router;
