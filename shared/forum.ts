/**
 * 前后端共享类型 — Forum 模块
 *
 * ⚠️ 这是 server/routes/forum.ts 和 client/api/forum.ts 的单一来源。
 *
 * 设计原则:
 * - 这里定义的是「API 契约」:从 client 视角看到的数据形态
 * - server 内部仍可使用自己的 DB row 类型(如 ForumPostRow),
 *   但**所有返回给 client 的响应**必须匹配这里定义的类型
 * - 加新字段时:server SELECT 加列 → 这里加类型 → client 即可用
 *
 * 字段命名约定:
 * - 时间字段统一为 ISO 8601 字符串(string),由 JSON 传输时序列化
 *   server 端从 Date 转 string 后再 res.json,避免时区歧义
 * - 可空字段用 `| null`(而非 `?`),前端可以放心用 `?? ''` fallback
 * - 关联字段(如 other_user)始终存在,可能为 null
 */

// ─── Forum 分类 ──────────────────────────────────────────────────────────────

export interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: number;
  post_count: number;
}

// ─── Forum 话题(帖子内的标签) ──────────────────────────────────────────────

export interface ForumTopic {
  id: number;
  name: string;
  slug: string;
  post_count: number;
}

// ─── 私信会话与消息 ──────────────────────────────────────────────────────────

export type ForumMessageType = 'text' | 'image' | 'system';

export interface ForumMessage {
  id: number;
  conversation_id: string;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: ForumMessageType;
  is_read: number;
  created_at: string;
  sender_username?: string;
  sender_avatar?: string;
}

export interface ForumConversationOtherUser {
  id: number;
  username: string;
  avatar_url: string | null;
}

export interface ForumConversation {
  id: string;
  other_user: ForumConversationOtherUser | null;
  last_message_content: string;
  last_message_at: string;
  unread_count: number;
}

// ─── 用户资料与关注 ──────────────────────────────────────────────────────────

export type SocialLinks = Record<string, string>;

export interface ForumUserProfile {
  user_id: number;
  bio: string;
  location: string;
  website: string;
  social_links: SocialLinks;
  post_count: number;
  follower_count: number;
  following_count: number;
}

export interface ForumUser {
  id: number;
  username: string;
  avatar_url: string | null;
  forum_profile?: ForumUserProfile;
}

// ─── 列表型响应的通用分页结构 ───────────────────────────────────────────────

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface PaginatedList<T> {
  items: T[];
  pagination: Pagination;
}

// ─── 通用 API 响应 wrapper ───────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
}