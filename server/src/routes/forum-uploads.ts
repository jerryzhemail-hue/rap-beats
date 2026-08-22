import {
  createForumRouter,
  getForumDatabaseClient,
  getDatabaseClient,
  requireAuth,
  type AuthRequest,
  enrichWithUsers,
  formatDate,
  type ForumPost,
  type ForumComment,
  uploadLimiter,
  GENRE_OPTIONS,
} from './forum-common.js';
import multer from 'multer';
import fs from 'fs';
import { supportsDirectUpload, createDirectUploadTarget, saveBuffer } from '../services/storage.js';

const router = createForumRouter();

router.get('/forum/my-posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM forum_posts WHERE user_id = ? AND status = 'published'`,
      [req.user!.id]
    );
    const total = countRow?.count ?? 0;

    const posts = await db.queryMany<ForumPost>(
      `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
       FROM forum_posts fp
       LEFT JOIN forum_categories fc ON fc.id = fp.category_id
       WHERE fp.user_id = ? AND fp.status = 'published'
       ORDER BY fp.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user!.id, pageSize, offset]
    );

    const enriched = posts.map((p) => ({
      ...p,
      time_ago: formatDate(p.created_at),
      content_preview: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content,
      is_liked: true,
      images: (() => { try { return typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch { return []; } })(),
    }));

    res.json({ posts: enriched, total, page: pageNum, page_size: pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 我的点赞 ─────────────────────────────────────────────────────────────────

// GET /api/forum/my-likes — 当前用户点赞过的帖子
router.get('/forum/my-likes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM forum_likes WHERE user_id = ?`,
      [req.user!.id]
    );
    const total = countRow?.count ?? 0;

    const posts = await db.queryMany<ForumPost>(
      `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
       FROM forum_likes fl
       JOIN forum_posts fp ON fp.id = fl.post_id
       LEFT JOIN forum_categories fc ON fc.id = fp.category_id
       WHERE fl.user_id = ? AND fp.status = 'published'
       ORDER BY fl.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user!.id, pageSize, offset]
    );

    const enriched = posts.map((p) => ({
      ...p,
      time_ago: formatDate(p.created_at),
      content_preview: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content,
      is_liked: true,
      images: (() => { try { return typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch { return []; } })(),
    }));

    res.json({ posts: enriched, total, page: pageNum, page_size: pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 我的评论 ─────────────────────────────────────────────────────────────────

// GET /api/forum/my-comments — 当前用户发表过的评论
router.get('/forum/my-comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM forum_comments WHERE user_id = ?`,
      [req.user!.id]
    );
    const total = countRow?.count ?? 0;

    const comments = await db.queryMany<ForumComment>(
      `SELECT fc.*, fp.title as post_title, fp.id as post_id
       FROM forum_comments fc
       JOIN forum_posts fp ON fp.id = fc.post_id
       WHERE fc.user_id = ?
       ORDER BY fc.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user!.id, pageSize, offset]
    );

    const mainDb = getDatabaseClient();
    const enriched = await enrichWithUsers(comments, mainDb);

    const result = enriched.map((c) => ({
      ...c,
      time_ago: formatDate(c.created_at),
      post_title: (c as any).post_title,
      post_id: (c as any).post_id,
    }));

    res.json({ comments: result, total, page: pageNum, page_size: pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 管理接口 ─────────────────────────────────────────────────────────────────

// POST /api/forum/admin/posts/:id/pin
router.post('/forum/admin/posts/:id/pin', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const post = await db.queryOne<ForumPost>('SELECT * FROM forum_posts WHERE id = ?', [id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    await db.execute('UPDATE forum_posts SET is_pinned = ? WHERE id = ?', [post.is_pinned ? 0 : 1, id]);
    res.json({ message: post.is_pinned ? '已取消置顶' : '已置顶' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/admin/posts/:id/essence
router.post('/forum/admin/posts/:id/essence', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const post = await db.queryOne<ForumPost>('SELECT * FROM forum_posts WHERE id = ?', [id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    await db.execute('UPDATE forum_posts SET is_essence = ? WHERE id = ?', [post.is_essence ? 0 : 1, id]);
    res.json({ message: post.is_essence ? '已取消加精' : '已加精' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const forumImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    if (!allowed.includes(ext)) {
      cb(new Error('图片仅支持 jpg、png、webp、gif 格式'));
    } else {
      cb(null, true);
    }
  }
});

router.post('/forum/upload-target', uploadLimiter, requireAuth, (req: AuthRequest, res) => {
  if (!supportsDirectUpload()) {
    return res.json({ direct_upload: false });
  }
  const { file } = req.body as { file?: { name?: string; type?: string } };
  if (!file?.name) {
    return res.status(400).json({ error: '请提供图片信息' });
  }
  const target = createDirectUploadTarget('forum_image', {
    originalName: file.name,
    contentType: file.type || 'image/jpeg'
  });
  res.json({ direct_upload: true, target });
});

router.post('/forum/upload-image', uploadLimiter, requireAuth, forumImageUpload.single('image'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片' });
  }
  const asset = await saveBuffer('forum_image', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });
  res.json({
    message: '图片上传成功',
    stored_value: asset.storedValue,
    image_url: asset.publicUrl
  });
});

const forumAudioUpload = multer({
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

router.post('/forum/upload-audio', uploadLimiter, requireAuth, forumAudioUpload.single('audio'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择音频文件' });
  }
  const asset = await saveBuffer('forum_audio', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });

  const audioUrl = asset.publicUrl;
  // audio_id 必须 URL 安全（本地/OSS 模式一致）：取文件名去扩展名
  // OSS 模式下 storedValue 是完整 URL，直接作为路由参数会因包含 / 而 404
  const audioId = (String(asset.storedValue).split('/').pop() || '').replace(/\.[^.]+$/, '');

  // 第一阶段（同步、极快）：上传文件 + 解析元数据（music-metadata，几十毫秒）
  let bpm: number | null = null;
  let duration: number | null = null;
  let detectedStyle: string[] = [];
  let genre: string[] = [];
  let tmpPath: string | null = null;
  try {
    tmpPath = `/tmp/audio-meta-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmpPath, req.file.buffer);

    const { detectAudioFeature } = await import('../services/audioAnalyzer.js');
    const metaResult = await detectAudioFeature(tmpPath);
    bpm = metaResult.bpm;
    genre = metaResult.genre;
    duration = metaResult.duration;
    detectedStyle = metaResult.detectedStyle;
  } catch (err) {
    console.warn('[upload-audio] audio metadata failed:', err);
  }

  // 标准化风格
  const normalizedGenre = genre.length > 0 ? genre[0] : null;

  // 立即返回，让前端先继续编辑帖子
  res.json({
    message: '音频上传成功，BPM 正在后台分析中',
    stored_value: asset.storedValue,
    audio_url: audioUrl,
    bpm,                    // 元数据 BPM（可能为空）
    bpm_confidence: 0,
    duration: duration ? Math.round(duration) : null,
    genre: normalizedGenre,
    detected_style: detectedStyle,
    genre_options: GENRE_OPTIONS,
    bpm_pending: true,      // 标记：BPM 仍在后台分析
    audio_id: audioId,
  });

  // 第二阶段（异步、不阻塞响应）：用 librosa 检测更精确的 BPM
  if (tmpPath) {
    runBpmAnalysisInBackground(tmpPath, audioId, audioUrl, detectedStyle).catch((err) => {
      console.error('[upload-audio] background BPM analysis error:', err);
    });
  }
});

/**
 * 后台异步分析 BPM 并写入内存缓存。
 * 前端可通过 GET /forum/audio-bpm/:audioId 查询结果。
 */
async function runBpmAnalysisInBackground(
  tmpPath: string,
  audioId: string,
  audioUrl: string,
  detectedStyle: string[]
) {
  try {
    const { detectBpmFromFile } = await import('../services/bpmDetector.js');
    const bpmResult = await detectBpmFromFile(tmpPath);
    if (bpmResult && bpmResult.confidence > 0.2) {
      audioBpmCache.set(audioId, {
        bpm: Math.round(bpmResult.bpm),
        bpm_confidence: bpmResult.confidence,
        duration: bpmResult.duration_seconds ? Math.round(bpmResult.duration_seconds) : null,
        key: bpmResult.key,
        key_root: bpmResult.key_root,
        key_mode: bpmResult.key_mode,
        key_confidence: bpmResult.key_confidence,
        ready: true,
      });
      console.log(`[upload-audio] BPM analysis completed for ${audioId}: ${bpmResult.bpm}`);
    } else {
      audioBpmCache.set(audioId, { bpm: null, ready: true });
      console.log(`[upload-audio] BPM analysis finished with low confidence for ${audioId}`);
    }
  } catch (err) {
    console.error('[upload-audio] background BPM analysis failed:', err);
    audioBpmCache.set(audioId, { bpm: null, ready: true });
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

/**
 * 内存缓存：audioId -> BPM 分析结果。
 * 重启服务会清空；前端如果没赶上结果就提交了帖子也没关系，
 * BPM 已经存进了帖子记录里。
 */
const audioBpmCache = new Map<string, {
  bpm: number | null;
  bpm_confidence?: number;
  duration?: number | null;
  key?: string;
  key_root?: string;
  key_mode?: string;
  key_confidence?: number;
  ready: boolean;
}>();

/**
 * 前端轮询这个接口获取 BPM 分析结果。
 */
router.get('/forum/audio-bpm/:audioId', requireAuth, (req: AuthRequest, res) => {
  const audioId = Array.isArray(req.params.audioId) ? req.params.audioId[0] : req.params.audioId;
  const result = audioBpmCache.get(audioId);
  if (!result) {
    return res.json({ ready: false, bpm: null });
  }
  res.json(result);
});

// ─── 视频上传 ────────────────────────────────────────────────────────────────

const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB
const VIDEO_MAX_DURATION = 180; // 3 分钟（秒）

const forumVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.webm', '.m4v'];
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    if (!allowed.includes(ext)) {
      cb(new Error('视频仅支持 MP4、MOV、WebM 格式'));
    } else {
      cb(null, true);
    }
  }
});

router.post('/forum/upload-video', uploadLimiter, requireAuth, forumVideoUpload.single('video'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择视频文件' });
  }

  // 先探测视频时长，超时则直接拒绝，不上传到 OSS（避免孤儿文件）
  let duration: number | null = null;
  try {
    const { probeVideoMeta } = await import('../services/videoProcessor.js');
    const meta = await probeVideoMeta(req.file.buffer);
    duration = meta.duration;
    if (duration && duration > VIDEO_MAX_DURATION) {
      return res.status(400).json({ error: `视频时长不能超过 ${VIDEO_MAX_DURATION} 秒（当前 ${Math.round(duration)} 秒），请上传短视频` });
    }
  } catch (err) {
    // ffmpeg 不可用时无法校验时长，以 5MB（约45秒视频@128kbps）为兜底阈值
    // 超过此阈值的视频视为疑似超时，拒绝上传；小文件允许通过
    const WARN_SIZE = 5 * 1024 * 1024; // 5MB
    if (req.file.size > WARN_SIZE) {
      console.warn(`[upload-video] ffmpeg unavailable and file ${req.file.size} bytes may exceed duration limit, rejecting`);
      return res.status(400).json({ error: '视频时长校验服务暂不可用，请上传较短的短视频（建议 5MB 以下）' });
    }
    console.warn('[upload-video] ffmpeg unavailable, size check passed, allowing upload');
  }

  // 时长校验通过后再上传到 OSS
  const asset = await saveBuffer('forum_video', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });

  // 提取封面图（取第一帧）
  let coverUrl: string | null = null;
  try {
    const { extractVideoCover } = await import('../services/videoProcessor.js');
    const coverBuffer = await extractVideoCover(req.file.buffer, 1);
    if (coverBuffer) {
      const coverAsset = await saveBuffer('forum_video_cover', {
        buffer: coverBuffer,
        originalName: req.file.originalname.replace(/\.[^.]+$/, '') + '-cover.jpg'
      });
      coverUrl = coverAsset.publicUrl;
    }
  } catch (err) {
    console.warn('[upload-video] failed to extract cover:', err);
  }

  res.json({
    message: '视频上传成功',
    stored_value: asset.storedValue,
    video_url: asset.publicUrl,
    video_cover: coverUrl,
    duration: duration ? Math.round(duration) : null,
    file_size: req.file.size,
    max_size: MAX_VIDEO_SIZE,
    max_duration: VIDEO_MAX_DURATION,
  });
});

export default router;
