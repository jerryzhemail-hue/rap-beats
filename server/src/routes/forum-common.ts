import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient } from '../database/client.js';
import { changePoints, getPointTransactions, getTotalPoints, POINT_REWARDS, getAvailableReward, POINT_LEVEL_CONFIG } from '../services/points.js';
import { invalidateVipCache } from '../middleware/vip.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { createDirectUploadTarget, saveBuffer, supportsDirectUpload } from '../services/storage.js';
import { suggestTopics } from '../services/topicEngine.js';
import { addClient, removeClient, pushToUser } from '../services/messageEvents.js';
import type { ForumConversation, ForumMessage, ForumCategory, ForumTopic, ForumUser, ForumUserProfile } from '@shared/forum';

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

// ─── Server 内部 DB row 类型(扩展 shared 类型,加 DB 列字段) ────────────────

interface ForumCategoryRow extends ForumCategory {
  is_active: number;
  real_post_count?: number;
}

interface ForumTopicRow extends ForumTopic {
  category_id: number;
}

interface ForumUserRow extends ForumUser {
  email?: string;
  role?: string;
  vip_level?: string;
}

interface ForumUserProfileRow {
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

interface ForumConversationRow {
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

interface ForumMessageRow {
  id: number;
  conversation_id: string;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'system';
  is_read: number;
  created_at: Date;
}

// ─── 本地专用类型(本次重构不动) ─────────────────────────────────────────────

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

export function createForumRouter() {
  return Router();
}

// ── Re-export shared dependencies(子模块可直接从这里 import) ──────────────────
export { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient } from '../database/client.js';
export { changePoints, getPointTransactions, getTotalPoints, POINT_REWARDS, getAvailableReward, POINT_LEVEL_CONFIG } from '../services/points.js';
export { invalidateVipCache } from '../middleware/vip.js';
export { requireAuth, optionalAuth } from '../middleware/auth.js';
export type { AuthRequest } from '../middleware/auth.js';
export { suggestTopics } from '../services/topicEngine.js';
export { addClient, removeClient, pushToUser } from '../services/messageEvents.js';
export { sanitizeHtml, escapeHtmlContent } from '../utils/sanitize.js';
export type { ImageAnalysisResult } from '../services/imageAnalyzer.js';
export { getLocalDateString, getLocalDateTimeStart, getLocalDateTimeEnd, getLocalDate, toDateTimeString, toDateString } from '../utils/timezone.js';
export type { ForumCategory, ForumTopic, ForumConversation, ForumMessage, ForumUser, ForumUserProfile } from '../../../shared/forum.js';


// ── Rate limiters ───────────────────────────────────────────────────────────
export { postLimiter, commentLimiter, likeLimiter, uploadLimiter, signInLimiter, lotteryLimiter, exchangeLimiter, messageLimiter };

// ── Shared helpers ───────────────────────────────────────────────────────────
export { enrichWithUsers, formatDate };

// ── Local row types (extends shared types with DB column fields) ─────────────
export type { ForumCategoryRow, ForumTopicRow, ForumUserRow, ForumUserProfileRow, ForumConversationRow, ForumMessageRow, ForumPost, ForumComment };
export type { PointReason } from '../services/points.js';
