import type { Beat, BeatsFilters, BeatsResponse } from '@/types'
import { request, getAuthUrl } from '@/api/request'

export interface LicenseInfo {
  content: string
  version: string
  agreed: boolean
}

export interface HomePublicResponse {
  latest: BeatsResponse
  popular: BeatsResponse
  free: BeatsResponse
  rappers: Array<{
    id: number
    name: string
    avatar_url: string | null
    bio: string | null
    beat_count: number
  }>
  tags: Array<{ tag: string; count: number }>
  forumPosts: Array<{
    id: number
    title: string
    view_count: number
    reply_count: number
    like_count: number
    created_at: string
    username: string
    author_avatar: string | null
  }>
}

export async function fetchHomePublicData(): Promise<HomePublicResponse> {
  return request<HomePublicResponse>('/api/home/public')
}

export async function fetchBeats(params: BeatsFilters & { page?: number; limit?: number } = {}): Promise<BeatsResponse> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.genre) searchParams.set('genre', params.genre)
  if (params.rapper) searchParams.set('rapper', params.rapper)
  if (params.bpm_min !== undefined) searchParams.set('bpm_min', String(params.bpm_min))
  if (params.bpm_max !== undefined) searchParams.set('bpm_max', String(params.bpm_max))
  if (params.key) searchParams.set('key', params.key)
  if (params.search) searchParams.set('search', params.search)
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.is_free !== undefined) searchParams.set('is_free', String(params.is_free))
  if (params.tag) searchParams.set('tag', params.tag)

  const query = searchParams.toString()
  const url = `/api/beats${query ? `?${query}` : ''}`

  return request<BeatsResponse>(url)
}

export async function fetchBeat(id: number): Promise<Beat> {
  return request<Beat>(`/api/beats/${id}`)
}

export async function fetchPopularBeats(): Promise<BeatsResponse> {
  return fetchBeats({ sort: 'popular', limit: 6 })
}

export async function fetchFreeBeats(): Promise<BeatsResponse> {
  return fetchBeats({ is_free: 1, limit: 6 })
}

export async function recordPlayEvent(id: number) {
  return request<{ message: string }>(`/api/beats/${id}/play-events`, {
    method: 'POST'
  })
}

export function getStreamUrl(id: number): string {
  return getAuthUrl(`/api/beats/${id}/stream`)
}

export function getDownloadUrl(id: number): string {
  return getAuthUrl(`/api/beats/${id}/download`)
}

export async function fetchLicenseInfo(beatId: number): Promise<LicenseInfo> {
  return request<LicenseInfo>(`/api/beats/${beatId}/license`)
}

export async function agreeLicense(beatId: number): Promise<void> {
  return request<void>(`/api/beats/${beatId}/license/agree`, {
    method: 'POST'
  })
}

export interface BeatUpdatePayload {
  title?: string
  producer?: string
  rapper?: string
  bpm?: number
  key?: string
  genre?: string
  tags?: string
  is_free?: boolean
  is_vip_only?: boolean
  cover_image?: string | null
}

export async function updateBeat(id: number, payload: BeatUpdatePayload): Promise<Beat> {
  return request<Beat>(`/api/beats/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export async function deleteBeat(id: number): Promise<void> {
  return request<void>(`/api/beats/${id}`, {
    method: 'DELETE'
  })
}
