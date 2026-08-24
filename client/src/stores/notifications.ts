import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  type ForumNotification,
} from '@/api/forum'

/**
 * 服务端推送的实时通知事件载荷
 */
export interface IncomingNotificationPayload {
  id: number
  type: 'like_post' | 'like_comment' | 'comment' | 'follow' | 'system'
  actor_id: number
  actor_username?: string
  actor_avatar?: string
  target_type?: string
  target_id?: number
  target_title?: string
  message: string
  created_at: string
}

type NotificationListener = (payload: IncomingNotificationPayload) => void

/** 最小刷新间隔（毫秒） */
const REFRESH_THROTTLE_MS = 3000

/** 当前 store 实例的唯一标识，用于检测 HMR 导致的模块重新执行 */
let storeInstanceId = 0

/**
 * 通知 Store
 *
 * 与 messages store 共享 SSE 连接（在 messages store 的 connect 中注册通知监听器），
 * 维护未读通知数和实时通知事件分发。
 */
export const useNotificationsStore = defineStore('notifications', () => {
  /** 当前实例 ID，HMR 时递增 */
  const instanceId = ++storeInstanceId

  /** 全局未读通知数 */
  const unreadCount = ref(0)

  /** 实时通知订阅者集合 */
  const notificationListeners = new Set<NotificationListener>()

  /** 上次调用 refreshUnreadCount 的时间戳 */
  let lastRefreshAt = 0
  /** 节流定时器 */
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 订阅实时通知事件。
   */
  function onNotification(listener: NotificationListener): () => void {
    notificationListeners.add(listener)
    return () => {
      notificationListeners.delete(listener)
    }
  }

  /**
   * 从服务端拉取最新未读数。带节流。
   */
  async function refreshUnreadCount() {
    const now = Date.now()
    const elapsed = now - lastRefreshAt
    if (elapsed < REFRESH_THROTTLE_MS) {
      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = null
          lastRefreshAt = Date.now()
          doRefreshUnreadCount()
        }, REFRESH_THROTTLE_MS - elapsed)
      }
      return
    }
    lastRefreshAt = now
    doRefreshUnreadCount()
  }

  async function doRefreshUnreadCount() {
    try {
      const data = await fetchUnreadNotificationCount()
      unreadCount.value = data.unread_count || 0
    } catch {
      // 静默失败
    }
  }

  /**
   * 处理一条收到的实时通知
   */
  function handleIncomingNotification(payload: IncomingNotificationPayload) {
    unreadCount.value += 1

    notificationListeners.forEach((fn) => {
      try {
        fn(payload)
      } catch {
        // 单个监听者异常不影响其他
      }
    })
  }

  /**
   * 标记所有通知已读（同时重置本地计数）
   */
  async function markAllRead() {
    try {
      await markAllNotificationsRead()
      unreadCount.value = 0
    } catch {
      // 静默失败
    }
  }

  return {
    unreadCount,
    refreshUnreadCount,
    onNotification,
    handleIncomingNotification,
    markAllRead,
  }
})
