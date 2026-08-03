import { request } from './request'
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from './directUpload'
import type { User, VipStatus } from '@/types'

export async function fetchMyUploads(page = 1) {
  return request(`/api/user/uploads?page=${page}`)
}

export async function fetchMyDownloads(page = 1) {
  return request(`/api/user/downloads?page=${page}`)
}

export async function updateProfile(data: { username: string; email: string }) {
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
