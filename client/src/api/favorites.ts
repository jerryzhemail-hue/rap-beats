import { request } from './request'

const BASE = '/api/favorites'

export async function addFavorite(beatId: number) {
  return request(`${BASE}/${beatId}`, { method: 'POST' })
}

export async function removeFavorite(beatId: number) {
  return request(`${BASE}/${beatId}`, { method: 'DELETE' })
}

export async function fetchFavorites(page = 1, limit = 12) {
  return request(`${BASE}?page=${page}&limit=${limit}`)
}
