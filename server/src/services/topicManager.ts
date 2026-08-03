/**
 * 话题管理器
 * 提供 findOrCreateTopic：从数据库查找或创建话题（按版块限定）
 * 以及各版块的动态话题映射配置
 */

import { getForumDatabaseClient } from '../database/client.js';

export interface TopicInfo {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  source: 'preset' | 'dynamic'; // preset = 数据库已有，dynamic = 动态创建
}

// 各版块专属话题配置（用于动态创建）
// category_id: 2=创作 3=免费Beat分享 5=新人报道 7=说唱巅峰对决2026 8=涂鸦 9=说唱 HIT-SONG 10=说唱
export const CATEGORY_TOPIC_MAP: Record<number, Record<string, { name: string; slug: string }>> = {
  // 创作
  2: {
    lyrics: { name: '歌词分享', slug: 'lyrics' },
    freestyle: { name: 'Freestyle', slug: 'freestyle' },
    technique: { name: '说唱技巧', slug: 'technique' },
    'beat-review': { name: 'Beat鉴赏', slug: 'beat-review' },
  },
  // 免费Beat分享
  3: {
    'beat-review': { name: 'Beat鉴赏', slug: 'beat-review' },
    'beat-production': { name: 'Beat制作', slug: 'beat-production' },
  },
  // 新人报道
  5: {
    newbie: { name: '新人报到', slug: 'newbie' },
  },
  // 说唱巅峰对决2026
  7: {
    'rap-battle': { name: '选手讨论', slug: 'rap-battle' },
    'battle-analysis': { name: '对决解析', slug: 'battle-analysis' },
    'performance': { name: '舞台表现', slug: 'performance' },
  },
  // 涂鸦
  8: {
    graffiti: { name: '涂鸦插画', slug: 'graffiti' },
    'street-art': { name: '街头艺术', slug: 'street-art' },
    illustration: { name: '插画分享', slug: 'illustration' },
  },
  // 说唱 HIT-SONG
  9: {
    'hit-song': { name: 'HIT-SONG赏析', slug: 'hit-song' },
    'classic-tracks': { name: '经典曲目', slug: 'classic-tracks' },
  },
  // 说唱
  10: {
    technique: { name: '说唱技巧', slug: 'technique' },
    lyrics: { name: '歌词分享', slug: 'lyrics' },
    'beat-review': { name: 'Beat鉴赏', slug: 'beat-review' },
    'genre-talk': { name: '音乐风格', slug: 'genre-talk' },
    'chinese-rap': { name: '中文说唱', slug: 'chinese-rap' },
    emotion: { name: '情感说唱', slug: 'emotion' },
  },
};

// 从 slug 获取话题配置（仅限当前版块）
function getTopicConfig(slug: string, categoryId: number): { name: string; slug: string } | null {
  const catTopics = CATEGORY_TOPIC_MAP[categoryId];
  if (catTopics && catTopics[slug]) return catTopics[slug];

  // 兜底：只允许通用 slug
  const fallback: Record<string, { name: string; slug: string }> = {
    emotion: { name: '心情/情感', slug: 'emotion' },
    newbie: { name: '新人报到', slug: 'newbie' },
    technique: { name: '说唱技巧', slug: 'technique' },
    lyrics: { name: '歌词分享', slug: 'lyrics' },
    freestyle: { name: 'Freestyle', slug: 'freestyle' },
    'beat-review': { name: 'Beat鉴赏', slug: 'beat-review' },
    graffiti: { name: '涂鸦插画', slug: 'graffiti' },
    'genre-talk': { name: '音乐风格', slug: 'genre-talk' },
  };

  if (fallback[slug]) return fallback[slug];
  return null;
}

/**
 * 根据 slug + category_id 查找或创建话题
 * @param slug 话题标识
 * @param categoryId 版块 ID（必须有效，否则返回 null）
 */
export async function findOrCreateTopic(slug: string, categoryId: number): Promise<TopicInfo | null> {
  const db = getForumDatabaseClient();

  // 1. 先从数据库查（同时匹配 slug + category_id）
  const rows = await db.queryMany<{ id: number; name: string; slug: string; category_id: number }>(
    'SELECT id, name, slug, category_id FROM forum_topics WHERE slug = ? AND category_id = ?',
    [slug, categoryId]
  );

  if (rows.length > 0) {
    return { ...rows[0], source: 'preset' };
  }

  // 2. 获取话题配置（不在当前版块话题池中则拒绝创建）
  const config = getTopicConfig(slug, categoryId);
  if (!config) {
    // slug 不属于该版块的话题池，拒绝动态创建
    return null;
  }

  // 3. 插入数据库
  try {
    await db.execute(
      'INSERT INTO forum_topics (name, slug, category_id) VALUES (?, ?, ?)',
      [config.name, config.slug, categoryId]
    );

    // 重新查询获取 id
    const newRows = await db.queryMany<{ id: number; name: string; slug: string; category_id: number }>(
      'SELECT id, name, slug, category_id FROM forum_topics WHERE slug = ? AND category_id = ?',
      [config.slug, categoryId]
    );

    if (newRows.length > 0) {
      return { ...newRows[0], source: 'dynamic' };
    }
  } catch (err) {
    // 并发情况下可能已由其他请求创建，重查一次
    const retryRows = await db.queryMany<{ id: number; name: string; slug: string; category_id: number }>(
      'SELECT id, name, slug, category_id FROM forum_topics WHERE slug = ? AND category_id = ?',
      [slug, categoryId]
    );
    if (retryRows.length > 0) {
      return { ...retryRows[0], source: 'preset' };
    }
    console.warn('[TopicManager] findOrCreateTopic failed:', err);
  }

  return null;
}
