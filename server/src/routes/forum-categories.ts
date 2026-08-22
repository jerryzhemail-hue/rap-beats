import { createForumRouter, getForumDatabaseClient, requireAuth, type AuthRequest, suggestTopics, type ImageAnalysisResult, type ForumCategoryRow, type ForumTopic } from './forum-common.js';
import fs from 'fs';

const router = createForumRouter();

router.get('/forum/categories', async (_req, res) => {
  try {
    const db = getForumDatabaseClient();
    const categories = await db.queryMany<ForumCategoryRow>(
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

export default router;
