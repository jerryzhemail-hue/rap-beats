import { request } from './request'
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from './directUpload'
import type { Banner } from '@/types'

type BannerPayload = {
  name: string
  image_url: string
  link_url: string | null
  sort_order: number
  is_active: boolean
  overlay_opacity: number
  display_duration: number
}

type BannerListResponse = {
  banners: Banner[]
}

type BannerMutationResponse = {
  message: string
  banner: Banner
}

type BannerUploadTargetResponse = {
  direct_upload: boolean
  target?: DirectUploadTarget | null
}

export async function fetchHomeBanners() {
  return request<BannerListResponse>('/api/banners')
}

export async function fetchAdminBanners() {
  return request<BannerListResponse>('/api/admin/banners')
}

export async function createBanner(payload: BannerPayload) {
  return request<BannerMutationResponse>('/api/admin/banners', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function updateBanner(bannerId: number, payload: BannerPayload) {
  return request<BannerMutationResponse>(`/api/admin/banners/${bannerId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export async function deleteBanner(bannerId: number) {
  return request<{ message: string }>(`/api/admin/banners/${bannerId}`, {
    method: 'DELETE'
  })
}

export async function reorderBanners(items: Array<{ id: number; sort_order: number }>) {
  return request<{ message: string }>('/api/admin/banners/reorder', {
    method: 'POST',
    body: JSON.stringify({ items })
  })
}

async function uploadBannerViaMultipart(file: File) {
  const formData = new FormData()
  formData.append('image', file)
  return request<{ message: string; image_url: string; stored_value: string }>('/api/admin/banners/upload-image', {
    method: 'POST',
    body: formData
  })
}

export async function uploadBannerImage(file: File) {
  const targetResponse = await requestUploadTarget<BannerUploadTargetResponse>('/api/admin/banners/upload-target', {
    file: {
      name: file.name,
      type: file.type
    }
  })

  if (!targetResponse.direct_upload || !targetResponse.target) {
    return uploadBannerViaMultipart(file)
  }

  try {
    await uploadFileToTarget(targetResponse.target, file)
    return {
      message: 'Banner 图片上传成功',
      image_url: targetResponse.target.publicUrl,
      stored_value: targetResponse.target.storedValue
    }
  } catch {
    return uploadBannerViaMultipart(file)
  }
}
