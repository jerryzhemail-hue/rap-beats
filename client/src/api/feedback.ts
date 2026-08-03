import { request } from './request'

export type FeedbackItem = {
  id: number
  type: 'bug' | 'suggestion' | 'other'
  title: string
  content: string
  contact: string | null
  status: 'pending' | 'replied' | 'closed'
  reply: string | null
  created_at: string
  updated_at: string
}

export async function submitFeedback(data: {
  type: string
  title: string
  content: string
  contact?: string
}) {
  return request('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function fetchMyFeedback(page = 1, limit = 10) {
  return request<{ feedback: FeedbackItem[]; total: number; page: number; limit: number; totalPages: number }>(
    `/api/feedback?page=${page}&limit=${limit}`
  )
}

export type AdminFeedbackItem = FeedbackItem & {
  username: string | null
  email: string | null
}

export async function fetchAdminFeedback(params: {
  page?: number
  limit?: number
  status?: string
  search?: string
}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.status) searchParams.set('status', params.status)
  if (params.search) searchParams.set('search', params.search)
  return request<{ feedback: AdminFeedbackItem[]; total: number; page: number; limit: number; totalPages: number }>(
    `/api/admin/feedback?${searchParams.toString()}`
  )
}

export async function replyFeedback(id: number, data: { reply: string; status?: string }) {
  return request(`/api/admin/feedback/${id}/reply`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function deleteFeedback(id: number) {
  return request(`/api/admin/feedback/${id}`, {
    method: 'DELETE'
  })
}

export interface NewFeedbackResponse {
  items: AdminFeedbackItem[]
  serverTime: string
  count: number
}

export async function fetchNewFeedback(since?: string) {
  const params = since ? `?since=${encodeURIComponent(since)}` : ''
  return request<NewFeedbackResponse>(`/api/admin/feedback/new${params}`)
}
