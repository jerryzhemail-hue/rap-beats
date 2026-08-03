import { request } from './request'

export async function fetchAdminStats() {
  return request('/api/admin/stats')
}

export async function fetchAdminHotData(params: { days?: number; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.days) query.set('days', String(params.days))
  if (params.limit) query.set('limit', String(params.limit))
  return request(`/api/admin/hot-data?${query}`)
}

export async function fetchAdminUsers(params: { page?: number; search?: string } = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.search) query.set('search', params.search)
  return request(`/api/admin/users?${query}`)
}

export async function updateUserRole(userId: number, role: string) {
  return request(`/api/admin/users/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  })
}

export async function deleteUser(userId: number) {
  return request(`/api/admin/users/${userId}`, { method: 'DELETE' })
}

export async function setUserVip(userId: number, vipLevel: string, days?: number) {
  return request(`/api/admin/users/${userId}/vip`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vip_level: vipLevel, days })
  })
}

export async function clearTestUsers() {
  return request<{ message: string; remainingUsers: number }>('/api/admin/maintenance/clear-test-users', {
    method: 'POST'
  })
}

export async function clearDemoBeats() {
  return request<{ message: string; removedBeats: number }>('/api/admin/maintenance/clear-demo-beats', {
    method: 'POST'
  })
}

// beats 管理复用已有接口
export async function deleteBeat(beatId: number) {
  return request(`/api/beats/${beatId}`, { method: 'DELETE' })
}

export async function updateBeat(beatId: number, data: any) {
  return request(`/api/beats/${beatId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

// ─── 使用协议管理 ────────────────────────────────────────────────────────────

export interface LicenseTemplate {
  id: number
  version: string
  content: string
  is_active: number
  created_at: string
  updated_at: string
}

export async function fetchLicenseTemplates() {
  return request<{ templates: LicenseTemplate[] }>('/api/admin/license-templates')
}

export async function createLicenseTemplate(data: { version?: string; content?: string; is_active?: number }) {
  return request<{ template: LicenseTemplate }>('/api/admin/license-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function updateLicenseTemplate(id: number, data: { version?: string; content?: string; is_active?: number }) {
  return request<{ template: LicenseTemplate }>(`/api/admin/license-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function deleteLicenseTemplate(id: number) {
  return request(`/api/admin/license-templates/${id}`, { method: 'DELETE' })
}

export interface LicenseAgreementRecord {
  id: number
  user_id: number
  beat_id: number
  agreed_at: string
  username: string | null
  email: string | null
  beat_title: string | null
  producer: string | null
}

export interface LicenseAgreementsResponse {
  records: LicenseAgreementRecord[]
  total: number
  page: number
  totalPages: number
}

export async function fetchLicenseAgreements(params: {
  page?: number
  limit?: number
  beat_id?: number
  user_id?: number
  username?: string
  beat_title?: string
}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.beat_id) query.set('beat_id', String(params.beat_id))
  if (params.user_id) query.set('user_id', String(params.user_id))
  if (params.username) query.set('username', params.username)
  if (params.beat_title) query.set('beat_title', params.beat_title)
  return request<LicenseAgreementsResponse>(`/api/admin/license-agreements?${query}`)
}

export function getLicenseAgreementsExportUrl(params: {
  beat_id?: number
  username?: string
  beat_title?: string
}) {
  const query = new URLSearchParams()
  if (params.beat_id) query.set('beat_id', String(params.beat_id))
  if (params.username) query.set('username', params.username)
  if (params.beat_title) query.set('beat_title', params.beat_title)
  return `/api/admin/license-agreements/export?${query}`
}
