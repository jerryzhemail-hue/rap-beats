import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchUnreadMessageCount,
  markConversationRead,
  type ForumMessage,
} from '@/api/forum'
import { useNotificationsStore } from './notifications'

/**
 * 服务端推送的实时消息事件载荷
 */
export interface IncomingMessagePayload {
  conversation_id: string
  sender_id: number
  sender_username?: string
  sender_avatar?: string
  message: ForumMessage
}

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

type MessageListener = (payload: IncomingMessagePayload) => void

/** 最小刷新间隔（毫秒），防止 SSE 重连风暴时频繁请求 */
const REFRESH_THROTTLE_MS = 3000

/** 当前 store 实例的唯一标识，用于检测 HMR 导致的模块重新执行 */
let storeInstanceId = 0

/**
 * 私信实时消息 store
 *
 * 维护一条全局唯一的 SSE 连接（登录后建立，登出/卸载时断开），
 * 并向订阅者分发收到的实时消息。未读数由本 store 单点维护，
 * AppHeader 角标与 MessagesHubView 均从此读取，避免多组件各自轮询。
 */
export const useMessagesStore = defineStore('messages', () => {
  /** 当前实例 ID，HMR 时递增，用于丢弃过期回调 */
  const instanceId = ++storeInstanceId

  /** 全局未读私信总数（驱动 AppHeader 角标） */
  const unreadCount = ref(0)
  /** 当前正在查看的会话 ID（由 MessagesHubView 设置，用于判断新消息是否"已读"） */
  const activeConversationId = ref<string>('')

  let eventSource: EventSource | null = null
  /** 实时消息订阅者集合（MessagesHubView 注册/注销） */
  const messageListeners = new Set<MessageListener>()

  /** 上次调用 refreshUnreadCount 的时间戳，用于节流 */
  let lastRefreshAt = 0
  /** 节流定时器 */
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 设置当前正在查看的会话。空字符串表示未打开任何会话。
   */
  function setActiveConversation(id: string) {
    activeConversationId.value = id
  }

  /**
   * 订阅实时消息事件。返回取消订阅函数。
   * MessagesHubView 在 onMounted 调用、onUnmounted 注销。
   */
  function onMessage(listener: MessageListener): () => void {
    messageListeners.add(listener)
    return () => {
      messageListeners.delete(listener)
    }
  }

  /**
   * 从服务端拉取一次最新未读数（SSE 连接建立后或补偿场景）。
   * 带节流：REFRESH_THROTTLE_MS 内只允许一次实际请求。
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
      const data = await fetchUnreadMessageCount()
      unreadCount.value = data.unread_count || 0
    } catch {
      // 静默失败：网络异常时保留旧值，不阻塞主流程
    }
  }

  /**
   * 建立全局 SSE 连接。登录后调用一次，重复调用会先断开旧连接。
   * token 通过 query 传递（EventSource 不支持自定义请求头）。
   */
  function connect(token: string) {
    if (!token) return

    // HMR 保护：如果 store 实例已更新，丢弃旧连接
    if (storeInstanceId !== instanceId) return

    disconnect()
    const url = `/api/forum/messages/stream?token=${encodeURIComponent(token)}`
    eventSource = new EventSource(url)

    eventSource.addEventListener('connected', () => {
      // 静默确认
    })

    // 监听私信消息事件
    eventSource.addEventListener('message', (e: MessageEvent) => {
      if (storeInstanceId !== instanceId) return
      try {
        const payload = JSON.parse(e.data) as IncomingMessagePayload
        handleIncomingMessage(payload)
      } catch {
        // 忽略无法解析的事件数据
      }
    })

    // 监听通知事件
    eventSource.addEventListener('notification', (e: MessageEvent) => {
      if (storeInstanceId !== instanceId) return
      try {
        const payload = JSON.parse(e.data) as IncomingNotificationPayload
        const notificationsStore = useNotificationsStore()
        notificationsStore.handleIncomingNotification(payload)
      } catch {
        // 忽略无法解析的事件数据
      }
    })

    eventSource.onerror = () => {
      if (storeInstanceId !== instanceId) return
      if (eventSource && eventSource.readyState === EventSource.CLOSED) {
        refreshUnreadCount()
      }
    }
  }

  /**
   * 处理一条收到的实时消息：
   * - 属于当前正在查看的会话 → 直接减少未读计数
   * - 否则 → 未读数 +1，并通知订阅者
   */
  async function handleIncomingMessage(payload: IncomingMessagePayload) {
    const isActive =
      activeConversationId.value &&
      payload.conversation_id === activeConversationId.value

    if (isActive) {
      decreaseUnread(1)
    } else {
      unreadCount.value += 1
    }

    messageListeners.forEach((fn) => {
      try {
        fn(payload)
      } catch {
        // 单个监听者异常不影响其他监听者
      }
    })
  }

  /**
   * 减少未读计数（进入会话清零时调用）。
   */
  function decreaseUnread(by = 0) {
    unreadCount.value = Math.max(0, unreadCount.value - by)
  }

  /**
   * 断开 SSE 连接。登出或组件卸载时调用。
   */
  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    unreadCount,
    activeConversationId,
    connect,
    disconnect,
    refreshUnreadCount,
    setActiveConversation,
    decreaseUnread,
    onMessage,
  }
})
