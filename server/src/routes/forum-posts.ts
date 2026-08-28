import {
  createForumRouter,
  getForumDatabaseClient,
  getDatabaseClient,
  getMembershipDatabaseClient,
  requireAuth,
  optionalAuth,
  type AuthRequest,
  changePoints,
  POINT_REWARDS,
  getAvailableReward,
  getLocalDate,
  getLocalDateString,
  toDateTimeString,
  toDateString,
  sanitizeHtml,
  escapeHtmlContent,
  enrichWithUsers,
  formatDate,
  postLimiter,
  likeLimiter,
  commentLimiter,
  type ForumPost,
  type ForumTopic,
  type ForumCategoryRow,
  type ForumComment,
} from './forum-common.js';
import { createNotification } from './forum-notifications-helper.js';
import fs from 'fs';

const router = createForumRouter();

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
    }

    try {
      await db.execute('INSERT INTO forum_likes (user_id, post_id) VALUES (?, ?)', [userId, id]);
    } catch (insertErr: any) {
      // 并发：SELECT 与 INSERT 间隙另一请求先完成（已插入），此时 UNIQUE 报 1062，视为“已存在→取消点赞”语义
      if (insertErr?.code === 'ER_DUP_ENTRY' || Number(insertErr?.errno) === 1062) {
        await db.execute('DELETE FROM forum_likes WHERE user_id = ? AND post_id = ?', [userId, id]);
        await db.execute('UPDATE forum_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [id]);
        const post = await db.queryOne<{ like_count: number }>('SELECT like_count FROM forum_posts WHERE id = ?', [id]);
        return res.json({ liked: false, like_count: post?.like_count ?? 0 });
      }
      throw insertErr;
    }

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

      // 发送点赞通知
      await createNotification(post.user_id, 'like_post', userId, 'post', parseInt(id as string));
    }

    return res.json({ liked: true, like_count: post?.like_count ?? 0 });
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
    }

    try {
      await db.execute('INSERT INTO forum_favorites (user_id, post_id) VALUES (?, ?)', [userId, id]);
    } catch (insertErr: any) {
      // 并发冲突：另一请求先收藏，这里幂等切换到取消
      if (insertErr?.code === 'ER_DUP_ENTRY' || Number(insertErr?.errno) === 1062) {
        await db.execute('DELETE FROM forum_favorites WHERE user_id = ? AND post_id = ?', [userId, id]);
        return res.json({ favorited: false });
      }
      throw insertErr;
    }

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

    // 获取帖子标题用于通知
    const postInfo = await db.queryOne<{ title: string; user_id: number }>(
      'SELECT title, user_id FROM forum_posts WHERE id = ?',
      [id]
    );

    // 通知帖子作者（如果是顶层评论且不是自己发的）
    if (!parent_id && postInfo && postInfo.user_id !== req.user!.id) {
      await createNotification(postInfo.user_id, 'comment', req.user!.id, 'post', parseInt(id as string), postInfo.title);
    }

    // 通知被回复的评论作者（如果是回复评论且不是自己发的）
    if (parent_id) {
      const parentComment = await db.queryOne<{ user_id: number }>(
        'SELECT user_id FROM forum_comments WHERE id = ?',
        [parent_id]
      );
      if (parentComment && parentComment.user_id !== req.user!.id) {
        await createNotification(parentComment.user_id, 'comment', req.user!.id, 'comment', parseInt(id as string), postInfo?.title);
      }
    }

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
    }

    // 点赞（并发下若被 UNIQUE 拦截 → 视为切换语义：取消点赞）
    try {
      await db.execute('INSERT INTO forum_comment_likes (user_id, comment_id) VALUES (?, ?)', [userId, id]);
    } catch (insertErr: any) {
      if (insertErr?.code === 'ER_DUP_ENTRY' || Number(insertErr?.errno) === 1062) {
        await db.execute('DELETE FROM forum_comment_likes WHERE user_id = ? AND comment_id = ?', [userId, id]);
        await db.execute('UPDATE forum_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [id]);
        const updated = await db.queryOne<{ like_count: number }>('SELECT like_count FROM forum_comments WHERE id = ?', [id]);
        return res.json({ liked: false, like_count: updated?.like_count ?? 0 });
      }
      throw insertErr;
    }

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

      // 发送评论点赞通知
      await createNotification(updated.user_id, 'like_comment', userId, 'comment', parseInt(id as string));
    }

    return res.json({ liked: true, like_count: updated?.like_count ?? 0 });
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
      // milestone 写在 point_transactions(积分流水表),已迁移到 membershipDb
      const membershipDb = getMembershipDatabaseClient();
      const existing = await membershipDb.queryOne<{ id: number }>(
        'SELECT id FROM point_transactions WHERE user_id = ? AND reason = ? AND DATE(created_at) = ?',
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

export default router;
