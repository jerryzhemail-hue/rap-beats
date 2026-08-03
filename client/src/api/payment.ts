import type { Order } from '@/types'
import { request } from './request'

export async function createOrder(vipLevel: string, payType: 'wechat' | 'alipay') {
  return request('/api/payment/create-order', {
    method: 'POST',
    body: JSON.stringify({ vip_level: vipLevel, pay_type: payType })
  })
}

export async function fetchOrders() {
  return request<Order[]>('/api/payment/orders')
}
