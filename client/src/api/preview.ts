import { request } from '@/api/request'

export interface PreviewCheckResponse {
  allowed: boolean
  is_guest: boolean
  error?: string
  code?: string
  used?: number
  limit?: number
  remaining?: number
}

export interface PreviewPlayResponse {
  success: boolean
  is_guest: boolean
  used?: number
  limit?: number
  remaining?: number
}

export interface PreviewStatusResponse {
  is_guest: boolean
  is_vip?: boolean
  vip_level?: string
  can_full_preview?: boolean
  used?: number
  limit?: number
  remaining?: number
}

// 检查未登录用户是否有试听资格（匿名 session 由后端 Cookie 自动处理）
export async function checkPreviewPermission(): Promise<PreviewCheckResponse> {
  return request<PreviewCheckResponse>('/api/preview/check')
}

// 记录未登录用户试听（匿名 session 由后端 Cookie 自动处理）
export async function recordPreviewPlay(beatId: number): Promise<PreviewPlayResponse> {
  return request<PreviewPlayResponse>('/api/preview/play', {
    method: 'POST',
    body: JSON.stringify({ beat_id: beatId })
  })
}

// 获取当前试听状态（匿名 session 由后端 Cookie 自动处理）
export async function getPreviewStatus(): Promise<PreviewStatusResponse> {
  return request<PreviewStatusResponse>('/api/preview/status')
}
