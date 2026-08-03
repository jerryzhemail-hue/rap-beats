import { request } from './request'

export interface Comment {
  id: number
  user_id: number
  username: string
  content: string
  created_at: string
}

export async function fetchComments(beatId: number, page = 1, limit = 20) {
  return request(`/api/beats/${beatId}/comments?page=${page}&limit=${limit}`)
}

export async function postComment(beatId: number, content: string) {
  return request(`/api/beats/${beatId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
}

export async function deleteComment(commentId: number) {
  return request(`/api/comments/${commentId}`, { method: 'DELETE' })
}
