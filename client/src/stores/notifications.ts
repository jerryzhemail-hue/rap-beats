import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  type ForumNotification,
} from '@/api/forum'
import {
  fetchSystemUnreadCount,
  markAllSystemNotificationsRead,
} from '@/api/system-notifications'

/**
 * 服务端推送的实时通知事件载荷（论坛通知）
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

/**
 * 服务端推送的系统通知事件载荷
 */
export interface IncomingSystemNotificationPayload {
  id: number
  type: string
  title: string
  content: string | null
  is_read: number
  actor_id: number | null
  actor_username?: string
  target_type: string | null
  target_id: number | null
  created_at: string
}

type NotificationListener = (payload: IncomingNotificationPayload) => void
type SystemNotificationListener = (payload: IncomingSystemNotificationPayload) => void

/** 最小刷新间隔（毫秒） */
const REFRESH_THROTTLE_MS = 3000

/** 当前 store 实例的唯一标识，用于检测 HMR 导致的模块重新执行 */
let storeInstanceId = 0

/**
 * 通知 Store
 *
 * 与 messages store 共享 SSE 连接（在 messages store 的 connect 中注册通知监听器），
 * 维护未读通知数（论坛 + 系统）和实时通知事件分发。
 */
export const useNotificationsStore = defineStore('notifications', () => {
  /** 当前实例 ID，HMR 时递增 */
  const instanceId = ++storeInstanceId

  /** 论坛通知未读数 */
  const forumUnreadCount = ref(0)
  /** 系统通知未读数 */
  const systemUnreadCount = ref(0)
  /** 总未读数 */
  const unreadCount = computed(() => forumUnreadCount.value + systemUnreadCount.value)

  /** 实时论坛通知订阅者集合 */
  const notificationListeners = new Set<NotificationListener>()
  /** 实时系统通知订阅者集合 */
  const systemNotificationListeners = new Set<SystemNotificationListener>()

  /** 上次调用 refreshUnreadCount 的时间戳 */
  let lastRefreshAt = 0
  /** 节流定时器 */
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 订阅实时论坛通知事件。
   */
  function onNotification(listener: NotificationListener): () => void {
    notificationListeners.add(listener)
    return () => {
      notificationListeners.delete(listener)
    }
  }

  /**
   * 订阅实时系统通知事件。
   */
  function onSystemNotification(listener: SystemNotificationListener): () => void {
    systemNotificationListeners.add(listener)
    return () => {
      systemNotificationListeners.delete(listener)
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
      const [forumData, systemData] = await Promise.all([
        fetchUnreadNotificationCount().catch(() => ({ unread_count: 0 })),
        fetchSystemUnreadCount().catch(() => ({ unread_count: 0 })),
      ])
      forumUnreadCount.value = forumData.unread_count || 0
      systemUnreadCount.value = systemData.unread_count || 0
    } catch {
      // 静默失败
    }
  }

  /**
   * 处理一条收到的论坛实时通知
   */
  function handleIncomingNotification(payload: IncomingNotificationPayload) {
    forumUnreadCount.value += 1

    notificationListeners.forEach((fn) => {
      try {
        fn(payload)
      } catch {
        // 单个监听者异常不影响其他
      }
    })
  }

  /**
   * 处理一条收到的系统实时通知
   */
  function handleIncomingSystemNotification(payload: IncomingSystemNotificationPayload) {
    systemUnreadCount.value += 1

    systemNotificationListeners.forEach((fn) => {
      try {
        fn(payload)
      } catch {
        // 单个监听者异常不影响其他
      }
    })
  }

  /**
   * 标记所有论坛通知已读
   */
  async function markAllRead() {
    try {
      await markAllNotificationsRead()
      forumUnreadCount.value = 0
    } catch {
      // 静默失败
    }
  }

  /**
   * 标记所有系统通知已读
   */
  async function markAllSystemRead() {
    try {
      await markAllSystemNotificationsRead()
      systemUnreadCount.value = 0
    } catch {
      // 静默失败
    }
  }

  return {
    unreadCount,
    forumUnreadCount,
    systemUnreadCount,
    refreshUnreadCount,
    onNotification,
    onSystemNotification,
    handleIncomingNotification,
    handleIncomingSystemNotification,
    markAllRead,
    markAllSystemRead,
  }
})
