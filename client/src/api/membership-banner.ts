/**
 * 会员权益弹框 — IP 频控 API
 *
 * 后端根据客户端 IP 维护一个 24h 冷却窗口:
 * - GET  /api/membership-banner/status  : 询问当前是否应该弹框
 * - POST /api/membership-banner/record   : 确认已弹出,落库计数
 *
 * 前端在 App.vue 挂载时串行调用这两个接口,
 * 当 status.shouldShow=true 时再调用 record 并展示弹框,
 * 否则跳过。
 */
import { request } from './request'

export interface MembershipBannerStatus {
  /** 当前是否应展示弹框 */
  shouldShow: boolean
  /** 触发原因:first_visit / cooldown_elapsed / cooldown_active / no_ip */
  reason: 'first_visit' | 'cooldown_elapsed' | 'cooldown_active' | 'no_ip' | string
  /** 下次可弹框的 ISO 时间戳(冷却中时返回) */
  nextEligibleAt: string | null
  /** 冷却窗口长度(毫秒) */
  cooldownMs: number
}

export interface MembershipBannerRecordResult {
  recorded: boolean
  reason?: string
}

/** 查询当前 IP 是否在冷却窗口内(冷却中返回 shouldShow=false) */
export function fetchMembershipBannerStatus() {
  return request<MembershipBannerStatus>('/api/membership-banner/status')
}

/** 记录当前 IP 已弹出过弹框(view_count + 1,刷新 last_seen_at) */
export function recordMembershipBannerShown() {
  return request<MembershipBannerRecordResult>('/api/membership-banner/record', {
    method: 'POST',
  })
}
