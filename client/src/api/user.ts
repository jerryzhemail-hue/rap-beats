import { request } from './request'
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from './directUpload'
import type { User, VipStatus, UserProfileFull, UserSearchItem } from '@/types'

export async function fetchMyUploads(page = 1) {
  return request(`/api/user/uploads?page=${page}`)
}

export async function fetchMyDownloads(page = 1) {
  return request(`/api/user/downloads?page=${page}`)
}

/** 公开关注/粉丝列表聚合接口 */
export interface SocialListItem {
  id: number
  username: string
  nickname: string
  avatar_url: string | null
  is_beatmaker: number
  vip_level: string
  is_followed_by_me: boolean
  followed_at: string
}

export async function fetchSocialList(params: {
  userId: number
  type: 'following' | 'followers'
  page?: number
  limit?: number
}): Promise<{
  type: 'following' | 'followers'
  users: SocialListItem[]
  pagination: { page: number; page_size: number; total: number; total_pages: number }
}> {
  const qs = new URLSearchParams()
  qs.set('user_id', String(params.userId))
  qs.set('type', params.type)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return request(`/api/user/social/list?${qs.toString()}`)
}

/** 关注 / 取消关注用户（调用现有 forum 接口） */
export async function followUser(targetId: number): Promise<void> {
  return request(`/api/forum/users/${targetId}/follow`, { method: 'POST' })
}

export async function unfollowUser(targetId: number): Promise<void> {
  return request(`/api/forum/users/${targetId}/follow`, { method: 'DELETE' })
}

/** 个人中心 - 拉取完整个人资料（含 stats）
 *  @param userId 看他人时传入，看自己可省略
 */
export async function fetchProfileFull(userId?: number): Promise<UserProfileFull> {
  const qs = new URLSearchParams()
  if (userId) qs.set('user_id', String(userId))
  return request<UserProfileFull>(`/api/user/profile/full?${qs.toString()}`)
}

/** 用户搜索（双模式）
 *  @param type 'rapbeats' | 'nickname'
 */
export async function searchUsers(params: {
  q: string
  type?: 'rapbeats' | 'nickname'
  page?: number
  limit?: number
}): Promise<{ type: 'rapbeats' | 'nickname'; users: UserSearchItem[]; total: number; page: number; totalPages: number }> {
  const qs = new URLSearchParams()
  qs.set('q', params.q)
  if (params.type) qs.set('type', params.type)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return request(`/api/users/search?${qs.toString()}`)
}

export async function updateProfile(data: { username: string; email: string; nickname?: string; bio?: string }): Promise<{ message: string; user: User }> {
  return request('/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function uploadAvatar(file: File): Promise<{ message: string; user: User }> {
  const uploadTarget = await requestUploadTarget<{ direct_upload: boolean; target?: DirectUploadTarget | null }>('/api/user/avatar/upload-target', {
    file: {
      name: file.name,
      type: file.type
    }
  })

  if (uploadTarget.direct_upload && uploadTarget.target) {
    await uploadFileToTarget(uploadTarget.target, file)
    return request<{ message: string; user: User }>('/api/user/avatar/direct', {
      method: 'POST',
      body: JSON.stringify({
        avatar_url: uploadTarget.target.storedValue
      })
    })
  }

  const formData = new FormData()
  formData.append('avatar', file)

  return request<{ message: string; user: User }>('/api/user/avatar', {
    method: 'POST',
    body: formData
  })
}

export async function removeAvatar(): Promise<{ message: string; user: User }> {
  return request<{ message: string; user: User }>('/api/user/avatar', {
    method: 'DELETE'
  })
}

export async function updatePassword(data: { oldPassword: string; newPassword: string }) {
  return request('/api/user/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function fetchVipStatus(): Promise<VipStatus> {
  return request<VipStatus>('/api/user/vip-status')
}

export async function updateMyBeat(beatId: number, data: {
  title?: string
  producer?: string
  bpm?: number | null
  key?: string
  genre?: string
  tags?: string | string[]
  cover_image?: string | null
  is_free?: number
  is_vip_only?: number
}) {
  return request(`/api/beats/${beatId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function deleteMyBeat(beatId: number) {
  return request(`/api/beats/${beatId}`, {
    method: 'DELETE'
  })
}

export async function uploadMyBeatCover(beatId: number, file: File): Promise<{ message: string; stored_value: string; cover_image: string }> {
  const uploadTarget = await requestUploadTarget<{ direct_upload: boolean; target?: DirectUploadTarget | null }>(`/api/beats/${beatId}/cover/upload-target`, {
    file: {
      name: file.name,
      type: file.type
    }
  })

  if (uploadTarget.direct_upload && uploadTarget.target) {
    await uploadFileToTarget(uploadTarget.target, file)
    return {
      message: '封面上传成功',
      stored_value: uploadTarget.target.storedValue,
      cover_image: uploadTarget.target.publicUrl
    }
  }

  const formData = new FormData()
  formData.append('cover', file)

  return request<{ message: string; stored_value: string; cover_image: string }>(`/api/beats/${beatId}/cover`, {
    method: 'POST',
    body: formData
  })
}
