/**
 * 首页模块可见性配置 API
 */
import { request } from './request'

/** 公开接口返回的模块项 */
export interface VisibleModule {
  module_key: string
  module_label: string
  sort_order: number
}

/** 管理员接口返回的完整配置项 */
export interface ModuleConfigItem {
  module_key: string
  module_label: string
  sort_order: number
  visible_to_guest: number
  visible_to_user: number
  visible_to_vip: number
  visible_to_beatmaker: number
  visible_to_admin: number
  updated_at: string
}

/** 获取当前用户可见的模块列表 */
export async function fetchVisibleModules() {
  return request<{
    role: 'guest' | 'user' | 'vip' | 'beatmaker' | 'admin'
    modules: VisibleModule[]
  }>('/api/homepage-config')
}

/** 管理员获取全部配置 */
export async function fetchModuleConfigs() {
  return request<{ items: ModuleConfigItem[] }>('/api/homepage-config/admin')
}

/** 管理员批量更新配置 */
export async function updateModuleConfigs(items: Array<{
  module_key: string
  visible_to_guest: boolean
  visible_to_user: boolean
  visible_to_vip: boolean
  visible_to_beatmaker: boolean
  visible_to_admin: boolean
}>) {
  return request<{ message: string }>('/api/homepage-config/admin', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  })
}
