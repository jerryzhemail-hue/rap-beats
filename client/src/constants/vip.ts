import type { VipLevel } from '@/types'

export type PaidVipLevel = Exclude<VipLevel, 'free'>

export const vipPlanConfig: Record<PaidVipLevel, {
  label: string
  price: number
  cycleLabel: string
  benefits: string[]
}> = {
  basic: {
    label: '基础会员',
    price: 19.9,
    cycleLabel: '月付',
    benefits: ['每日下载 10 次', '解锁基础下载功能', '更顺畅的创作浏览体验']
  },
  premium: {
    label: '高级会员',
    price: 49.9,
    cycleLabel: '月付',
    benefits: ['每日下载 30 次', '完整试听全站伴奏', '解锁 VIP 专属内容', '支持高品质音频下载']
  },
  ultimate: {
    label: '至尊会员',
    price: 99.9,
    cycleLabel: '月付',
    benefits: ['不限次数下载', '完整试听全站伴奏', '解锁 VIP 专属内容', '支持高品质音频下载', '适合高频创作用户']
  }
}

export const vipLevelNames: Record<VipLevel, string> = {
  free: '免费用户',
  basic: '基础会员',
  premium: '高级会员',
  ultimate: '至尊会员'
}

export function isPaidVipLevel(level: VipLevel): level is PaidVipLevel {
  return level !== 'free'
}
