import { request } from './request'

export interface RapperItem {
  id: number
  name: string
  avatar_url: string | null
  bio: string | null
  sort_order: number
  count: number
}

export interface CreateRapperData {
  name: string
  avatar_url?: string
  bio?: string
  sort_order?: number
}

export interface UpdateRapperData {
  name?: string
  avatar_url?: string
  bio?: string
  sort_order?: number
}

export interface RapperStats {
  id: number
  name: string
  beat_count: number
  play_count: number
  download_count: number
  favorite_count: number
  score: number
  sort_order: number
}

export interface RecalculateResult {
  success: boolean
  message: string
  weights: {
    beat_count: number
    play_count: number
    download_count: number
    favorite_count: number
  }
}

// 获取 rapper 列表（含数量）
export async function fetchRappers(): Promise<RapperItem[]> {
  const data = await request<{ rappers: RapperItem[] }>('/api/rappers')
  return data.rappers
}

// 获取简单 rapper 列表（用于下拉）
export async function fetchRapperNames(): Promise<string[]> {
  const data = await request<{ rappers: string[] }>('/api/rappers/simple')
  return data.rappers
}

// 获取单个 rapper
export async function fetchRapper(id: number): Promise<RapperItem> {
  const data = await request<{ rapper: RapperItem }>(`/api/rappers/${id}`)
  return data.rapper
}

// 创建 rapper
export async function createRapper(data: CreateRapperData): Promise<RapperItem> {
  const response = await request<{ rapper: RapperItem }>('/api/rappers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return response.rapper
}

// 更新 rapper
export async function updateRapper(id: number, data: UpdateRapperData): Promise<RapperItem> {
  const response = await request<{ rapper: RapperItem }>(`/api/rappers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  return response.rapper
}

// 删除 rapper
export async function deleteRapper(id: number): Promise<void> {
  await request(`/api/rappers/${id}`, {
    method: 'DELETE',
  })
}

// 导出 CSV
export function exportRappersCSV() {
  window.open('/api/rappers/export', '_blank')
}

// 导入 CSV
export interface ImportResult {
  success: number
  skipped: number
  errors: string[]
}

export async function importRappers(rappers: Array<{ name: string; avatar_url?: string; bio?: string; sort_order?: number }>): Promise<ImportResult> {
  const data = await request<ImportResult>('/api/rappers/import', {
    method: 'POST',
    body: JSON.stringify({ rappers }),
  })
  return data
}

// 获取 rapper 统计数据
export async function fetchRapperStats(): Promise<{ stats: RapperStats[]; weights: Record<string, number> }> {
  return await request('/api/rappers/stats')
}

// 手动触发重新计算权重
export async function recalculateRapperWeights(): Promise<RecalculateResult> {
  return await request('/api/rappers/recalculate', {
    method: 'POST',
  })
}
