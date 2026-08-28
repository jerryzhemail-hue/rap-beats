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
import {
  fetchSystemNotifications,
  markSystemNotificationRead,
  markAllSystemNotificationsRead,
  deleteSystemNotification,
  clearSystemNotifications,
  type SystemNotification,
} from '@/api/system-notifications'
import { useNotificationsStore } from '@/stores/notifications'

const router = useRouter()
const notificationsStore = useNotificationsStore()

// Tab state: 'system' | 'forum'
const activeTab = ref<'system' | 'forum'>('system')

// System notifications
const sysNotifications = ref<SystemNotification[]>([])
const sysLoading = ref(false)
const sysClearing = ref(false)
const sysDeletingId = ref<number | null>(null)

// Forum notifications
const forumNotifications = ref<ForumNotification[]>([])
const forumLoading = ref(false)
const forumClearing = ref(false)
const forumDeletingId = ref<number | null>(null)

// Forum realtime list (incoming SSE notifications)
const realtimeForumNotifications = ref<Array<{
  id: number
  type: ForumNotification['type']
  actor_username?: string
  actor_avatar?: string
  message: string
  created_at: string
  time_ago: string
}>>([])

// System realtime list
const realtimeSystemNotifications = ref<Array<{
  id: number
  type: string
  title: string
  content: string | null
  created_at: string
  time_ago: string
}>>([])

// Computed: all notifications per tab
const allSystemNotifications = computed(() => {
  return [...realtimeSystemNotifications.value, ...sysNotifications.value]
})

const allForumNotifications = computed(() => {
  return [...realtimeForumNotifications.value, ...forumNotifications.value]
})

let forumUnsubscribe: (() => void) | null = null
let sysUnsubscribe: (() => void) | null = null

async function loadSystem() {
  sysLoading.value = true
  try {
    const data = await fetchSystemNotifications()
    sysNotifications.value = data.notifications
  } catch (err) {
    console.error(err)
  } finally {
    sysLoading.value = false
  }
}

async function loadForum() {
  forumLoading.value = true
  try {
    const data = await fetchNotifications({ page: 1, page_size: 50 })
    forumNotifications.value = data.notifications
  } catch (err) {
    console.error(err)
  } finally {
    forumLoading.value = false
  }
}

async function switchTab(tab: 'system' | 'forum') {
  activeTab.value = tab
  if (tab === 'system' && sysNotifications.value.length === 0) {
    await loadSystem()
  } else if (tab === 'forum' && forumNotifications.value.length === 0) {
    await loadForum()
  }
}

async function handleSystemRead(id: number) {
  try {
    await markSystemNotificationRead(id)
    realtimeSystemNotifications.value = realtimeSystemNotifications.value.filter(n => n.id !== id)
    const item = sysNotifications.value.find(n => n.id === id)
    if (item) item.is_read = 1
    notificationsStore.systemUnreadCount = Math.max(0, notificationsStore.systemUnreadCount - 1)
  } catch (err) {
    console.error(err)
  }
}

async function handleSystemReadAll() {
  try {
    await markAllSystemNotificationsRead()
    realtimeSystemNotifications.value = []
    sysNotifications.value.forEach(n => n.is_read = 1)
    notificationsStore.markAllSystemRead()
  } catch (err) {
    console.error(err)
  }
}

async function handleSystemDelete(id: number) {
  sysDeletingId.value = id
  try {
    await deleteSystemNotification(id)
    realtimeSystemNotifications.value = realtimeSystemNotifications.value.filter(n => n.id !== id)
    sysNotifications.value = sysNotifications.value.filter(n => n.id !== id)
  } catch (err) {
    console.error(err)
  } finally {
    sysDeletingId.value = null
  }
}

async function handleSystemClearAll() {
  if (!confirm('确认清空所有系统通知？此操作不可恢复。')) return
  sysClearing.value = true
  try {
    await clearSystemNotifications()
    realtimeSystemNotifications.value = []
    sysNotifications.value = []
    notificationsStore.markAllSystemRead()
  } catch (err) {
    console.error(err)
  } finally {
    sysClearing.value = false
  }
}

async function handleForumRead(id: number) {
  try {
    await markNotificationRead(id)
    realtimeForumNotifications.value = realtimeForumNotifications.value.filter(n => n.id !== id)
    const item = forumNotifications.value.find(n => n.id === id)
    if (item) item.is_read = 1
    notificationsStore.forumUnreadCount = Math.max(0, notificationsStore.forumUnreadCount - 1)
  } catch (err) {
    console.error(err)
  }
}

async function handleForumReadAll() {
  try {
    await markAllNotificationsRead()
    realtimeForumNotifications.value = []
    forumNotifications.value.forEach(n => n.is_read = 1)
    notificationsStore.markAllRead()
  } catch (err) {
    console.error(err)
  }
}

async function handleForumDelete(id: number) {
  forumDeletingId.value = id
  try {
    await deleteNotification(id)
    realtimeForumNotifications.value = realtimeForumNotifications.value.filter(n => n.id !== id)
    forumNotifications.value = forumNotifications.value.filter(n => n.id !== id)
  } catch (err) {
    console.error(err)
  } finally {
    forumDeletingId.value = null
  }
}

async function handleForumClearAll() {
  if (!confirm('确认清空所有论坛通知？此操作不可恢复。')) return
  forumClearing.value = true
  try {
    await clearAllNotifications()
    realtimeForumNotifications.value = []
    forumNotifications.value = []
    notificationsStore.markAllRead()
  } catch (err) {
    console.error(err)
  } finally {
    forumClearing.value = false
  }
}

function getSystemIcon(type: string) {
  if (type === 'beatmaker_approved') return { icon: '🎉', color: '#1DC981' }
  if (type === 'beatmaker_rejected') return { icon: '😞', color: '#E8463A' }
  if (type === 'vip_expiring') return { icon: '⏰', color: '#F59E0B' }
  if (type === 'vip_expired') return { icon: '💤', color: '#9CA3AF' }
  return { icon: '🔔', color: '#4B3FE3' }
}

function getForumIcon(type: ForumNotification['type']) {
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

function goToForumTarget(n: ForumNotification) {
  if (!n.is_read) handleForumRead(n.id)
  if (n.type === 'follow') {
    router.push(`/forum/user/${n.actor_id}`)
  } else if (n.target_type === 'post' && n.target_id) {
    router.push(`/forum/post/${n.target_id}`)
  }
}

function goToSystemTarget(n: SystemNotification) {
  if (!n.is_read) handleSystemRead(n.id)
  if (n.type === 'beatmaker_approved') {
    router.push('/beatmaker/profile')
  } else if (n.type === 'beatmaker_rejected') {
    router.push('/beatmaker/apply')
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
  await loadSystem()
  await loadForum()

  forumUnsubscribe = notificationsStore.onNotification((payload) => {
    realtimeForumNotifications.value.unshift({
      id: payload.id,
      type: payload.type,
      actor_username: payload.actor_username,
      actor_avatar: payload.actor_avatar,
      message: payload.message,
      created_at: payload.created_at,
      time_ago: formatTime(payload.created_at),
    })
  })

  sysUnsubscribe = notificationsStore.onSystemNotification((payload) => {
    realtimeSystemNotifications.value.unshift({
      id: payload.id,
      type: payload.type,
      title: payload.title,
      content: payload.content,
      created_at: payload.created_at,
      time_ago: formatTime(payload.created_at),
    })
  })
})

onUnmounted(() => {
  if (forumUnsubscribe) forumUnsubscribe()
  if (sysUnsubscribe) sysUnsubscribe()
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
        <template v-if="activeTab === 'system'">
          <button v-if="allSystemNotifications.length > 0" class="action-btn" @click="handleSystemReadAll" title="全部已读">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
          <button v-if="allSystemNotifications.length > 0" class="action-btn action-btn-danger" @click="handleSystemClearAll" :disabled="sysClearing" title="清空">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </template>
        <template v-else>
          <button v-if="allForumNotifications.length > 0" class="action-btn" @click="handleForumReadAll" title="全部已读">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
          <button v-if="allForumNotifications.length > 0" class="action-btn action-btn-danger" @click="handleForumClearAll" :disabled="forumClearing" title="清空">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </template>
      </div>
    </header>

    <!-- Tab switcher -->
    <div class="tab-bar">
      <button
        class="tab-item"
        :class="{ active: activeTab === 'system' }"
        @click="switchTab('system')"
      >
        系统通知
        <span v-if="notificationsStore.systemUnreadCount > 0" class="tab-badge">{{ notificationsStore.systemUnreadCount }}</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'forum' }"
        @click="switchTab('forum')"
      >
        论坛通知
        <span v-if="notificationsStore.forumUnreadCount > 0" class="tab-badge">{{ notificationsStore.forumUnreadCount }}</span>
      </button>
    </div>

    <div class="page-body">
      <!-- System tab -->
      <template v-if="activeTab === 'system'">
        <div v-if="sysLoading && sysNotifications.length === 0" class="loading">
          <div class="spinner"></div>
        </div>

        <div v-else-if="allSystemNotifications.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor" opacity="0.3">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          <p class="empty-title">暂无系统通知</p>
          <p class="empty-sub">认证审核结果、会员到期等消息会在这里显示</p>
        </div>

        <div v-else class="notification-list">
          <div
            v-for="item in allSystemNotifications"
            :key="'sys-' + item.id"
            class="notification-item"
            :class="{ unread: item.is_read === 0 }"
            @click="goToSystemTarget(item)"
          >
            <div class="notification-icon" :style="{ background: getSystemIcon(item.type).color + '22' }">
              <span class="icon-text">{{ getSystemIcon(item.type).icon }}</span>
            </div>

            <div class="notification-content">
              <div class="notification-text">{{ item.title }}</div>
              <div v-if="item.content" class="notification-desc">{{ item.content }}</div>
              <div class="notification-time">{{ ('time_ago' in item ? item.time_ago : formatTime(item.created_at)) }}</div>
            </div>

            <div class="notification-actions" @click.stop>
              <button v-if="item.is_read === 0" class="action-icon-btn" @click="handleSystemRead(item.id)" title="标记已读">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </button>
              <button class="action-icon-btn action-icon-delete" @click="handleSystemDelete(item.id)" :disabled="sysDeletingId === item.id" title="删除">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>

            <div v-if="item.is_read === 0" class="unread-dot"></div>
          </div>
        </div>
      </template>

      <!-- Forum tab -->
      <template v-else>
        <div v-if="forumLoading && forumNotifications.length === 0" class="loading">
          <div class="spinner"></div>
        </div>

        <div v-else-if="allForumNotifications.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor" opacity="0.3">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          <p class="empty-title">暂无通知</p>
          <p class="empty-sub">收到点赞、评论和关注时会在这里显示</p>
        </div>

        <div v-else class="notification-list">
          <div
            v-for="item in allForumNotifications"
            :key="'forum-' + item.id"
            class="notification-item"
            :class="{ unread: !('is_read' in item && item.is_read) }"
            @click="goToForumTarget(item)"
          >
            <div class="notification-icon" :style="{ background: getForumIcon(item.type).color + '22' }">
              <span class="icon-text">{{ getForumIcon(item.type).icon }}</span>
            </div>

            <div class="notification-content">
              <div class="notification-text">{{ item.message }}</div>
              <div class="notification-time">{{ ('time_ago' in item ? item.time_ago : formatTime(item.created_at)) }}</div>
            </div>

            <div class="notification-actions" @click.stop>
              <button v-if="!('is_read' in item && item.is_read)" class="action-icon-btn" @click="handleForumRead(item.id)" title="标记已读">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </button>
              <button class="action-icon-btn action-icon-delete" @click="handleForumDelete(item.id)" :disabled="forumDeletingId === item.id" title="删除">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>

            <div v-if="!('is_read' in item && item.is_read)" class="unread-dot"></div>
          </div>
        </div>
      </template>
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
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.08); border: none; color: var(--text-primary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.2s; flex-shrink: 0;
}
.back-btn:hover { background: rgba(255,255,255,0.15); }

.hub-title { font-size: 17px; font-weight: 600; margin: 0; flex: 1; }

.header-actions { display: flex; gap: 4px; }

.action-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.08); border: none; color: var(--text-primary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
}
.action-btn:hover { background: rgba(255,255,255,0.15); }
.action-btn-danger:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.tab-bar {
  display: flex; gap: 0;
  background: var(--bg-secondary, #1a1a24);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.tab-item {
  flex: 1; padding: 14px 16px;
  background: transparent; border: none;
  color: var(--text-secondary, #9ca3af);
  font-size: 14px; font-weight: 500;
  cursor: pointer; position: relative;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: color 0.2s;
}
.tab-item.active { color: var(--accent, #6366f1); }
.tab-item.active::after {
  content: ''; position: absolute; bottom: 0; left: 20%; right: 20%;
  height: 2px; background: var(--accent, #6366f1); border-radius: 1px;
}

.tab-badge {
  min-width: 18px; height: 18px; padding: 0 5px;
  background: var(--accent, #6366f1); color: #fff;
  border-radius: 9px; font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}

.page-body { max-width: 600px; margin: 0 auto; padding: 0 16px; }

.loading { display: flex; justify-content: center; padding: 60px 0; }
.spinner {
  width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent, #6366f1); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 80px 24px; text-align: center;
}
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 8px 0 0; }
.empty-sub { font-size: 13px; color: var(--text-secondary); margin: 0; }

.notification-list { padding: 12px 0; display: flex; flex-direction: column; gap: 4px; }

.notification-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--bg-secondary, #1a1a24);
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer; transition: background 0.15s; position: relative;
}
.notification-item:hover { background: rgba(255,255,255,0.04); }
.notification-item.unread { background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.2); }

.notification-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.icon-text { font-size: 20px; }

.notification-content { flex: 1; min-width: 0; }
.notification-text {
  font-size: 14px; color: var(--text-primary); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.notification-desc {
  font-size: 13px; color: var(--text-secondary); line-height: 1.5;
  margin-top: 6px;
}
.notification-time { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

.notification-actions { display: flex; gap: 4px; flex-shrink: 0; }
.action-icon-btn {
  width: 28px; height: 28px; border-radius: 6px;
  background: rgba(255,255,255,0.06); border: none; color: var(--text-secondary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.action-icon-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-primary); }
.action-icon-delete:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.action-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.unread-dot {
  position: absolute; top: 12px; right: 12px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent, #6366f1);
}
</style>
