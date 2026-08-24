<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  type ForumNotification,
} from '@/api/forum'
import { useNotificationsStore } from '@/stores/notifications'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const notificationsStore = useNotificationsStore()

const notifications = ref<ForumNotification[]>([])
const loading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const clearingAll = ref(false)
const deletingId = ref<number | null>(null)

// 实时通知列表（本地追加）
const realtimeNotifications = ref<Array<{
  id: number
  type: ForumNotification['type']
  actor_username?: string
  actor_avatar?: string
  message: string
  created_at: string
  time_ago: string
}>>([])

// 合并实时通知和历史通知
const allNotifications = computed(() => {
  return [...realtimeNotifications.value, ...notifications.value]
})

let unsubscribe: (() => void) | null = null

async function load(append = false) {
  if (!append) {
    loading.value = true
    currentPage.value = 1
  }

  try {
    const data = await fetchNotifications({ page: currentPage.value, page_size: 20 })
    if (append) {
      notifications.value = [...notifications.value, ...data.notifications]
    } else {
      notifications.value = data.notifications
    }
    hasMore.value = currentPage.value < data.pagination.total_pages
    currentPage.value++
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  await load(true)
}

async function handleRead(id: number) {
  try {
    await markNotificationRead(id)
    // 从实时列表移除
    realtimeNotifications.value = realtimeNotifications.value.filter(n => n.id !== id)
    // 标记历史列表
    const item = notifications.value.find(n => n.id === id)
    if (item) item.is_read = 1
    notificationsStore.unreadCount--
  } catch (err) {
    console.error(err)
  }
}

async function handleReadAll() {
  try {
    await markAllNotificationsRead()
    realtimeNotifications.value = []
    notifications.value.forEach(n => n.is_read = 1)
    notificationsStore.unreadCount = 0
  } catch (err) {
    console.error(err)
  }
}

async function handleDelete(id: number) {
  deletingId.value = id
  try {
    await deleteNotification(id)
    realtimeNotifications.value = realtimeNotifications.value.filter(n => n.id !== id)
    notifications.value = notifications.value.filter(n => n.id !== id)
  } catch (err) {
    console.error(err)
  } finally {
    deletingId.value = null
  }
}

async function handleClearAll() {
  if (!confirm('确认清空所有通知？此操作不可恢复。')) return
  clearingAll.value = true
  try {
    await clearAllNotifications()
    realtimeNotifications.value = []
    notifications.value = []
    notificationsStore.unreadCount = 0
  } catch (err) {
    console.error(err)
  } finally {
    clearingAll.value = false
  }
}

function getNotificationIcon(type: ForumNotification['type']) {
  switch (type) {
    case 'like_post':
    case 'like_comment':
      return { icon: '❤️', color: '#ef4444' }
    case 'comment':
      return { icon: '💬', color: '#3b82f6' }
    case 'follow':
      return { icon: '👤', color: '#8b5cf6' }
    default:
      return { icon: '🔔', color: '#f59e0b' }
  }
}

function goToTarget(notification: ForumNotification) {
  // 标记已读
  if (!notification.is_read) {
    handleRead(notification.id)
  }

  // 根据类型跳转到对应页面
  if (notification.type === 'follow') {
    router.push(`/forum/user/${notification.actor_id}`)
  } else if (notification.target_type === 'post' && notification.target_id) {
    router.push(`/forum/post/${notification.target_id}`)
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

onMounted(async () => {
  await load()

  // 订阅实时通知
  unsubscribe = notificationsStore.onNotification((payload) => {
    realtimeNotifications.value.unshift({
      id: payload.id,
      type: payload.type,
      actor_username: payload.actor_username,
      actor_avatar: payload.actor_avatar,
      message: payload.message,
      created_at: payload.created_at,
      time_ago: formatTime(payload.created_at),
    })
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <div class="notifications-page">
    <header class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <h1 class="hub-title">通知</h1>
      <div class="header-actions">
        <button
          v-if="allNotifications.length > 0"
          class="action-btn"
          @click="handleReadAll"
          title="全部已读"
        >
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
        <button
          v-if="allNotifications.length > 0"
          class="action-btn action-btn-danger"
          @click="handleClearAll"
          :disabled="clearingAll"
          title="清空"
        >
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </header>

    <div class="page-body">
      <div v-if="loading && notifications.length === 0" class="loading">
        <div class="spinner"></div>
      </div>

      <div v-else-if="allNotifications.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor" opacity="0.3">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        <p class="empty-title">暂无通知</p>
        <p class="empty-sub">收到点赞、评论和关注时会在这里显示</p>
      </div>

      <div v-else class="notification-list">
        <div
          v-for="item in allNotifications"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !('is_read' in item && item.is_read) }"
          @click="goToTarget(item)"
        >
          <div class="notification-icon" :style="{ background: getNotificationIcon(item.type).color + '22' }">
            <span class="icon-text">{{ getNotificationIcon(item.type).icon }}</span>
          </div>

          <div class="notification-content">
            <div class="notification-text">{{ item.message }}</div>
            <div class="notification-time">{{ item.time_ago }}</div>
          </div>

          <div class="notification-actions" @click.stop>
            <button
              v-if="!('is_read' in item && item.is_read)"
              class="action-icon-btn"
              @click="handleRead(item.id)"
              title="标记已读"
            >
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </button>
            <button
              class="action-icon-btn action-icon-delete"
              @click="handleDelete(item.id)"
              :disabled="deletingId === item.id"
              title="删除"
            >
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>

          <div v-if="!('is_read' in item && item.is_read)" class="unread-dot"></div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" class="load-more">
          <button v-if="loading" class="load-more-btn loading" disabled>
            <div class="spinner-small"></div>
            加载中...
          </button>
          <button v-else class="load-more-btn" @click="loadMore">
            加载更多
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notifications-page {
  min-height: 100vh;
  background: var(--bg-primary, #0f0f14);
  color: var(--text-primary, #e8e8ed);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary, #1a1a24);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: none;
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(255,255,255,0.15);
}

.hub-title {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: none;
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.action-btn:hover {
  background: rgba(255,255,255,0.15);
}

.action-btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-body {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 16px;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 80px 24px;
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #e8e8ed);
  margin: 8px 0 0;
}

.empty-sub {
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
  margin: 0;
}

.notification-list {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-secondary, #1a1a24);
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.notification-item:hover {
  background: rgba(255,255,255,0.04);
}

.notification-item.unread {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
}

.notification-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-text {
  font-size: 20px;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-text {
  font-size: 14px;
  color: var(--text-primary, #e8e8ed);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-time {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 4px;
}

.notification-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  border: none;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.action-icon-btn:hover {
  background: rgba(255,255,255,0.12);
  color: var(--text-primary, #e8e8ed);
}

.action-icon-delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.action-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.unread-dot {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #6366f1);
}

.load-more {
  padding: 16px 0;
  display: flex;
  justify-content: center;
}

.load-more-btn {
  padding: 10px 24px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.load-more-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  color: var(--text-primary, #e8e8ed);
}

.load-more-btn.loading {
  cursor: not-allowed;
}
</style>
