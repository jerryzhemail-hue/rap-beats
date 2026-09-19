export interface Beat {
  id: number
  title: string
  producer: string
  rapper: string | null
  bpm: number
  key: string
  genre: string
  tags: string[]
  duration: number
  file_path: string
  cover_image: string | null
  download_count: number
  recent_downloads?: number
  favorite_count?: number
  recent_favorites?: number
  play_count?: number
  recent_plays?: number
  hot_score?: number
  is_free: boolean
  is_vip_only?: boolean
  is_favorited?: boolean
  created_at: string
  uploaded_by?: number
  creator_role?: 'beatmaker' | 'admin' | 'user'
  /** 创作者展示名（优先 beatmaker_profiles.display_name，fallback users.username → producer） */
  creator_display_name?: string
  /** 创作者头像（已签名的可访问 URL） */
  creator_avatar?: string | null
  /** 创作者是否是认证 Beatmaker */
  creator_is_beatmaker?: boolean
}

export interface BeatsResponse {
  beats: Beat[]
  total: number
  page: number
  totalPages: number
}

export interface BeatsFilters {
  genre?: string
  rapper?: string
  bpm_min?: number
  bpm_max?: number
  key?: string
  search?: string
  is_free?: number
  sort?: string
  tag?: string
}

export type VipLevel = 'free' | 'basic' | 'premium' | 'ultimate'

export interface User {
  id: number
  username: string
  /** 显示昵称（优先 nickname，缺省回退 username） */
  nickname?: string | null
  email: string
  role: 'admin' | 'user'
  vip_level: VipLevel
  vip_expire_at?: string | null
  avatar_url?: string | null
  created_at?: string
  is_beatmaker?: number
}

/** 个人中心 - 完整个人资料（含聚合 stats） */
export interface UserProfileFull {
  id: number
  username: string
  nickname: string
  bio: string | null
  email: string | null          // 隐私：他人看时为 null
  avatar_url: string | null
  role: 'admin' | 'user'
  vip_level: VipLevel
  vip_expire_at: string | null
  is_beatmaker: number
  created_at: string
  is_self: boolean
  // 关注关系（相对当前 viewer）
  is_followed_by_me: boolean
  is_following_me: boolean
  // 关键统计
  stats: {
    following_count: number
    follower_count: number
    post_count: number
    likes_received: number
    favorites_count: number
    beats_uploaded: number
  }
}

/** 用户搜索结果项 */
export interface UserSearchItem {
  id: number
  username: string
  nickname: string
  avatar_url: string | null
  is_beatmaker: number
  vip_level: string
}

export interface VipStatus {
  vip_level: VipLevel
  vip_expire_at: string | null
  daily_downloads: number
  daily_limit: number | null
  remaining_downloads: number | null
  daily_preview_tracks: number
  preview_daily_limit: number | null
  remaining_preview_tracks: number | null
  preview_duration_seconds: number | null
  can_access_vip_content: boolean
  can_access_high_quality: boolean
  can_full_preview: boolean
}

export interface Order {
  id: number
  vip_level: Exclude<VipLevel, 'free'>
  amount: number
  status: 'pending' | 'completed' | 'cancelled'
  created_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Banner {
  id: number
  name: string
  image_url: string
  image_value?: string
  link_url: string | null
  sort_order: number
  is_active: boolean
  overlay_opacity: number
  display_duration: number
  created_at: string
  updated_at: string
}
