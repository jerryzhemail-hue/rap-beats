import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';
import { changePoints, getPointTransactions, getTotalPoints, POINT_REWARDS, getAvailableReward, POINT_LEVEL_CONFIG } from '../services/points.js';
import { invalidateVipCache } from '../middleware/vip.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { createDirectUploadTarget, saveBuffer, supportsDirectUpload } from '../services/storage.js';
import { suggestTopics } from '../services/topicEngine.js';
import { addClient, removeClient, pushToUser } from '../services/messageEvents.js';

// 从主库批量查询用户信息（用于跨库 enrichment）
async function enrichWithUsers<T extends { user_id: number }>(
  items: T[],
  mainDb: ReturnType<typeof getDatabaseClient>
): Promise<(T & { author_username?: string; author_avatar?: string })[]> {
  if (items.length === 0) return items;
  const userIds = [...new Set(items.map((i) => i.user_id))];
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${placeholders})`,
    userIds
  );
  const userMap = new Map(rows.map((u) => [u.id, u]));
  return items.map((item) => ({
    ...item,
    author_username: userMap.get(item.user_id)?.username,
    author_avatar: userMap.get(item.user_id)?.avatar_url,
  }));
}
import { sanitizeHtml, escapeHtmlContent } from '../utils/sanitize.js';
import type { ImageAnalysisResult } from '../services/imageAnalyzer.js';
import { getLocalDateString, getLocalDateTimeStart, getLocalDateTimeEnd, getLocalDate, toDateTimeString, toDateString } from '../utils/timezone.js';

// 与 client/src/constants/genres.ts 保持同步的服务器端风格选项
export const GENRE_OPTIONS: { label: string; value: string; children: { label: string; value: string }[] }[] = [
  { label: '流行音乐（Pop）', value: 'pop', children: [
    { label: '主流流行（Mainstream Pop）', value: '主流流行（Mainstream Pop）' },
    { label: '流行舞曲（Dance Pop）', value: '流行舞曲（Dance Pop）' },
    { label: '抒情流行（Pop Ballad）', value: '抒情流行（Pop Ballad）' },
    { label: '国风流行（C-Pop 国风）', value: '国风流行（C-Pop 国风）' }
  ]},
  { label: '摇滚乐', value: 'rock', children: [
    { label: '经典摇滚（Classic Rock）', value: '经典摇滚（Classic Rock）' },
    { label: '朋克摇滚（Punk Rock）', value: '朋克摇滚（Punk Rock）' },
    { label: '英伦摇滚（Britpop）', value: '英伦摇滚（Britpop）' },
    { label: '民谣摇滚（Folk Rock）', value: '民谣摇滚（Folk Rock）' }
  ]},
  { label: '说唱音乐', value: 'rap', children: [
    { label: '老派说唱（Old School）', value: '老派说唱（Old School）' },
    { label: '东岸说唱（East Coast）', value: '东岸说唱（East Coast）' },
    { label: '西岸说唱 / G-Funk', value: '西岸说唱 / G-Funk' },
    { label: '陷阱说唱（Trap）', value: '陷阱说唱（Trap）' },
    { label: '旋律说唱（Melodic Rap）', value: '旋律说唱（Melodic Rap）' },
    { label: '爵士说唱（Jazz Rap）', value: '爵士说唱（Jazz Rap）' },
    { label: 'Drill', value: 'Drill' },
    { label: 'Boom Bap', value: 'Boom Bap' }
  ]},
  { label: '节奏布鲁斯 R&B', value: 'rnb', children: [
    { label: '经典 R&B', value: '经典 R&B' },
    { label: '灵魂乐（Soul）', value: '灵魂乐（Soul）' },
    { label: '新灵魂乐（Neo-Soul）', value: '新灵魂乐（Neo-Soul）' },
    { label: 'Trap Soul', value: 'Trap Soul' },
    { label: '放克（Funk）', value: '放克（Funk）' },
    { label: '另类 R&B（Alternative R&B）', value: '另类 R&B（Alternative R&B）' }
  ]},
  { label: '电子音乐（Electronic）', value: 'electronic', children: [
    { label: '浩室音乐（House）', value: '浩室音乐（House）' },
    { label: '科技舞曲（Techno）', value: '科技舞曲（Techno）' },
    { label: '鼓打贝斯（Drum & Bass）', value: '鼓打贝斯（Drum & Bass）' },
    { label: '迷幻出神（Trance）', value: '迷幻出神（Trance）' },
    { label: 'Lo-Fi 电子', value: 'Lo-Fi 电子' },
    { label: '商业电子舞曲（EDM）', value: '商业电子舞曲（EDM）' }
  ]},
];

const router = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────
const postLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: '发帖过于频繁，请在1分钟后重试',
});
const commentLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: '评论过于频繁，请在1分钟后重试',
});
const likeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: '操作过于频繁，请稍后再试',
});
const uploadLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: '上传过于频繁，请在1分钟后重试',
});
const signInLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 3,
  message: '签到过于频繁，请在1分钟后重试',
});
const lotteryLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 3,
  message: '抽奖过于频繁，请在1分钟后重试',
});
const exchangeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: '兑换过于频繁，请在1分钟后重试',
});
const messageLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: '发送消息过于频繁，请稍后再试',
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: number;
  is_active: number;
  post_count: number;
  real_post_count?: number;
}

interface ForumPost {
  id: number;
  user_id: number;
  category_id: number;
  title: string;
  content: string;
  beat_id: number | null;
  cover_image: string | null;
  music_file: string | null;
  images: string[];
  topic_ids: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_pinned: number;
  is_essence: number;
  status: string;
  created_at: string;
  updated_at: string;
  // joined fields
  author_username?: string;
  author_avatar?: string;
  category_name?: string;
  category_slug?: string;
}

interface ForumComment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: number;
  created_at: string;
  author_username?: string;
  author_avatar?: string;
  replies?: ForumComment[];
}

interface ForumTopic {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  post_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return d.toLocaleDateString('zh-CN');
}

// GET /api/forum/categories
router.get('/forum/categories', async (_req, res) => {
  try {
    const db = getForumDatabaseClient();
    const categories = await db.queryMany<ForumCategory>(
      `SELECT fc.*,
        (SELECT COUNT(*) FROM forum_posts WHERE category_id = fc.id AND status = 'published') AS real_post_count
       FROM forum_categories fc
       WHERE fc.is_active = 1
       ORDER BY fc.sort_order ASC`
    );
    const result = categories.map(c => ({ ...c, post_count: c.real_post_count ?? 0 }));
    res.json({ categories: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/topics?category_id=1
router.get('/forum/topics', async (req, res) => {
  try {
    const db = getForumDatabaseClient();
    const { category_id } = req.query as { category_id?: string };
    let query = 'SELECT * FROM forum_topics WHERE is_active = 1';
    const params: string[] = [];
    if (category_id) {
      query += ' AND category_id = ?';
      params.push(category_id);
    }
    query += ' ORDER BY post_count DESC LIMIT 10';
    const topics = await db.queryMany<ForumTopic>(query, params);
    res.json({ topics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/suggest-topics — 根据内容/标题/图片/音频分析推荐话题，动态创建新话题（限当前版块）
router.post('/forum/suggest-topics', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, content, image_urls, audio_urls, category_id, exclude_ids } = req.body as {
      title?: string;
      content?: string;
      image_urls?: string[];
      audio_urls?: string[];
      category_id: number;
      exclude_ids?: number[];
    };

    if (!category_id) return res.status(400).json({ error: '缺少版块 ID' });

    const text = [title, content].filter(Boolean).join(' ');
    const exclude = Array.isArray(exclude_ids) ? exclude_ids : [];

    // 运行时从数据库获取该版块的话题 ID 映射（key = slug）
    const db = getForumDatabaseClient();
    const dbTopics = await db.queryMany<{ id: number; slug: string; name: string }>(
      'SELECT id, slug, name FROM forum_topics WHERE category_id = ? AND is_active = 1',
      [category_id]
    );
    const presetMap = new Map(dbTopics.map(t => [t.slug, t.id]));

    // ── 分析图片 ──
    let imageAnalysis: ImageAnalysisResult | undefined;
    if (Array.isArray(image_urls) && image_urls.length > 0) {
      const { analyzeImage } = await import('../services/imageAnalyzer.js');
      const urls = image_urls.slice(0, 2);

      const results: ImageAnalysisResult[] = [];
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const tmpPath = `/tmp/topic-img-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
          fs.writeFileSync(tmpPath, Buffer.from(buffer));
          const result = await analyzeImage(tmpPath);
          fs.unlinkSync(tmpPath);
          results.push(result);
        } catch {
          // 单张失败不影响整体
        }
      }

      if (results.length > 0) {
        imageAnalysis = {
          ocrText: results.map(r => r.ocrText).filter(Boolean).join(' '),
          detectedKeywords: [...new Set(results.flatMap(r => r.detectedKeywords))],
          hasLyrics: results.some(r => r.hasLyrics),
          hasBeat: results.some(r => r.hasBeat),
          hasPortrait: results.some(r => r.hasPortrait),
          hasIllustration: results.some(r => r.hasIllustration),
          dominantColors: results.flatMap(r => r.dominantColors),
          saturation: results.reduce((sum, r) => sum + (r.saturation || 0), 0) / results.length,
          brightness: results.reduce((sum, r) => sum + (r.brightness || 0.5), 0) / results.length,
        };
      }
    }

    // ── 分析音频 ──
    let audioAnalysis: Awaited<ReturnType<typeof import('../services/audioAnalyzer.js').detectAudioFeature>> | undefined;
    if (Array.isArray(audio_urls) && audio_urls.length > 0) {
      const { detectAudioFeature } = await import('../services/audioAnalyzer.js');
      const audioResults = [];

      for (const url of audio_urls.slice(0, 1)) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const tmpPath = `/tmp/topic-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
          fs.writeFileSync(tmpPath, Buffer.from(buffer));
          const result = await detectAudioFeature(tmpPath);
          fs.unlinkSync(tmpPath);
          audioResults.push(result);
        } catch {
          // 单个失败不影响整体
        }
      }

      if (audioResults.length > 0) {
        audioAnalysis = audioResults[0];
      }
    }

    // ── 获取推荐话题列表 ──
    const rawSuggestions = suggestTopics(text, category_id, imageAnalysis, audioAnalysis, exclude);

    // ── 逐个解析话题 slug → 数据库 ID（动态话题自动创建）──
    const { findOrCreateTopic } = await import('../services/topicManager.js');
    const resolved = await Promise.all(
      rawSuggestions.map(async (s) => {
        // 优先从数据库已有话题取 id 和 name
        if (presetMap.has(s.slug)) {
          const dbTopic = dbTopics.find(t => t.slug === s.slug);
          return { ...s, id: presetMap.get(s.slug)!, name: dbTopic?.name ?? s.slug };
        }
        // 动态话题：查找或创建（限当前版块）
        const dbTopic = await findOrCreateTopic(s.slug, s.category_id);
        if (!dbTopic) return null;
        return { ...s, id: dbTopic.id, name: dbTopic.name };
      })
    );

    const suggestions = resolved.filter(Boolean) as Array<{ id: number; name: string; slug: string; category_id: number; score: number; matchedKeywords: string[]; source: string }>;

    res.json({ suggestions });
  } catch (err: any) {
    console.error('[suggest-topics]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/posts — 信息流（支持分类过滤、排序）
// Query: category_id, sort (latest|hot), page, limit
router.get('/forum/posts', optionalAuth, async (req, res) => {
  try {
    const db = getForumDatabaseClient();
    const { category_id, sort = 'latest', page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;
    const currentUserId = (req as any).user?.id;

    let whereClause = "WHERE fp.status = 'published'";
    const params: any[] = [];

    if (category_id) {
      whereClause += ' AND fp.category_id = ?';
      params.push(parseInt(category_id));
    }

    let orderClause = 'ORDER BY fp.is_pinned DESC, fp.created_at DESC';
    if (sort === 'hot') {
      orderClause = 'ORDER BY fp.is_pinned DESC, fp.view_count DESC, fp.created_at DESC';
    }

    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM forum_posts fp ${whereClause}`,
      params
    );
    const total = countRow?.count ?? 0;

    const posts = await db.queryMany<ForumPost>(
      `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
       FROM forum_posts fp
       LEFT JOIN forum_categories fc ON fc.id = fp.category_id
       ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // 从主库补充用户信息
    const mainDb = getDatabaseClient();
    const enrichedPosts = await enrichWithUsers(posts, mainDb);

    // 如果有当前用户，检查每个帖子的点赞/收藏状态
    if (currentUserId && enrichedPosts.length > 0) {
      const postIds = enrichedPosts.map((p) => p.id);
      const likes = await db.queryMany<{ post_id: number }>(
        `SELECT post_id FROM forum_likes WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
        [currentUserId, ...postIds]
      );
      const favs = await db.queryMany<{ post_id: number }>(
        `SELECT post_id FROM forum_favorites WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
        [currentUserId, ...postIds]
      );
      const likedSet = new Set(likes.map((l) => l.post_id));
      const favedSet = new Set(favs.map((f) => f.post_id));
      for (const post of enrichedPosts) {
        (post as any).is_liked = likedSet.has(post.id);
        (post as any).is_favorited = favedSet.has(post.id);
      }
    }

    const enriched = enrichedPosts.map((p) => ({
      ...p,
      time_ago: formatDate(p.created_at),
      content_preview: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content,
      images: (() => { try { return typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch { return []; } })(),
    }));

    res.json({ posts: enriched, total, page: pageNum, page_size: pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/posts/:id — 帖子详情
router.get('/forum/posts/:id', optionalAuth, async (req, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const currentUserId = (req as any).user?.id;

    const post = await db.queryOne<ForumPost>(
      `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
       FROM forum_posts fp
       LEFT JOIN forum_categories fc ON fc.id = fp.category_id
       WHERE fp.id = ?`,
      [id]
    );

    if (!post) return res.status(404).json({ error: '帖子不存在' });

    // 从主库补充用户信息
    const mainDb = getDatabaseClient();
    const userRow = await mainDb.queryOne<{ username: string; avatar_url: string }>(
      'SELECT username, avatar_url FROM users WHERE id = ?',
      [post.user_id]
    );
    (post as any).author_username = userRow?.username;
    (post as any).author_avatar = userRow?.avatar_url;

    // 增加浏览量
    await db.execute('UPDATE forum_posts SET view_count = view_count + 1 WHERE id = ?', [id]);

    // 点赞/收藏状态
    if (currentUserId) {
      const [liked, faved] = await Promise.all([
        db.queryOne<{ id: number }>('SELECT id FROM forum_likes WHERE user_id = ? AND post_id = ?', [currentUserId, id]),
        db.queryOne<{ id: number }>('SELECT id FROM forum_favorites WHERE user_id = ? AND post_id = ?', [currentUserId, id]),
      ]);
      (post as any).is_liked = !!liked;
      (post as any).is_favorited = !!faved;
    }

    // 加载话题标签
    if (post.topic_ids) {
      try {
        const topicIdList = JSON.parse(post.topic_ids) as number[];
        if (topicIdList.length > 0) {
          const topics = await db.queryMany<ForumTopic>(
            `SELECT * FROM forum_topics WHERE id IN (${topicIdList.map(() => '?').join(',')})`,
            topicIdList
          );
          (post as any).topics = topics;
        } else {
          (post as any).topics = [];
        }
      } catch {
        (post as any).topics = [];
      }
    } else {
      (post as any).topics = [];
    }

    // 解析 images JSON
    try {
      (post as any).images = post.images ? JSON.parse(post.images as any) : [];
    } catch {
      (post as any).images = [];
    }

    (post as any).time_ago = formatDate(post.created_at);

    res.json({ post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/posts — 发帖
router.post('/forum/posts', postLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { title, content, category_id, beat_id, cover_image, music_file, music_title, music_artist, music_genre, music_bpm, music_cover_image, video_url, video_cover, video_duration, topic_ids, images } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });
    if (!content?.trim()) return res.status(400).json({ error: '内容不能为空' });
    if (!category_id) return res.status(400).json({ error: '请选择分类' });

    // 服务端 XSS 过滤：标题转义，帖子正文白名单过滤
    const sanitizedTitle = escapeHtmlContent(title.trim());
    const sanitizedContent = sanitizeHtml(content.trim());

    const topicIds = Array.isArray(topic_ids) ? topic_ids : [];
    const topicIdsJson = JSON.stringify(topicIds);
    const imagesJson = JSON.stringify(Array.isArray(images) ? images.slice(0, 6) : []);

    const result = await db.execute(
      `INSERT INTO forum_posts (user_id, category_id, title, content, beat_id, cover_image, music_file, music_title, music_artist, music_genre, music_bpm, music_cover_image, video_url, video_cover, video_duration, topic_ids, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user!.id, category_id, sanitizedTitle, sanitizedContent, beat_id || null, cover_image || null, music_file || null,
       music_title?.trim() || null, music_artist?.trim() || null, music_genre || null,
       music_bpm ? parseInt(music_bpm) : null, music_cover_image || null,
       video_url || null, video_cover || null, video_duration ? parseInt(video_duration) : null,
       topicIdsJson, imagesJson]
    );

    // Phase 2: 发帖积分奖励
    const availablePoints = await getAvailableReward(req.user!.id, 'post_created', POINT_REWARDS.post_created);
    let pointsEarned = 0;
    if (availablePoints > 0) {
      pointsEarned = await changePoints({
        userId: req.user!.id,
        amount: availablePoints,
        reason: 'post_created',
        description: `发布帖子奖励 ${availablePoints} 积分`,
      });
    }

    res.json({ message: '发布成功', post_id: result.insertId, points_earned: availablePoints, total_points: pointsEarned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/forum/posts/:id — 修改帖子（仅作者）
router.put('/forum/posts/:id', postLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const { title, content, category_id, topic_ids } = req.body;

    const post = await db.queryOne<ForumPost>('SELECT * FROM forum_posts WHERE id = ?', [id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    if (post.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: '无权修改' });
    }

    const topicIds = Array.isArray(topic_ids) ? topic_ids : [];
    const now = toDateTimeString(new Date());
    // 服务端 XSS 过滤
    const sanitizedTitle = title ? escapeHtmlContent(title.trim()) : post.title;
    const sanitizedContent = content ? sanitizeHtml(content.trim()) : post.content;
    await db.execute(
      `UPDATE forum_posts SET title = ?, content = ?, category_id = ?, topic_ids = ?, updated_at = ? WHERE id = ?`,
      [sanitizedTitle, sanitizedContent, category_id || post.category_id, JSON.stringify(topicIds), now, id]
    );

    res.json({ message: '更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/forum/posts/:id — 删除帖子（作者或管理员）
router.delete('/forum/posts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;

    const post = await db.queryOne<ForumPost>('SELECT * FROM forum_posts WHERE id = ?', [id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    if (post.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    await db.execute('DELETE FROM forum_posts WHERE id = ?', [id]);

    res.json({ message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 点赞 ─────────────────────────────────────────────────────────────────────

// POST /api/forum/posts/:id/like
router.post('/forum/posts/:id/like', likeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const userId = req.user!.id;

    const existing = await db.queryOne<{ id: number }>('SELECT id FROM forum_likes WHERE user_id = ? AND post_id = ?', [userId, id]);
    if (existing) {
      // 取消点赞
      await db.execute('DELETE FROM forum_likes WHERE user_id = ? AND post_id = ?', [userId, id]);
      await db.execute('UPDATE forum_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [id]);
      const post = await db.queryOne<{ like_count: number }>('SELECT like_count FROM forum_posts WHERE id = ?', [id]);
      return res.json({ liked: false, like_count: post?.like_count ?? 0 });
    } else {
      await db.execute('INSERT INTO forum_likes (user_id, post_id) VALUES (?, ?)', [userId, id]);
      await db.execute('UPDATE forum_posts SET like_count = like_count + 1 WHERE id = ?', [id]);
      const post = await db.queryOne<{ like_count: number; user_id: number }>('SELECT like_count, user_id FROM forum_posts WHERE id = ?', [id]);

      // Phase 2: 帖子被点赞，给作者积分奖励（不能给自己点赞）
      if (post && post.user_id !== userId) {
        const availablePoints = await getAvailableReward(post.user_id, 'post_liked', POINT_REWARDS.post_liked);
        if (availablePoints > 0) {
          await changePoints({
            userId: post.user_id,
            amount: availablePoints,
            reason: 'post_liked',
            description: `帖子被点赞奖励 ${availablePoints} 积分`,
          });
        }
      }

      return res.json({ liked: true, like_count: post?.like_count ?? 0 });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 收藏 ─────────────────────────────────────────────────────────────────────

// POST /api/forum/posts/:id/favorite
router.post('/forum/posts/:id/favorite', likeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const userId = req.user!.id;

    const post = await db.queryOne<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM forum_posts WHERE id = ?',
      [id]
    );
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const existing = await db.queryOne<{ id: number }>('SELECT id FROM forum_favorites WHERE user_id = ? AND post_id = ?', [userId, id]);
    if (existing) {
      await db.execute('DELETE FROM forum_favorites WHERE user_id = ? AND post_id = ?', [userId, id]);
      return res.json({ favorited: false });
    } else {
      await db.execute('INSERT INTO forum_favorites (user_id, post_id) VALUES (?, ?)', [userId, id]);

      // Phase 2: 帖子被收藏，给作者积分奖励（不能给自己收藏）
      if (post.user_id !== userId) {
        const availablePoints = await getAvailableReward(post.user_id, 'post_favorited', POINT_REWARDS.post_favorited);
        if (availablePoints > 0) {
          await changePoints({
            userId: post.user_id,
            amount: availablePoints,
            reason: 'post_favorited',
            description: `帖子被收藏奖励 ${availablePoints} 积分`,
          });
        }
      }

      return res.json({ favorited: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/favorites — 我的收藏列表
router.get('/forum/favorites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const countRow = await db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM forum_favorites WHERE user_id = ?',
      [req.user!.id]
    );
    const total = countRow?.count ?? 0;

    const posts = await db.queryMany<ForumPost>(
      `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
       FROM forum_favorites ff
       JOIN forum_posts fp ON fp.id = ff.post_id
       LEFT JOIN forum_categories fc ON fc.id = fp.category_id
       WHERE ff.user_id = ? AND fp.status = 'published'
       ORDER BY ff.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user!.id, pageSize, offset]
    );

    const mainDb = getDatabaseClient();
    const enrichedPosts = await enrichWithUsers(posts, mainDb);

    const enriched = enrichedPosts.map((p) => ({
      ...p,
      time_ago: formatDate(p.created_at),
      content_preview: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content,
      is_favorited: true,
    }));

    res.json({ posts: enriched, total, page: pageNum, page_size: pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 评论 ─────────────────────────────────────────────────────────────────────

// GET /api/forum/posts/:id/comments
router.get('/forum/posts/:id/comments', optionalAuth, async (req, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;
    const currentUserId = (req as any).user?.id;

    // 顶层评论（parent_id IS NULL）
    const topComments = await db.queryMany<ForumComment>(
      `SELECT fc.* FROM forum_comments fc
       WHERE fc.post_id = ? AND fc.parent_id IS NULL
       ORDER BY fc.created_at ASC
       LIMIT ? OFFSET ?`,
      [id, pageSize, offset]
    );

    if (topComments.length === 0) {
      return res.json({ comments: [], total: 0, page: pageNum });
    }

    // 从主库补充用户信息
    const mainDb = getDatabaseClient();
    const enrichedTop = await enrichWithUsers(topComments, mainDb);

    // 获取所有顶层评论的回复
    const topIds = enrichedTop.map((c) => c.id);
    const replies = await db.queryMany<ForumComment>(
      `SELECT fc.* FROM forum_comments fc
       WHERE fc.post_id = ? AND fc.parent_id IN (${topIds.map(() => '?').join(',')})
       ORDER BY fc.created_at ASC`,
      [id, ...topIds]
    );
    const enrichedReplies = await enrichWithUsers(replies, mainDb);

    // 如果有当前用户，检查评论点赞状态
    if (currentUserId) {
      const allCommentIds = [...topIds, ...replies.map(r => r.id)];
      const likedComments = await db.queryMany<{ comment_id: number }>(
        `SELECT comment_id FROM forum_comment_likes WHERE user_id = ? AND comment_id IN (${allCommentIds.map(() => '?').join(',')})`,
        [currentUserId, ...allCommentIds]
      );
      const likedSet = new Set(likedComments.map(l => l.comment_id));
      for (const c of enrichedTop) {
        (c as any).is_liked = likedSet.has(c.id);
      }
      for (const r of enrichedReplies) {
        (r as any).is_liked = likedSet.has(r.id);
      }
    }

    // 按 parent_id 分组
    const replyMap = new Map<number, typeof enrichedReplies>();
    for (const r of enrichedReplies) {
      if (!replyMap.has(r.parent_id!)) replyMap.set(r.parent_id!, []);
      replyMap.get(r.parent_id!)!.push(r);
    }

    const totalRow = await db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM forum_comments WHERE post_id = ?',
      [id]
    );

    const enriched = enrichedTop.map((c) => ({
      ...c,
      time_ago: formatDate(c.created_at),
      replies: (replyMap.get(c.id) || []).map((r) => ({
        ...r,
        time_ago: formatDate(r.created_at),
      })),
    }));

    res.json({ comments: enriched, total: totalRow?.count ?? 0, page: pageNum });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/posts/:id/comments — 发表评论
router.post('/forum/posts/:id/comments', commentLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const { content, parent_id } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: '评论内容不能为空' });

    const post = await db.queryOne<ForumPost>('SELECT id FROM forum_posts WHERE id = ?', [id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    // parent_id 必须在同一帖子内存在
    if (parent_id) {
      const parentComment = await db.queryOne<{ id: number; post_id: number }>(
        'SELECT id, post_id FROM forum_comments WHERE id = ?',
        [parent_id]
      );
      if (!parentComment) return res.status(400).json({ error: '被回复的评论不存在' });
      if (parentComment.post_id !== Number(id)) return res.status(400).json({ error: '被回复的评论不属于该帖子' });
    }

    // 服务端 XSS 过滤
    const sanitizedContent = escapeHtmlContent(content.trim());

    const result = await db.execute(
      'INSERT INTO forum_comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)',
      [id, req.user!.id, parent_id || null, sanitizedContent]
    );

    await db.execute('UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = ?', [id]);

    const comment = await db.queryOne<ForumComment>(
      'SELECT * FROM forum_comments WHERE id = ?',
      [result.insertId]
    );

    const mainDb = getDatabaseClient();
    const enriched = await enrichWithUsers([comment!], mainDb);

    // Phase 2: 评论积分奖励（只有顶层评论才奖励，防止刷分）
    let pointsEarned = 0;
    let totalPoints = 0;
    if (!parent_id) {
      const availablePoints = await getAvailableReward(req.user!.id, 'comment_created', POINT_REWARDS.comment_created);
      if (availablePoints > 0) {
        totalPoints = await changePoints({
          userId: req.user!.id,
          amount: availablePoints,
          reason: 'comment_created',
          description: `发布评论奖励 ${availablePoints} 积分`,
        });
        pointsEarned = availablePoints;
      }
    }

    res.json({
      comment: {
        ...enriched[0],
        time_ago: '刚刚',
        replies: [],
      },
      points_earned: pointsEarned,
      total_points: totalPoints,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/forum/comments/:id
router.delete('/forum/comments/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;

    const comment = await db.queryOne<ForumComment>('SELECT * FROM forum_comments WHERE id = ?', [id]);
    if (!comment) return res.status(404).json({ error: '评论不存在' });
    if (comment.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    await db.execute('DELETE FROM forum_comments WHERE id = ?', [id]);
    await db.execute('UPDATE forum_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?', [comment.post_id]);

    res.json({ message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 评论点赞 (Phase 2) ──────────────────────────────────────────────────────

// POST /api/forum/comments/:id/like
router.post('/forum/comments/:id/like', likeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const { id } = req.params;
    const userId = req.user!.id;

    const comment = await db.queryOne<ForumComment>('SELECT * FROM forum_comments WHERE id = ?', [id]);
    if (!comment) return res.status(404).json({ error: '评论不存在' });

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_comment_likes WHERE user_id = ? AND comment_id = ?',
      [userId, id]
    );

    if (existing) {
      // 取消点赞
      await db.execute('DELETE FROM forum_comment_likes WHERE user_id = ? AND comment_id = ?', [userId, id]);
      await db.execute('UPDATE forum_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [id]);
      const updated = await db.queryOne<{ like_count: number }>('SELECT like_count FROM forum_comments WHERE id = ?', [id]);
      return res.json({ liked: false, like_count: updated?.like_count ?? 0 });
    } else {
      // 点赞
      await db.execute('INSERT INTO forum_comment_likes (user_id, comment_id) VALUES (?, ?)', [userId, id]);
      await db.execute('UPDATE forum_comments SET like_count = like_count + 1 WHERE id = ?', [id]);
      const updated = await db.queryOne<{ like_count: number; user_id: number }>(
        'SELECT like_count, user_id FROM forum_comments WHERE id = ?', [id]
      );

      // Phase 2: 评论被点赞，给作者积分奖励（不能给自己点赞）
      if (updated && updated.user_id !== userId) {
        const availablePoints = await getAvailableReward(updated.user_id, 'comment_liked', POINT_REWARDS.comment_liked);
        if (availablePoints > 0) {
          await changePoints({
            userId: updated.user_id,
            amount: availablePoints,
            reason: 'comment_liked',
            description: `评论被点赞奖励 ${availablePoints} 积分`,
          });
        }
      }

      return res.json({ liked: true, like_count: updated?.like_count ?? 0 });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 签到 ─────────────────────────────────────────────────────────────────────

// 里程碑配置（天数: 奖励积分）
const SIGN_MILESTONES: Record<number, number> = {
  7: 50,
  30: 200,
  100: 500,
};

const SIGN_IN_CONFIG = {
  base_points: 1,
  repeated_day_base_points: 2,
  consecutive_bonus_max: 3,
  max_points_per_day: 5,
  milestones: Object.entries(SIGN_MILESTONES)
    .map(([days, points]) => ({ days: Number(days), points }))
    .sort((a, b) => a.days - b.days),
  description: '首日签到 1 积分；连续签到次日起额外加分，单日最高可得 5 积分'
} as const;

// 检查并发放里程碑奖励
async function checkAndGrantMilestone(db: ReturnType<typeof getForumDatabaseClient>, userId: number, consecutiveDays: number): Promise<{ milestone: number; points: number } | null> {
  for (const [days, points] of Object.entries(SIGN_MILESTONES)) {
    const milestone = parseInt(days);
    if (consecutiveDays === milestone) {
      // 使用本地时区的今天（与签到表一致）
      const todayLocal = getLocalDateString();
      const existing = await db.queryOne<{ id: number }>(
        'SELECT id FROM forum_point_transactions WHERE user_id = ? AND reason = ? AND DATE(created_at) = ?',
        [userId, 'sign_in_milestone', todayLocal]
      );
      if (!existing) {
        await changePoints({
          userId,
          amount: points,
          reason: 'sign_in_milestone',
          description: `连续签到 ${milestone} 天里程碑奖励 ${points} 积分`,
        });
        return { milestone, points };
      }
    }
  }
  return null;
}

async function calcConsecutiveDays(db: ReturnType<typeof getForumDatabaseClient>, userId: number): Promise<number> {
  // 统一使用本地时区（Asia/Shanghai）
  const today = getLocalDateString();
  const todaySign = await db.queryOne<{ id: number }>(
    'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
    [userId, today]
  );
  let consecutiveDays = 0;
  if (!todaySign) {
    // 今天未签到，从昨天开始向前追溯
    const yesterday = new Date(getLocalDate().getTime() - 86400000);
    const yesterdayStr = toDateString(yesterday);
    const yesterdaySign = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [userId, yesterdayStr]
    );
    if (yesterdaySign) {
      let checkDate = new Date(yesterday);
      while (true) {
        const dateStr = toDateString(checkDate);
        const row = await db.queryOne<{ id: number }>(
          'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
          [userId, dateStr]
        );
        if (!row) break;
        consecutiveDays++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }
  } else {
    // 今天已签到，从今天开始向前追溯
    let checkDate = getLocalDate();
    while (true) {
      const dateStr = toDateString(checkDate);
      const row = await db.queryOne<{ id: number }>(
        'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
        [userId, dateStr]
      );
      if (!row) break;
      consecutiveDays++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }
  return consecutiveDays;
}

// GET /api/forum/sign-in/status
router.get('/forum/sign-in/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    // 统一使用本地时区
    const today = getLocalDateString();

    const todaySign = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [req.user!.id, today]
    );

    const consecutiveDays = await calcConsecutiveDays(db, req.user!.id);

    const pointsRow = await db.queryOne<{ total_points: number }>(
      'SELECT total_points FROM forum_user_points WHERE user_id = ?',
      [req.user!.id]
    );

    res.json({
      signed_today: !!todaySign,
      consecutive_days: consecutiveDays,
      total_points: pointsRow?.total_points ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/sign-in
router.post('/forum/sign-in', signInLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    // 统一使用本地时区
    const today = getLocalDateString();
    const userId = req.user!.id;

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [userId, today]
    );
    if (existing) return res.status(400).json({ error: '今天已签到' });

    // 计算连续签到天数（签到前）
    const consecutiveDaysBefore = await calcConsecutiveDays(db, userId);
    const consecutiveDaysAfter = consecutiveDaysBefore + 1;

    // 基础 1 分，连续签到额外奖励
    let signInPoints = 1;
    if (consecutiveDaysBefore > 0) {
      signInPoints = Math.min(signInPoints + 1, 5);
    }

    await db.execute(
      'INSERT INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, ?)',
      [userId, today, signInPoints]
    );

    // 1. 发放基础签到积分
    await changePoints({
      userId,
      amount: signInPoints,
      reason: 'sign_in',
      description: `每日签到获得 ${signInPoints} 积分`,
    });

    // 2. 连续签到额外奖励（从第2天起，每天额外给 1 分，上限 3 分）
    let streakPoints = 0;
    if (consecutiveDaysBefore > 0) {
      streakPoints = Math.min(consecutiveDaysAfter - 1, 3);
      if (streakPoints > 0) {
        await changePoints({
          userId,
          amount: streakPoints,
          reason: 'sign_in_streak',
          description: `连续签到 ${consecutiveDaysAfter} 天额外奖励 ${streakPoints} 积分`,
        });
      }
    }

    // 3. 检查里程碑奖励
    const milestoneReward = await checkAndGrantMilestone(db, userId, consecutiveDaysAfter);

    // 计算本次签到总积分
    const totalEarned = signInPoints + streakPoints + (milestoneReward?.points ?? 0);

    res.json({
      message: `签到成功，获得 ${totalEarned} 积分`,
      points_earned: totalEarned,
      consecutive_days: consecutiveDaysAfter,
      total_points: await getTotalPoints(userId),
      streak_points: streakPoints,
      milestone: milestoneReward ? { days: milestoneReward.milestone, points: milestoneReward.points } : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/points/transactions — 积分流水
router.get('/forum/points/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;
    const { records, total } = await getPointTransactions(req.user!.id, pageSize, offset);
    const totalPoints = await getTotalPoints(req.user!.id);
    res.json({ records, total, page: pageNum, page_size: pageSize, total_points: totalPoints });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分抽奖 ─────────────────────────────────────────────────────────────────

// 抽奖奖品配置
const LOTTERY_PRIZES = [
  { id: 1, name: '谢谢参与', points: 0, vip_days: 0, weight: 40 },
  { id: 2, name: '5 积分', points: 5, vip_days: 0, weight: 30 },
  { id: 3, name: '20 积分', points: 20, vip_days: 0, weight: 15 },
  { id: 4, name: '50 积分', points: 50, vip_days: 0, weight: 8 },
  { id: 5, name: '100 积分', points: 100, vip_days: 0, weight: 5 },
  { id: 6, name: 'VIP 1天', points: 0, vip_days: 1, weight: 2 },
];

const POINTS_EXCHANGE_CONFIG = {
  basic: { points: 500, vip_level: 'basic', duration_days: 30 },
  premium: { points: 1200, vip_level: 'premium', duration_days: 30 },
  ultimate: { points: 3000, vip_level: 'ultimate', duration_days: 30 },
} as const;

const DOWNLOAD_EXCHANGE_COST = 10;

function formatDateTime(date = new Date()) {
  return toDateTimeString(date);
}

async function getTodayLotteryCount(userId: number) {
  const db = getForumDatabaseClient();
  // 统一使用本地时区
  const today = getLocalDateString();
  const row = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM forum_point_transactions
     WHERE user_id = ?
       AND reason IN ('lottery_cost', 'lottery_participation', 'lottery')
       AND DATE(created_at) = ?`,
    [userId, today]
  );
  return row?.count ?? 0;
}

function resolveLevelByPoints(points: number) {
  let current = POINT_LEVEL_CONFIG[0];
  for (const lv of POINT_LEVEL_CONFIG) {
    if (points >= lv.min_points) current = lv;
  }
  return current;
}

async function getDailyLotteryChances(userId: number) {
  const totalPoints = await getTotalPoints(userId);
  return resolveLevelByPoints(totalPoints).lottery_daily_chances;
}

router.get('/forum/points/config', optionalAuth, async (req: AuthRequest, res) => {
  try {
    // 按当前用户积分等级返回每日抽奖次数（游客按最低等级展示）
    const dailyChances = req.user
      ? await getDailyLotteryChances(req.user.id)
      : POINT_LEVEL_CONFIG[0].lottery_daily_chances;
    res.json({
      levels: POINT_LEVEL_CONFIG,
      sign_in: SIGN_IN_CONFIG,
      lottery: {
        daily_chances: dailyChances,
        prizes: LOTTERY_PRIZES.map((prize) => ({
          id: prize.id,
          name: prize.name,
          points: prize.points,
          vip_days: prize.vip_days,
          rate: prize.weight,
        })),
      },
      exchange: {
        vip_plans: Object.entries(POINTS_EXCHANGE_CONFIG).map(([level, config]) => ({
          level,
          points: config.points,
          vip_level: config.vip_level,
          duration_days: config.duration_days,
        })),
        download_permission: {
          cost: DOWNLOAD_EXCHANGE_COST,
          description: '任意伴奏单次下载权限（可累积）',
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/lottery/status — 获取抽奖状态
router.get('/forum/lottery/status', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();

    // 已登录用户：按积分等级计算每日次数并扣除今日已用；游客无抽奖资格按最低等级展示
    const dailyChances = req.user
      ? await getDailyLotteryChances(req.user.id)
      : POINT_LEVEL_CONFIG[0].lottery_daily_chances;
    const usedToday = req.user ? await getTodayLotteryCount(req.user.id) : 0;
    const remainingChances = Math.max(0, dailyChances - usedToday);

    // 获取中奖记录（仅对已登录用户）
    let records: any[] = [];
    if (req.user) {
      records = await db.queryMany<{ id: number; prize_name: string; points: number; vip_days: number; created_at: string }>(
        `SELECT id, prize_name, points, vip_days, created_at
         FROM forum_lottery_records
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [req.user.id]
      );
    }

    res.json({
      remaining_chances: remainingChances,
      records,
      daily_chances: dailyChances,
      used_today: usedToday,
      prizes: LOTTERY_PRIZES.map((p) => ({
        id: p.id,
        name: p.name,
        points: p.points,
        vip_days: p.vip_days,
        rate: p.weight
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/lottery — 抽奖
router.post('/forum/lottery', lotteryLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const mainDb = getDatabaseClient();

    // 先扣除抽奖消耗的积分
    const lotteryCost = 5;
    const userPoints = await getTotalPoints(req.user!.id);
    if (userPoints < lotteryCost) {
      return res.status(400).json({ error: '积分不足，需要 5 积分才能抽奖' });
    }

    // 每日抽奖次数限制（按积分等级：毛胚/出道 1 次、炸场 2 次、厂牌 3 次、GOAT 5 次）
    const dailyChances = await getDailyLotteryChances(req.user!.id);
    const usedToday = await getTodayLotteryCount(req.user!.id);
    if (usedToday >= dailyChances) {
      return res.status(403).json({
        error: `今日抽奖次数已用完（${usedToday}/${dailyChances}）`,
        code: 'LOTTERY_DAILY_LIMIT_REACHED',
        daily_chances: dailyChances,
        used: usedToday,
        remaining: 0,
      });
    }

    await changePoints({
      userId: req.user!.id,
      amount: -lotteryCost,
      reason: 'lottery_cost',
      description: `抽奖消耗 ${lotteryCost} 积分`,
    });

    // 根据权重随机抽取奖品
    const totalWeight = LOTTERY_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedPrize = LOTTERY_PRIZES[0];

    for (const prize of LOTTERY_PRIZES) {
      rand -= prize.weight;
      if (rand <= 0) {
        selectedPrize = prize;
        break;
      }
    }

    // 测试钩子：仅 MOCK_PAYMENT_ENABLED=true（开发/测试环境）时，
    // 允许请求头 x-lottery-force-prize 指定奖品，用于确定性覆盖 VIP 天等低概率分支；
    // 生产环境没有该开关，此头会被忽略。
    if (process.env.MOCK_PAYMENT_ENABLED === 'true') {
      const forcedId = Number(req.headers['x-lottery-force-prize']);
      const forced = Number.isFinite(forcedId)
        ? LOTTERY_PRIZES.find((p) => p.id === forcedId)
        : undefined;
      if (forced) selectedPrize = forced;
    }

    // 记录中奖信息
    await db.execute(
      `INSERT INTO forum_lottery_records (user_id, prize_name, points, vip_days, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user!.id, selectedPrize.name, selectedPrize.points, selectedPrize.vip_days, formatDateTime()]
    );

    // 发放积分奖励（如果中奖，扣除消耗后实际到账）
    let newPoints = 0;
    if (selectedPrize.points > 0) {
      await changePoints({
        userId: req.user!.id,
        amount: selectedPrize.points,
        reason: 'lottery_reward',
        description: `抽奖获得 ${selectedPrize.points} 积分（扣除5积分入场费）`,
      });
      // 净获得 = 奖励 - 消耗
      newPoints = selectedPrize.points - lotteryCost;
    } else {
      // 没中奖，只显示消耗
      newPoints = -lotteryCost;
    }

    // 发放 VIP 天数
    if (selectedPrize.vip_days > 0) {
      // 更新 VIP 过期时间
      const user = await mainDb.queryOne<{ vip_expire_at: string | null }>(
        'SELECT vip_expire_at FROM users WHERE id = ?',
        [req.user!.id]
      );
      const now = new Date();
      let expireDate: Date;
      if (user?.vip_expire_at && new Date(user.vip_expire_at) > now) {
        expireDate = new Date(new Date(user.vip_expire_at).getTime() + selectedPrize.vip_days * 86400000);
      } else {
        expireDate = new Date(now.getTime() + selectedPrize.vip_days * 86400000);
      }
      await mainDb.execute(
        'UPDATE users SET vip_expire_at = ? WHERE id = ?',
        [formatDateTime(expireDate), req.user!.id]
      );
    }

    const totalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      prize: {
        id: selectedPrize.id,
        name: selectedPrize.name,
        points: selectedPrize.points,
        vip_days: selectedPrize.vip_days,
      },
      points_earned: newPoints,
      total_points: totalPoints,
      remaining_chances: Math.max(0, dailyChances - usedToday - 1),
      daily_chances: dailyChances,
      used_today: usedToday + 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分兑换 VIP ─────────────────────────────────────────────────────────────

// POST /api/forum/points/exchange — 积分兑换 VIP
router.post('/forum/points/exchange', exchangeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { level } = req.body as { level?: string };

    if (!level || !POINTS_EXCHANGE_CONFIG[level as keyof typeof POINTS_EXCHANGE_CONFIG]) {
      return res.status(400).json({ error: '无效的会员等级' });
    }

    const config = POINTS_EXCHANGE_CONFIG[level as keyof typeof POINTS_EXCHANGE_CONFIG];
    const db = getForumDatabaseClient();
    const mainDb = getDatabaseClient();

    // 检查积分是否足够
    const userPoints = await getTotalPoints(req.user!.id);
    if (userPoints < config.points) {
      return res.status(400).json({ error: `积分不足，需要 ${config.points} 积分，当前 ${userPoints} 积分` });
    }

    // 扣除积分
    await changePoints({
      userId: req.user!.id,
      amount: -config.points,
      reason: 'exchange',
      description: `积分兑换 ${config.duration_days} 天${level === 'basic' ? '基础' : level === 'premium' ? '高级' : '至尊'}会员`,
    });

    // 更新 VIP 状态
    const user = await mainDb.queryOne<{ vip_expire_at: string | null; vip_level: string | null }>(
      'SELECT vip_expire_at, vip_level FROM users WHERE id = ?',
      [req.user!.id]
    );
    const now = new Date();
    let expireDate: Date;
    if (user?.vip_expire_at && new Date(user.vip_expire_at) > now) {
      expireDate = new Date(new Date(user.vip_expire_at).getTime() + config.duration_days * 86400000);
    } else {
      expireDate = new Date(now.getTime() + config.duration_days * 86400000);
    }

    await mainDb.execute(
      'UPDATE users SET vip_level = ?, vip_expire_at = ? WHERE id = ?',
      [config.vip_level, formatDateTime(expireDate), req.user!.id]
    );
    invalidateVipCache(req.user!.id);

    const newTotalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      message: `成功兑换 ${config.duration_days} 天${level === 'basic' ? '基础' : level === 'premium' ? '高级' : '至尊'}会员`,
      points_spent: config.points,
      vip_level: config.vip_level,
      vip_expire_at: toDateTimeString(expireDate),
      total_points: newTotalPoints,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分兑换单次下载权限 ─────────────────────────────────────────────────────

// GET /api/forum/points/download-permission — 查询用户单次下载权限状态
router.get('/forum/points/download-permission', requireAuth, async (req: AuthRequest, res) => {
  try {
    const totalPoints = await getTotalPoints(req.user!.id);
    const db = getForumDatabaseClient();

    // 查询用户已购买的下载权限次数（每次兑换生成一条记录）
    const purchased = await db.queryMany<{ id: number }>(
      'SELECT id FROM forum_point_download_permissions WHERE user_id = ? AND used = 0',
      [req.user!.id]
    );

    res.json({
      total_points: totalPoints,
      remaining_permissions: purchased.length,
      exchange_cost: DOWNLOAD_EXCHANGE_COST,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/points/exchange-download — 积分兑换单次下载权限
router.post('/forum/points/exchange-download', exchangeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const cost = DOWNLOAD_EXCHANGE_COST;

    // 1. 检查积分是否足够
    const userPoints = await getTotalPoints(req.user!.id);
    if (userPoints < cost) {
      return res.status(400).json({
        error: `积分不足，需要 ${cost} 积分，当前 ${userPoints} 积分`,
        code: 'INSUFFICIENT_POINTS'
      });
    }

    // 2. 扣除积分
    await changePoints({
      userId: req.user!.id,
      amount: -cost,
      reason: 'exchange',
      description: `积分兑换单次下载权限`,
    });

    // 3. 写入下载权限记录
    await db.execute(
      'INSERT INTO forum_point_download_permissions (user_id, created_at) VALUES (?, ?)',
      [req.user!.id, formatDateTime()]
    );

    const newTotalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      message: `成功兑换 1 次下载权限`,
      points_spent: cost,
      remaining_points: newTotalPoints,
      remaining_permissions: 1, // 本次兑换后至少有 1 次
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 我的帖子 ─────────────────────────────────────────────────────────────────

// GET /api/forum/my-posts — 当前用户发布的帖子
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

// ════════════════════════════════════════════════════════════════════════════════
// 私信功能
// ════════════════════════════════════════════════════════════════════════════════

interface ForumMessage {
  id: number;
  conversation_id: string;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'system';
  is_read: number;
  created_at: Date;
}

interface ForumConversation {
  id: string;
  participant_a: number;
  participant_b: number;
  last_message_content: string;
  last_message_at: Date;
  unread_count_a: number;
  unread_count_b: number;
  created_at: Date;
  updated_at: Date;
}

// 生成会话 ID：确保同一对用户只有一个会话
function generateConversationId(userId1: number, userId2: number): string {
  const a = Math.min(userId1, userId2);
  const b = Math.max(userId1, userId2);
  return `${a}_${b}`;
}

// 获取会话的另一个参与者信息
async function getOtherParticipant(conversation: ForumConversation, currentUserId: number, mainDb: ReturnType<typeof getDatabaseClient>): Promise<{ id: number; username: string; avatar_url: string } | null> {
  const otherId = conversation.participant_a === currentUserId ? conversation.participant_b : conversation.participant_a;
  return (await mainDb.queryOne<{ id: number; username: string; avatar_url: string }>(
    'SELECT id, username, avatar_url FROM users WHERE id = ?',
    [otherId]
  )) ?? null;
}

// 获取会话列表
router.get('/forum/messages/conversations', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;

  const conversations = await db.queryMany<ForumConversation>(
    `SELECT * FROM forum_conversations
     WHERE participant_a = ? OR participant_b = ?
     ORDER BY last_message_at DESC`,
    [userId, userId]
  );

  const result = await Promise.all(conversations.map(async (conv) => {
    const other = await getOtherParticipant(conv, userId, mainDb);
    const unreadCount = conv.participant_a === userId ? conv.unread_count_a : conv.unread_count_b;
    return {
      id: conv.id,
      other_user: other,
      last_message_content: conv.last_message_content,
      last_message_at: conv.last_message_at,
      unread_count: unreadCount,
    };
  }));

  res.json({ conversations: result });
});

// 创建/确保会话存在（不发送消息，用于从外部跳转私信时预创建会话）
router.post('/forum/messages/conversations', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const currentUserId = req.user!.id;
  const { receiver_id } = req.body as { receiver_id?: number };

  if (!receiver_id || !Number.isInteger(receiver_id) || receiver_id <= 0) {
    return res.status(400).json({ error: '无效的 receiver_id' });
  }

  if (receiver_id === currentUserId) {
    return res.status(400).json({ error: '不能和自己私信' });
  }

  // 检查对方是否存在
  const receiver = await mainDb.queryOne<{ id: number; username: string }>(
    'SELECT id, username FROM users WHERE id = ?',
    [receiver_id]
  );
  if (!receiver) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 检查拉黑关系
  const blockCheck = await mainDb.queryOne<{ blocked_by_me: number; blocked_me: number }>(
    `SELECT
       (SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1) AS blocked_by_me,
       (SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1) AS blocked_me`,
    [currentUserId, receiver_id, receiver_id, currentUserId]
  );

  if (blockCheck?.blocked_by_me) {
    return res.status(403).json({ error: '你已拉黑该用户，无法发起私信' });
  }
  if (blockCheck?.blocked_me) {
    return res.status(403).json({ error: '你已被对方拉黑，无法发起私信' });
  }

  // 确保会话存在
  const conversationId = generateConversationId(currentUserId, receiver_id);
  let conversation = await db.queryOne<ForumConversation>(
    'SELECT * FROM forum_conversations WHERE id = ?',
    [conversationId]
  );

  if (!conversation) {
    await db.execute(
      'INSERT INTO forum_conversations (id, participant_a, participant_b, last_message_content, last_message_at) VALUES (?, ?, ?, ?, NOW())',
      [conversationId, Math.min(currentUserId, receiver_id), Math.max(currentUserId, receiver_id), '']
    );
    conversation = await db.queryOne<ForumConversation>(
      'SELECT * FROM forum_conversations WHERE id = ?',
      [conversationId]
    );
  }

  const unreadCount = conversation!.participant_a === currentUserId
    ? conversation!.unread_count_a
    : conversation!.unread_count_b;

  res.json({
    id: conversation!.id,
    other_user: { id: receiver.id, username: receiver.username, avatar_url: null },
    last_message_content: conversation!.last_message_content || '',
    last_message_at: conversation!.last_message_at,
    unread_count: unreadCount,
  });
});

// 获取未读消息总数（必须在 :conversationId 之前）
router.get('/forum/messages/unread-count', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;

  const result = await db.queryOne<{ total: number }>(
    `SELECT CAST(COALESCE(SUM(
      CASE WHEN participant_a = ? THEN unread_count_a ELSE unread_count_b END
    ), 0) AS SIGNED) as total
    FROM forum_conversations
    WHERE participant_a = ? OR participant_b = ?`,
    [userId, userId, userId]
  );

  res.json({ unread_count: Number(result?.total ?? 0) });
});

// 实时私信推送（SSE）—— 必须注册在 /:conversationId 之前，否则 stream 会被当作会话 ID
// 鉴权用 ?token= query（EventSource 不支持自定义请求头）
router.get('/forum/messages/stream', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  addClient(userId, res);

  // 客户端断开连接时清理，避免内存泄漏与向已关闭的 res 写入
  req.on('close', () => {
    removeClient(userId, res);
  });
});

// 获取某个会话的消息列表
router.get('/forum/messages/:conversationId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const { conversationId } = req.params;
  const userId = req.user!.id;
  const { page = '1', page_size = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  // 验证用户是该会话的参与者
  const conversation = await db.queryOne<ForumConversation>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 获取消息
  const messages = await db.queryMany<ForumMessage>(
    `SELECT * FROM forum_messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [conversationId, pageSize, offset]
  );

  // 统计总消息数
  const [{ count }] = await db.queryMany<{ count: number }>(
    'SELECT COUNT(*) as count FROM forum_messages WHERE conversation_id = ?',
    [conversationId]
  );

  // 使用 mainDb 获取发送者信息
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  const senders = senderIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${senderIds.map(() => '?').join(',')})`,
        senderIds
      )
    : [];
  const senderMap = new Map(senders.map(s => [s.id, s]));

  const enrichedMessages = messages.map(m => ({
    ...m,
    sender_username: senderMap.get(m.sender_id)?.username,
    sender_avatar: senderMap.get(m.sender_id)?.avatar_url,
  }));

  res.json({
    messages: enrichedMessages.reverse(), // 按时间正序
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total: count,
      total_pages: Math.ceil(count / pageSize),
    },
  });
});

// 发送私信
router.post('/forum/messages', requireAuth, messageLimiter, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const senderId = req.user!.id;
  const { receiver_id, content, message_type = 'text' } = req.body as {
    receiver_id?: number;
    content?: string;
    message_type?: 'text' | 'image';
  };

  if (!receiver_id || !content?.trim()) {
    return res.status(400).json({ error: '请填写收件人和内容' });
  }

  if (senderId === receiver_id) {
    return res.status(400).json({ error: '不能给自己发私信' });
  }

  // 验证收件人存在
  const receiver = await mainDb.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [receiver_id]);
  if (!receiver) {
    return res.status(404).json({ error: '收件人不存在' });
  }

  // 黑名单检查：被对方拉黑或我已拉黑对方都不能发
  const blocked = await db.queryOne<{ user_id: number }>(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [receiver_id, senderId]
  );
  if (blocked) {
    return res.status(403).json({ error: '你已被对方拉黑，无法发送消息' });
  }
  const blockedByMe = await db.queryOne<{ user_id: number }>(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [senderId, receiver_id]
  );
  if (blockedByMe) {
    return res.status(403).json({ error: '你已拉黑该用户，无法发送消息' });
  }

  // 关注关系检查：互不关注时新消息最多 1 条
  const [iFollow, theyFollow] = await Promise.all([
    db.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [senderId, receiver_id]
    ),
    db.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [receiver_id, senderId]
    ),
  ]);

  if (!iFollow && !theyFollow) {
    const conversationId = generateConversationId(senderId, receiver_id);
    const theirReply = await db.queryOne<{ id: number }>(
      `SELECT id FROM forum_messages
       WHERE conversation_id = ? AND sender_id = ? AND message_type = 'text' LIMIT 1`,
      [conversationId, receiver_id]
    );
    const myTextCount = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM forum_messages
       WHERE conversation_id = ? AND sender_id = ? AND message_type = 'text'`,
      [conversationId, senderId]
    );
    if (!theirReply && (myTextCount?.c || 0) >= 1) {
      return res.status(429).json({
        error: '由于对方并未关注你，在收到对方回复之前，你最多只能发送 1 条文字消息',
      });
    }
  }

  const conversationId = generateConversationId(senderId, receiver_id);

  // 获取或创建会话
  let conversation = await db.queryOne<ForumConversation>(
    'SELECT * FROM forum_conversations WHERE id = ?',
    [conversationId]
  );

  if (!conversation) {
    await db.execute(
      'INSERT INTO forum_conversations (id, participant_a, participant_b, last_message_content, last_message_at) VALUES (?, ?, ?, ?, NOW())',
      [conversationId, Math.min(senderId, receiver_id), Math.max(senderId, receiver_id), content.slice(0, 200)]
    );
    conversation = await db.queryOne<ForumConversation>(
      'SELECT * FROM forum_conversations WHERE id = ?',
      [conversationId]
    );
  } else {
    // 更新会话
    await db.execute(
      'UPDATE forum_conversations SET last_message_content = ?, last_message_at = NOW() WHERE id = ?',
      [content.slice(0, 200), conversationId]
    );
  }

  // 插入消息
  const result = await db.execute(
    'INSERT INTO forum_messages (conversation_id, sender_id, receiver_id, content, message_type) VALUES (?, ?, ?, ?, ?)',
    [conversationId, senderId, receiver_id, content, message_type]
  );

  // 更新未读计数
  const isSenderA = conversation!.participant_a === senderId;
  const unreadField = isSenderA ? 'unread_count_b' : 'unread_count_a';
  await db.execute(
    `UPDATE forum_conversations SET ${unreadField} = ${unreadField} + 1 WHERE id = ?`,
    [conversationId]
  );

  const message = await db.queryOne<ForumMessage>(
    'SELECT * FROM forum_messages WHERE id = ?',
    [(result as any).insertId]
  );

  // 实时推送：向在线接收者推送新消息事件（SSE）
  // 附带发送者信息，便于前端直接渲染气泡，无需二次查询
  if (message) {
    const senderInfo = await mainDb.queryOne<{ username: string; avatar_url: string }>(
      'SELECT username, avatar_url FROM users WHERE id = ?',
      [senderId]
    );
    const enrichedMessage = {
      ...message,
      sender_username: senderInfo?.username,
      sender_avatar: senderInfo?.avatar_url,
    };
    pushToUser(receiver_id, 'message', {
      conversation_id: conversationId,
      sender_id: senderId,
      sender_username: senderInfo?.username,
      sender_avatar: senderInfo?.avatar_url,
      message: enrichedMessage,
    });
    res.status(201).json({ message: enrichedMessage });
  } else {
    res.status(201).json({ message });
  }
});

// 标记会话已读
router.put('/forum/messages/:conversationId/read', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const { conversationId } = req.params;
  const userId = req.user!.id;

  // 验证用户是该会话的参与者
  const conversation = await db.queryOne<ForumConversation>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 标记所有消息为已读
  await db.execute(
    'UPDATE forum_messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0',
    [conversationId, userId]
  );

  // 重置未读计数
  const isSenderA = conversation.participant_a === userId;
  const unreadField = isSenderA ? 'unread_count_a' : 'unread_count_b';
  await db.execute(
    `UPDATE forum_conversations SET ${unreadField} = 0 WHERE id = ?`,
    [conversationId]
  );

  res.json({ success: true });
});

// 删除会话（自己侧）
router.delete('/forum/messages/:conversationId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const raw = req.params.conversationId;
  const conversationId = decodeURIComponent(Array.isArray(raw) ? raw[0] : raw);

  const conversation = await db.queryOne<ForumConversation>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 删除会话（消息级联删除由 FK ON DELETE CASCADE 处理）
  await db.execute('DELETE FROM forum_conversations WHERE id = ?', [conversationId]);

  res.json({ success: true });
});

// 拉黑用户
router.post('/forum/blocks/:userId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }
  if (userId === targetId) {
    return res.status(400).json({ error: '不能拉黑自己' });
  }

  const existing = await db.queryOne(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [userId, targetId]
  );
  if (existing) {
    return res.json({ success: true, already: true });
  }

  await db.execute(
    'INSERT INTO forum_blocks (user_id, blocked_user_id) VALUES (?, ?)',
    [userId, targetId]
  );
  res.json({ success: true });
});

// 取消拉黑
router.delete('/forum/blocks/:userId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  await db.execute(
    'DELETE FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [userId, targetId]
  );
  res.json({ success: true });
});

// 检查我对某用户的拉黑状态
router.get('/forum/blocks/:userId/status', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const targetId = parseInt(
    Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId
  );

  if (isNaN(targetId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [blockedByMe, blockedMe] = await Promise.all([
    db.queryOne<{ user_id: number }>(
      'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
      [userId, targetId]
    ),
    db.queryOne<{ user_id: number }>(
      'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
      [targetId, userId]
    ),
  ]);

  res.json({
    blocked_by_me: !!blockedByMe,
    blocked_me: !!blockedMe,
  });
});

// 拉黑列表
router.get('/forum/blocks', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;

  const blocks = await db.queryMany<{ blocked_user_id: number; created_at: Date }>(
    'SELECT blocked_user_id, created_at FROM forum_blocks WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  if (blocks.length === 0) {
    return res.json({ users: [] });
  }

  const userIds = blocks.map((b) => b.blocked_user_id);
  const placeholders = userIds.map(() => '?').join(',');
  const users = await mainDb.queryMany<{ id: number; username: string; avatar_url: string | null }>(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${placeholders})`,
    userIds
  );

  res.json({ users });
});

// ════════════════════════════════════════════════════════════════════════════════
// 用户资料与关注功能
// ════════════════════════════════════════════════════════════════════════════════

interface ForumUserProfile {
  user_id: number;
  bio: string;
  location: string;
  website: string;
  social_links: string;
  post_count: number;
  follower_count: number;
  following_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ForumUser {
  id: number;
  username: string;
  avatar_url: string;
  email?: string;
  role?: string;
  vip_level?: string;
  forum_profile?: ForumUserProfile;
}

// 获取用户资料
router.get('/forum/users/:userId', async (req, res) => {
  const mainDb = getDatabaseClient();
  const forumDb = getForumDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const user = await mainDb.queryOne<Omit<ForumUser, 'forum_profile'>>(
    'SELECT id, username, avatar_url FROM users WHERE id = ?',
    [userIdNum]
  );

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 获取论坛资料
  let profile = await forumDb.queryOne<ForumUserProfile>(
    'SELECT * FROM forum_user_profiles WHERE user_id = ?',
    [userIdNum]
  );

  // 如果没有资料，创建一个默认的
  if (!profile) {
    await forumDb.execute(
      'INSERT INTO forum_user_profiles (user_id) VALUES (?)',
      [userIdNum]
    );
    profile = await forumDb.queryOne<ForumUserProfile>(
      'SELECT * FROM forum_user_profiles WHERE user_id = ?',
      [userIdNum]
    );
  }

  res.json({
    user: {
      ...user,
      forum_profile: {
        ...profile,
        social_links: profile?.social_links ? JSON.parse(profile.social_links as unknown as string) : {},
      },
    },
  });
});

// 更新当前用户资料
router.put('/forum/users/profile', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const userId = req.user!.id;
  const { bio, location, website, social_links } = req.body as {
    bio?: string;
    location?: string;
    website?: string;
    social_links?: Record<string, string>;
  };

  // 验证字段长度
  if (bio && bio.length > 500) {
    return res.status(400).json({ error: '简介不能超过500字' });
  }
  if (location && location.length > 100) {
    return res.status(400).json({ error: '所在地不能超过100字' });
  }
  if (website && website.length > 255) {
    return res.status(400).json({ error: '个人网站不能超过255字' });
  }

  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, bio, location, website, social_links)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       bio = COALESCE(?, bio),
       location = COALESCE(?, location),
       website = COALESCE(?, website),
       social_links = COALESCE(?, social_links)`,
    [userId, bio || null, location || null, website || null, social_links ? JSON.stringify(social_links) : null, bio, location, website, social_links ? JSON.stringify(social_links) : null]
  );

  const profile = await forumDb.queryOne<ForumUserProfile>(
    'SELECT * FROM forum_user_profiles WHERE user_id = ?',
    [userId]
  );

  res.json({
    profile: {
      ...profile,
      social_links: profile?.social_links ? JSON.parse(profile.social_links as unknown as string) : {},
    },
  });
});

// 获取用户发布的帖子列表
router.get('/forum/users/:userId/posts', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_posts WHERE user_id = ? AND status = ?',
    [userIdNum, 'published']
  );

  const posts = await forumDb.queryMany<any>(
    `SELECT fp.*, fc.name as category_name, fc.slug as category_slug
     FROM forum_posts fp
     LEFT JOIN forum_categories fc ON fp.category_id = fc.id
     WHERE fp.user_id = ? AND fp.status = 'published'
     ORDER BY fp.created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 补充用户信息
  const enrichedPosts = await enrichWithUsers(posts, mainDb);

  res.json({
    posts: enrichedPosts,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// 关注用户
router.post('/forum/users/:userId/follow', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  if (followerId === followingId) {
    return res.status(400).json({ error: '不能关注自己' });
  }

  // 验证目标用户存在
  const targetUser = await mainDb.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [followingId]);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 黑名单检查：任一方拉黑另一方则不能关注
  const blocked = await forumDb.queryOne<{ user_id: number }>(
    `SELECT user_id FROM forum_blocks
     WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)`,
    [followerId, followingId, followingId, followerId]
  );
  if (blocked) {
    return res.status(403).json({ error: '由于拉黑关系，无法关注该用户' });
  }

  // 检查是否已关注
  const existing = await forumDb.queryOne<{ follower_id: number }>(
    'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  if (existing) {
    return res.status(409).json({ error: '已经关注过了' });
  }

  // 创建关注关系
  await forumDb.execute(
    'INSERT INTO forum_follows (follower_id, following_id) VALUES (?, ?)',
    [followerId, followingId]
  );

  // 更新关注数和粉丝数（INSERT OR UPDATE 确保 profile 存在）
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, following_count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE following_count = following_count + 1`,
    [followerId]
  );
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, follower_count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE follower_count = follower_count + 1`,
    [followingId]
  );

  res.status(201).json({ success: true, message: '关注成功' });
});

// 取消关注
router.delete('/forum/users/:userId/follow', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  // 检查是否有关注关系
  const existing = await forumDb.queryOne<{ follower_id: number }>(
    'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  if (!existing) {
    return res.status(404).json({ error: '未关注该用户' });
  }

  // 删除关注关系
  await forumDb.execute(
    'DELETE FROM forum_follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );

  // 更新关注数和粉丝数（INSERT OR UPDATE 确保 profile 存在，COALESCE 防负数）
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, following_count) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE following_count = GREATEST(0, following_count - 1)`,
    [followerId]
  );
  await forumDb.execute(
    `INSERT INTO forum_user_profiles (user_id, follower_count) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE follower_count = GREATEST(0, follower_count - 1)`,
    [followingId]
  );

  res.json({ success: true, message: '已取消关注' });
});

// 检查关注状态
router.get('/forum/users/:userId/follow-status', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const followerId = req.user!.id;
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const followingId = parseInt(userIdParam);
  if (isNaN(followingId)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [isFollowing, isFollowedBy] = await Promise.all([
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    ),
    forumDb.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [followingId, followerId]
    ),
  ]);

  res.json({
    is_following: !!isFollowing,
    is_followed_by: !!isFollowedBy,
  });
});

// 获取用户粉丝列表
router.get('/forum/users/:userId/followers', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_follows WHERE following_id = ?',
    [userIdNum]
  );

  const followers = await forumDb.queryMany<{ follower_id: number; created_at: Date }>(
    `SELECT follower_id, created_at FROM forum_follows
     WHERE following_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 获取用户信息
  const userIds = followers.map(f => f.follower_id);
  const users = userIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      )
    : [];

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = followers.map(f => ({
    ...userMap.get(f.follower_id),
    followed_at: f.created_at,
  }));

  res.json({
    followers: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// 获取用户关注列表
router.get('/forum/users/:userId/followings', async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userIdParam = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  const userIdNum = parseInt(userIdParam);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    'SELECT COUNT(*) as total FROM forum_follows WHERE follower_id = ?',
    [userIdNum]
  );

  const followings = await forumDb.queryMany<{ following_id: number; created_at: Date }>(
    `SELECT following_id, created_at FROM forum_follows
     WHERE follower_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userIdNum, pageSize, offset]
  );

  // 获取用户信息
  const userIds = followings.map(f => f.following_id);
  const users = userIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      )
    : [];

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = followings.map(f => ({
    ...userMap.get(f.following_id),
    followed_at: f.created_at,
  }));

  res.json({
    followings: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

// GET /api/forum/friends — 获取互相关注的好友列表
router.get('/forum/friends', requireAuth, async (req: AuthRequest, res) => {
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;
  const { page = '1', page_size = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  // 互相关注：A 关注 B 且 B 关注 A
  const [{ total }] = await forumDb.queryMany<{ total: number }>(
    `SELECT COUNT(*) as total
     FROM forum_follows f1
     JOIN forum_follows f2
       ON f1.following_id = f2.follower_id
      AND f2.following_id = f1.follower_id
     WHERE f1.follower_id = ?`,
    [userId]
  );

  const friends = await forumDb.queryMany<{ following_id: number; followed_at: Date }>(
    `SELECT f1.following_id, f1.created_at as followed_at
     FROM forum_follows f1
     JOIN forum_follows f2
       ON f1.following_id = f2.follower_id
      AND f2.following_id = f1.follower_id
     WHERE f1.follower_id = ?
     ORDER BY f1.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, pageSize, offset]
  );

  if (friends.length === 0) {
    return res.json({ friends: [], pagination: { page: pageNum, page_size: pageSize, total: 0, total_pages: 0 } });
  }

  const userIds = friends.map(f => f.following_id);
  const users = await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
    userIds
  );

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = friends.map(f => ({
    ...userMap.get(f.following_id),
    followed_at: f.followed_at,
  }));

  res.json({
    friends: result,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
});

export default router;
