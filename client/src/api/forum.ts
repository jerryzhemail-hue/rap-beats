import { request } from './request';
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from './directUpload';

// 共享类型(API 契约)从 shared/forum 统一引入,这里是向后兼容的 re-export
export type {
  ForumCategory,
  ForumTopic,
  ForumMessageType,
  ForumMessage,
  ForumConversationOtherUser,
  ForumConversation,
  SocialLinks,
  ForumUserProfile,
  ForumUser,
  Pagination,
  PaginatedList,
  ApiError,
} from '@shared/forum';

export interface ForumPost {
  id: number;
  user_id: number;
  category_id: number;
  title: string;
  content: string;
  beat_id: number | null;
  cover_image: string | null;
  music_file: string | null;
  music_title: string | null;
  music_artist: string | null;
  music_genre: string | null;
  music_bpm: number | null;
  music_cover_image: string | null;
  video_url: string | null;
  video_cover: string | null;
  video_duration: number | null;
  allow_download?: boolean;
  images: string[];
  topic_ids: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_pinned: number;
  is_essence: number;
  created_at: string;
  author_username: string;
  author_avatar: string | null;
  category_name: string;
  category_slug: string;
  time_ago: string;
  content_preview: string;
  is_liked?: boolean;
  is_favorited?: boolean;
  _playing?: boolean;
  topics?: ForumTopic[];
}

export interface ForumComment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: number;
  created_at: string;
  author_username: string;
  author_avatar: string | null;
  time_ago: string;
  replies: ForumComment[];
  is_liked?: boolean;  // Phase 2: 评论点赞状态
}

export interface ForumSignInStatus {
  signed_today: boolean;
  consecutive_days: number;
  total_points: number;
}

export interface PointsCenterConfig {
  sign_in: {
    base_points: number;
    repeated_day_base_points: number;
    consecutive_bonus_max: number;
    max_points_per_day: number;
    milestones: { days: number; points: number }[];
    description: string;
  };
  lottery: {
    daily_chances: number;
    prizes: {
      id: number;
      name: string;
      points: number;
      vip_days: number;
      rate: number;
    }[];
  };
  exchange: {
    vip_plans: {
      level: 'basic' | 'premium' | 'ultimate';
      points: number;
      vip_level: string;
      duration_days: number;
    }[];
    download_permission: {
      cost: number;
      description: string;
    };
  };
}

// 分类列表
export async function fetchForumCategories() {
  return request<{ categories: ForumCategory[] }>('/api/forum/categories');
}

// 话题列表
export async function fetchForumTopics() {
  return request<{ topics: ForumTopic[] }>('/api/forum/topics');
}

// 帖子列表
export async function fetchForumPosts(params: {
  category_id?: number;
  sort?: 'latest' | 'hot';
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.category_id) query.set('category_id', String(params.category_id));
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{ posts: ForumPost[]; total: number; page: number; page_size: number }>(
    `/api/forum/posts?${query.toString()}`
  );
}

// 帖子详情
export async function fetchForumPost(id: number) {
  return request<{ post: ForumPost }>(`/api/forum/posts/${id}`);
}

// 发帖
export async function createForumPost(data: {
  title: string;
  content: string;
  category_id: number;
  beat_id?: number;
  cover_image?: string;
  music_file?: string;
  music_title?: string;
  music_artist?: string;
  music_genre?: string;
  music_bpm?: number;
  music_cover_image?: string;
  video_url?: string;
  video_cover?: string;
  video_duration?: number;
  allow_download?: boolean;
  images?: string[];
  topic_ids?: number[];
}) {
  return request<{ message: string; post_id: number }>('/api/forum/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 上传论坛帖子图片
type ForumUploadTargetResponse = { direct_upload: boolean; target?: DirectUploadTarget | null };

export async function uploadForumImage(file: File) {
  const targetResponse = await requestUploadTarget<ForumUploadTargetResponse>('/api/forum/upload-target', {
    file: { name: file.name, type: file.type }
  });

  if (!targetResponse.direct_upload || !targetResponse.target) {
    // multipart fallback
    const formData = new FormData();
    formData.append('image', file);
    return request<{ message: string; image_url: string; stored_value: string }>('/api/forum/upload-image', {
      method: 'POST',
      body: formData
    });
  }

  try {
    await uploadFileToTarget(targetResponse.target, file);
    return {
      message: '图片上传成功',
      image_url: targetResponse.target.publicUrl,
      stored_value: targetResponse.target.storedValue
    };
  } catch {
    const formData = new FormData();
    formData.append('image', file);
    return request<{ message: string; image_url: string; stored_value: string }>('/api/forum/upload-image', {
      method: 'POST',
      body: formData
    });
  }
}

// 上传论坛音频（自动分析 BPM/风格）
export interface ForumAudioUploadResult {
  audio_url: string;
  stored_value: string;
  bpm: number | null;
  bpm_confidence: number;
  duration: number | null;
  genre: string | null;
  detected_style: string[];
  genre_options: { label: string; value: string; children: { label: string; value: string }[] }[];
  bpm_pending?: boolean;   // 是否还在后台分析
  audio_id?: string;       // 后台查询用
}

export interface ForumAudioBpmResult {
  ready: boolean;
  bpm: number | null;
  bpm_confidence?: number;
  duration?: number | null;
  key?: string;
  key_root?: string;
  key_mode?: string;
  key_confidence?: number;
}

export async function uploadForumAudio(file: File) {
  const formData = new FormData();
  formData.append('audio', file);
  return request<ForumAudioUploadResult>('/api/forum/upload-audio', {
    method: 'POST',
    body: formData
  });
}

// 轮询获取后台 BPM 分析结果
export async function fetchAudioBpm(audioId: string) {
  return request<ForumAudioBpmResult>(`/api/forum/audio-bpm/${encodeURIComponent(audioId)}`, {
    method: 'GET'
  });
}

// 上传论坛视频
export interface ForumVideoUploadResult {
  video_url: string;
  stored_value: string;
  video_cover: string | null;
  duration: number | null;
  file_size: number;
  max_size: number;
  max_duration: number;
}

export async function uploadForumVideo(file: File) {
  const formData = new FormData();
  formData.append('video', file);
  return request<ForumVideoUploadResult>('/api/forum/upload-video', {
    method: 'POST',
    body: formData
  });
}

// 话题标签接口
export interface TopicSuggestion {
  id: number;
  name: string;
  slug: string;
  score: number;
  matchedKeywords: string[];
  source: 'text' | 'image' | 'both';
}

export async function suggestForumTopics(params: {
  title?: string;
  content?: string;
  image_urls?: string[];
  audio_urls?: string[];
  category_id: number;
  exclude_ids?: number[];
}) {
  return request<{ suggestions: TopicSuggestion[] }>('/api/forum/suggest-topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

// 修改帖子
export async function updateForumPost(id: number, data: {
  title?: string;
  content?: string;
  category_id?: number;
  topic_ids?: number[];
}) {
  return request<{ message: string }>(`/api/forum/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 删除帖子
export async function deleteForumPost(id: number) {
  return request<{ message: string }>(`/api/forum/posts/${id}`, { method: 'DELETE' });
}

// 点赞/取消点赞
export async function toggleForumLike(postId: number) {
  return request<{ liked: boolean; like_count: number }>(`/api/forum/posts/${postId}/like`, { method: 'POST' });
}

// 收藏/取消收藏
export async function toggleForumFavorite(postId: number) {
  return request<{ favorited: boolean }>(`/api/forum/posts/${postId}/favorite`, { method: 'POST' });
}

// 我的收藏列表
export async function fetchMyForumFavorites(params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{ posts: ForumPost[]; total: number; page: number; page_size: number }>(
    `/api/forum/favorites?${query.toString()}`
  );
}

// 帖子评论列表
export async function fetchForumComments(postId: number, params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 50));
  return request<{ comments: ForumComment[]; total: number; page: number }>(
    `/api/forum/posts/${postId}/comments?${query.toString()}`
  );
}

// 发表评论
export async function createForumComment(postId: number, data: {
  content: string;
  parent_id?: number;
}) {
  return request<{ comment: ForumComment }>(`/api/forum/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 删除评论
export async function deleteForumComment(commentId: number) {
  return request<{ message: string }>(`/api/forum/comments/${commentId}`, { method: 'DELETE' });
}

// 评论点赞/取消点赞
export async function toggleForumCommentLike(commentId: number) {
  return request<{ liked: boolean; like_count: number }>(`/api/forum/comments/${commentId}/like`, { method: 'POST' });
}

// 签到状态
export async function fetchSignInStatus() {
  return request<ForumSignInStatus>('/api/forum/sign-in/status');
}

// 签到
export async function doSignIn() {
  return request<{ message: string; points_earned: number; consecutive_days: number; total_points: number }>(
    '/api/forum/sign-in',
    { method: 'POST' }
  );
}

export async function fetchPointsCenterConfig() {
  return request<PointsCenterConfig>('/api/forum/points/config');
}

// 积分流水记录
export interface PointTransaction {
  id: number;
  user_id: number;
  change: number;
  reason: string;
  description: string | null;
  created_at: string;
}

export async function fetchPointTransactions(params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{
    records: PointTransaction[];
    total: number;
    page: number;
    page_size: number;
    total_points: number;
  }>(`/api/forum/points/transactions?${query.toString()}`);
}

// 我的帖子列表
export async function fetchMyForumPosts(params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{ posts: ForumPost[]; total: number; page: number; page_size: number }>(
    `/api/forum/my-posts?${query.toString()}`
  );
}

// 我的点赞列表
export async function fetchMyForumLikes(params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{ posts: ForumPost[]; total: number; page: number; page_size: number }>(
    `/api/forum/my-likes?${query.toString()}`
  );
}

// 我的评论列表
export interface ForumMyComment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: number;
  created_at: string;
  author_username: string;
  author_avatar: string | null;
  time_ago: string;
  post_title: string;
}

export async function fetchMyForumComments(params: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{ comments: ForumMyComment[]; total: number; page: number; page_size: number }>(
    `/api/forum/my-comments?${query.toString()}`
  );
}

// ─── 管理接口 ────────────────────────────────────────────────────────────────

// 置顶/取消置顶
export async function adminTogglePin(postId: number) {
  return request<{ message: string }>(`/api/forum/admin/posts/${postId}/pin`, { method: 'POST' });
}

// 加精/取消加精
export async function adminToggleEssence(postId: number) {
  return request<{ message: string }>(`/api/forum/admin/posts/${postId}/essence`, { method: 'POST' });
}

// ─── 积分抽奖 ────────────────────────────────────────────────────────────────

export interface LotteryStatus {
  remaining_chances: number;
  records: {
    id: number;
    prize_name: string;
    points: number;
    vip_days: number;
    created_at: string;
  }[];
  prizes: { id: number; name: string; points: number; vip_days: number; rate: number }[];
}

export async function fetchLotteryStatus() {
  return request<LotteryStatus>('/api/forum/lottery/status');
}

export async function doLottery() {
  return request<{
    success: boolean;
    prize: { id: number; name: string; points: number; vip_days: number };
    points_earned: number;
    total_points: number;
    remaining_chances: number;
  }>('/api/forum/lottery', { method: 'POST' });
}

// ─── 积分兑换 ────────────────────────────────────────────────────────────────

export async function exchangeVipWithPoints(level: 'basic' | 'premium' | 'ultimate') {
  return request<{
    success: boolean;
    message: string;
    points_spent: number;
    vip_level: string;
    vip_expire_at: string;
    total_points: number;
  }>('/api/forum/points/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
}

// ─── 积分兑换单次下载权限 ───────────────────────────────────────────────────────

export async function fetchDownloadPermission() {
  return request<{
    total_points: number;
    remaining_permissions: number;
    exchange_cost: number;
  }>('/api/forum/points/download-permission');
}

export async function exchangeDownloadWithPoints() {
  return request<{
    success: boolean;
    message: string;
    points_spent: number;
    remaining_points: number;
    remaining_permissions: number;
  }>('/api/forum/points/exchange-download', {
    method: 'POST',
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// 私信功能
// ════════════════════════════════════════════════════════════════════════════════

// 获取会话列表
export async function fetchMessageConversations() {
  return request<{ conversations: ForumConversation[] }>('/api/forum/messages/conversations');
}

// 确保会话存在（不发送消息，用于从外部跳转私信）
export async function ensureConversation(receiverId: number) {
  return request<ForumConversation>('/api/forum/messages/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver_id: receiverId }),
  });
}

// 获取某个会话的消息
export async function fetchConversationMessages(conversationId: string, params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return request<{
    messages: ForumMessage[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }>(`/api/forum/messages/${encodeURIComponent(conversationId)}?${query.toString()}`);
}

// 发送私信
export async function sendMessage(data: { receiver_id: number; content: string; message_type?: 'text' | 'image' }) {
  return request<{ message: ForumMessage }>('/api/forum/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 标记会话已读
export async function markConversationRead(conversationId: string) {
  return request<{ success: boolean }>(`/api/forum/messages/${encodeURIComponent(conversationId)}/read`, {
    method: 'PUT',
  });
}

// 获取未读消息总数
export async function fetchUnreadMessageCount() {
  return request<{ unread_count: number }>('/api/forum/messages/unread-count');
}

// ════════════════════════════════════════════════════════════════════════════════
// 用户资料与关注功能
// ════════════════════════════════════════════════════════════════════════════════

// 获取用户资料
export async function fetchForumUser(userId: number) {
  return request<{ user: ForumUser }>(`/api/forum/users/${userId}`);
}

// 更新个人资料
export async function updateForumProfile(data: {
  bio?: string;
  location?: string;
  website?: string;
  social_links?: Record<string, string>;
}) {
  return request<{ profile: ForumUserProfile }>('/api/forum/users/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 获取用户发布的帖子列表
export async function fetchForumUserPosts(userId: number, params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return request<{
    posts: ForumPost[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }>(`/api/forum/users/${userId}/posts?${query.toString()}`);
}

// 关注用户
export async function followUser(userId: number) {
  return request<{ success: boolean; message: string }>(`/api/forum/users/${userId}/follow`, {
    method: 'POST',
  });
}

// 取消关注
export async function unfollowUser(userId: number) {
  return request<{ success: boolean; message: string }>(`/api/forum/users/${userId}/follow`, {
    method: 'DELETE',
  });
}

// 检查关注状态
export async function fetchFollowStatus(userId: number) {
  return request<{ is_following: boolean; is_followed_by: boolean }>(`/api/forum/users/${userId}/follow-status`);
}

// 获取粉丝列表
export async function fetchUserFollowers(userId: number, params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return request<{
    followers: Array<{ id: number; username: string; avatar_url: string | null; followed_at: string }>;
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }>(`/api/forum/users/${userId}/followers?${query.toString()}`);
}

// 获取关注列表
export async function fetchUserFollowings(userId: number, params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return request<{
    followings: Array<{ id: number; username: string; avatar_url: string | null; followed_at: string }>;
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }>(`/api/forum/users/${userId}/followings?${query.toString()}`);
}

// 获取互相关注的好友列表
export async function fetchFriends(params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return request<{
    friends: Array<{ id: number; username: string; avatar_url: string | null; followed_at: string }>;
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }>(`/api/forum/friends?${query.toString()}`);
}

// 删除会话
export async function deleteConversation(conversationId: string) {
  return request<{ success: boolean }>(
    `/api/forum/messages/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' }
  );
}

// 拉黑用户
export async function blockUser(userId: number) {
  return request<{ success: boolean; already?: boolean }>(`/api/forum/blocks/${userId}`, {
    method: 'POST',
  });
}

// 取消拉黑
export async function unblockUser(userId: number) {
  return request<{ success: boolean }>(`/api/forum/blocks/${userId}`, {
    method: 'DELETE',
  });
}

// 拉黑状态
export async function fetchBlockStatus(userId: number) {
  return request<{ blocked_by_me: boolean; blocked_me: boolean }>(
    `/api/forum/blocks/${userId}/status`
  );
}

// 拉黑列表
export async function fetchBlockList() {
  return request<{
    users: Array<{ id: number; username: string; avatar_url: string | null }>;
  }>(`/api/forum/blocks`);
}

// 搜索全站用户（用于私信发起聊天）
export async function searchUsers(query: string, limit = 20) {
  return request<{
    users: Array<{ id: number; username: string; avatar_url: string | null }>;
  }>(`/api/users/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}
