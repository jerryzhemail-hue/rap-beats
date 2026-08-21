<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore, type IncomingMessagePayload } from '@/stores/messages'
import {
  fetchMessageConversations,
  fetchConversationMessages,
  fetchUserFollowings,
  fetchFollowStatus,
  fetchBlockStatus,
  sendMessage,
  markConversationRead,
  deleteConversation,
  blockUser,
  unblockUser,
  searchUsers,
  type ForumConversation,
  type ForumMessage,
} from '@/api/forum'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

// ─── 会话列表 ──────────────────────────────────────────────────────────
const conversations = ref<ForumConversation[]>([])
const loadingConversations = ref(false)
// 未读私信总数：使用全局 SSE store 单点维护的值（AppHeader 角标与本页共用）
const unreadTotal = computed(() => messagesStore.unreadCount)
const conversationQuery = ref('')
let convRefreshTimer: number | null = null
let unsubscribeMessage: (() => void) | null = null

const filteredConversations = computed(() => {
  const q = conversationQuery.value.trim().toLowerCase()
  if (!q) return conversations.value
  return conversations.value.filter((c) =>
    (c.other_user?.username || '').toLowerCase().includes(q)
  )
})

async function loadConversations() {
  loadingConversations.value = true
  try {
    const data = await fetchMessageConversations()
    conversations.value = data.conversations
  } catch (err) {
    console.error(err)
  } finally {
    loadingConversations.value = false
  }
}

const activeConversationId = computed(() => {
  const cid = route.params.conversationId
  return cid ? decodeURIComponent(cid as string) : ''
})

watch(activeConversationId, async (cid, prev) => {
  // 同步给全局 store：SSE 收到该会话新消息时将标记已读、不再 +1 未读
  messagesStore.setActiveConversation(cid)
  if (!cid) return
  await loadMessages(cid)
  await loadFollowStatus()
  if (prev !== cid) {
    const conv = conversations.value.find((c) => c.id === cid)
    if (conv && conv.unread_count > 0) {
      messagesStore.decreaseUnread(conv.unread_count)
      conv.unread_count = 0
    }
  }
})

// ─── 聊天消息 ──────────────────────────────────────────────────────────
const messages = ref<ForumMessage[]>([])
const messagesContainer = ref<HTMLElement | null>(null)
const loadingMessages = ref(false)
const hasMoreMessages = ref(false)
const currentPage = ref(1)
const loadingMore = ref(false)

const otherUserId = computed(() => {
  if (!authStore.user) return 0
  const cid = activeConversationId.value
  if (!cid) return 0
  const parts = cid.split('_')
  if (parts.length !== 2) return 0
  const [a, b] = parts.map(Number)
  return a === authStore.user.id ? b : a
})

const otherUsername = ref('')
const otherAvatar = ref<string | null>(null)

async function loadMessages(conversationId: string, showLoading = true) {
  if (showLoading) loadingMessages.value = true
  currentPage.value = 1
  try {
    const data = await fetchConversationMessages(conversationId, { page_size: 100 })
    messages.value = data.messages.sort((a, b) => a.id - b.id)
    hasMoreMessages.value = data.pagination.page < data.pagination.total_pages
    await markConversationRead(conversationId)
    const other = messages.value.find((m) => m.sender_id !== authStore.user?.id)
    if (other) {
      otherUsername.value = other.sender_username || ''
      otherAvatar.value = other.sender_avatar || null
    } else {
      await fetchOtherUserProfile()
    }
    scrollToBottom(false)
  } catch (err: any) {
    if (
      err?.message?.includes('会话不存在') ||
      err?.message?.includes('无权访问')
    ) {
      messages.value = []
    } else {
      console.error(err)
    }
  } finally {
    loadingMessages.value = false
  }
}

async function loadMoreMessages() {
  const cid = activeConversationId.value
  if (!cid || loadingMore.value || !hasMoreMessages.value) return
  loadingMore.value = true
  try {
    const nextPage = currentPage.value + 1
    const data = await fetchConversationMessages(cid, { page: nextPage, page_size: 100 })
    const existingIds = new Set(messages.value.map((m) => m.id))
    const newOnes = data.messages.filter((m) => !existingIds.has(m.id))
    messages.value = [...newOnes, ...messages.value].sort((a, b) => a.id - b.id)
    currentPage.value = nextPage
    hasMoreMessages.value = data.pagination.page < data.pagination.total_pages
  } catch (err) {
    console.error(err)
  } finally {
    loadingMore.value = false
  }
}

async function fetchOtherUserProfile() {
  if (!otherUserId.value) return
  try {
    const res = await fetch(`/api/forum/users/${otherUserId.value}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const d = await res.json()
      otherUsername.value = d.user?.username || ''
      otherAvatar.value = d.user?.avatar_url || null
    }
  } catch {}
}

// ─── 关注关系 & 消息限制 ──────────────────────────────────────────────
const isFollowing = ref(false)
const isFollowedBy = ref(false)
const blockedByMe = ref(false)
const blockedMe = ref(false)
const serverError = ref('')

async function loadFollowStatus() {
  if (!otherUserId.value) return
  try {
    const [fs, bs] = await Promise.all([
      fetchFollowStatus(otherUserId.value).catch(() => ({
        is_following: false,
        is_followed_by: false,
      })),
      fetchBlockStatus(otherUserId.value).catch(() => ({
        blocked_by_me: false,
        blocked_me: false,
      })),
    ])
    isFollowing.value = fs.is_following
    isFollowedBy.value = fs.is_followed_by
    blockedByMe.value = bs.blocked_by_me
    blockedMe.value = bs.blocked_me
  } catch {
    isFollowing.value = false
    isFollowedBy.value = false
  }
}

// 我一共给对方发了多少条 text
const mySentTextCount = computed(() => {
  return messages.value.filter(
    (m) => m.sender_id === authStore.user?.id && (m.message_type || 'text') === 'text'
  ).length
})
// 对方回复过我
const hasReplied = computed(() => {
  return messages.value.some(
    (m) => m.sender_id !== authStore.user?.id && (m.message_type || 'text') === 'text'
  )
})

const canSendMessage = computed(() => {
  if (!otherUserId.value) return false
  if (blockedByMe.value || blockedMe.value) return false
  if (isFollowing.value || isFollowedBy.value) return true
  // 对方未关注我，我也未关注对方 → 限制
  if (hasReplied.value) return true
  return mySentTextCount.value < 1
})

const limitMessage = computed(() => {
  if (blockedMe.value) return '你已被对方拉黑，无法发送消息'
  if (blockedByMe.value) return '你已拉黑该用户，无法发送消息。点击右上角撤销拉黑后可继续聊天'
  if (isFollowing.value || isFollowedBy.value) return ''
  if (hasReplied.value) return ''
  return '由于对方并未关注你，在收到对方回复之前，你最多只能发送 1 条文字消息'
})

// ─── 输入栏 ──────────────────────────────────────────────────────────
const newMessage = ref('')
const sending = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
watch(newMessage, () => nextTick(autoResize))

async function send() {
  const content = newMessage.value.trim()
  if (!content || sending.value) return
  if (!otherUserId.value) {
    alert('无法确定收件人')
    return
  }
  if (!canSendMessage.value) {
    alert(limitMessage.value || '暂无法发送消息')
    return
  }
  serverError.value = ''
  sending.value = true
  try {
    const data = await sendMessage({
      receiver_id: otherUserId.value,
      content,
    })
    messages.value.push(data.message)
    newMessage.value = ''
    await nextTick()
    autoResize()
    scrollToBottom(true)
    const cid = activeConversationId.value
    const conv = conversations.value.find((c) => c.id === cid)
    if (conv) {
      conv.last_message_content = content
      conv.last_message_at = new Date().toISOString()
    }
  } catch (err: any) {
    console.error(err)
    serverError.value = err?.message || '发送失败'
    alert(serverError.value)
  } finally {
    sending.value = false
  }
}

function onEnterKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// ─── 工具 ────────────────────────────────────────────────────────────
function onMessagesScroll() {
  const el = messagesContainer.value
  if (!el || loadingMore.value || !hasMoreMessages.value) return
  if (el.scrollTop < 80) {
    loadMoreMessages()
  }
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    const el = messagesContainer.value
    if (!el) return
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  })
}

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatChatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatChatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (msgDate.getTime() === today.getTime()) return '今天'
  if (msgDate.getTime() === today.getTime() - 86400000) return '昨天'
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function shouldShowDateDivider(index: number) {
  if (index === 0) return true
  const current = new Date(messages.value[index].created_at).toDateString()
  const prev = new Date(messages.value[index - 1].created_at).toDateString()
  return current !== prev
}

function openConversation(c: ForumConversation) {
  router.push(`/forum/messages/${encodeURIComponent(c.id)}`)
}

function goToUser(userId: number) {
  if (!userId) return
  router.push(`/forum/user/${userId}`)
}

// ─── 顶部"…"菜单 ─────────────────────────────────────────────────────
const showHeaderMenu = ref(false)
function toggleHeaderMenu() { showHeaderMenu.value = !showHeaderMenu.value }
function closeHeaderMenu() { showHeaderMenu.value = false }

function menuClearChat() {
  closeHeaderMenu()
  if (!confirm('清空本地聊天记录？该操作只影响本机显示。')) return
  messages.value = []
}

async function menuDeleteConversation() {
  closeHeaderMenu()
  if (!activeConversationId.value) return
  if (!confirm('删除该会话？此操作不可撤销。')) return
  try {
    await deleteConversation(activeConversationId.value)
    // 从会话列表移除
    conversations.value = conversations.value.filter(
      (c) => c.id !== activeConversationId.value
    )
    messages.value = []
    // 跳回列表页
    router.push('/forum/messages')
  } catch (err: any) {
    alert(err?.message || '删除失败')
  }
}

async function menuToggleBlock() {
  closeHeaderMenu()
  if (!otherUserId.value) return
  const target = blockedByMe.value
  if (!target) {
    if (!confirm(`拉黑 ${otherUsername.value || '该用户'}？拉黑后将无法给对方发送消息`)) return
  } else {
    if (!confirm(`撤销对 ${otherUsername.value || '该用户'} 的拉黑？`)) return
  }
  try {
    if (target) {
      await unblockUser(otherUserId.value)
    } else {
      await blockUser(otherUserId.value)
    }
    await loadFollowStatus()
  } catch (err: any) {
    alert(err?.message || '操作失败')
  }
}

// ─── 发起新聊天弹窗 ──────────────────────────────────────────────────
const showNewChat = ref(false)
const followingList = ref<Array<{ id: number; username: string; avatar_url: string | null }>>([])
const loadingFollowings = ref(false)
const newChatQuery = ref('')
const newChatSearchResults = ref<Array<{ id: number; username: string; avatar_url: string | null }>>([])
const searchingUsers = ref(false)

async function openNewChat() {
  showNewChat.value = true
  newChatQuery.value = ''
  newChatSearchResults.value = []
  if (followingList.value.length === 0) {
    loadingFollowings.value = true
    try {
      const data = await fetchUserFollowings(authStore.user!.id, { page_size: 100 })
      followingList.value = data.followings
    } catch (err) {
      console.error(err)
    } finally {
      loadingFollowings.value = false
    }
  }
}

function closeNewChat() { showNewChat.value = false }

// 有输入时搜索全站用户，空输入时显示关注列表
watch(newChatQuery, async (q) => {
  const trimmed = q.trim()
  if (!trimmed) {
    newChatSearchResults.value = []
    return
  }
  searchingUsers.value = true
  try {
    const data = await searchUsers(trimmed)
    newChatSearchResults.value = data.users
  } catch (err) {
    console.error(err)
    newChatSearchResults.value = []
  } finally {
    searchingUsers.value = false
  }
})

const newChatDisplayList = computed(() => {
  const q = newChatQuery.value.trim()
  if (!q) return followingList.value
  return newChatSearchResults.value
})

function startChatWith(userId: number) {
  if (!authStore.user) return
  const a = Math.min(authStore.user.id, userId)
  const b = Math.max(authStore.user.id, userId)
  closeNewChat()
  router.push(`/forum/messages/${encodeURIComponent(`${a}_${b}`)}`)
}

// ─── 实时消息（SSE 推送） ─────────────────────────────────────────────
/**
 * 处理从全局 store 推送过来的实时私信事件：
 * - 属于当前打开的会话：追加消息并滚动到底部（store 已标记已读）
 * - 属于其他会话：更新会话列表预览 / 未读角标（未读 +1 已由 store 处理），
 *   若该会话不在本地列表里则拉取一次最新列表
 */
function handleIncomingMessage(payload: IncomingMessagePayload) {
  const cid = payload.conversation_id
  const msg = payload.message
  if (!msg) return
  const conv = conversations.value.find((c) => c.id === cid)

  if (cid === activeConversationId.value) {
    // 当前会话：追加消息（去重）并滚动到底部
    if (!messages.value.some((m) => m.id === msg.id)) {
      messages.value.push(msg)
      scrollToBottom(true)
    }
  } else if (conv) {
    // 其他会话：本地未读角标 +1（全局未读 +1 已由 store 处理）
    conv.unread_count = (conv.unread_count || 0) + 1
  } else {
    // 新会话不在本地列表中：拉取一次最新列表
    loadConversations()
  }

  // 更新会话列表最后一条消息预览，并提升到顶部
  if (conv) {
    conv.last_message_content = msg.content
    conv.last_message_at = msg.created_at
    conversations.value = [
      conv,
      ...conversations.value.filter((c) => c.id !== cid),
    ]
  }
}

// ─── 生命周期 ─────────────────────────────────────────────────────────
// 监听路由变化，同步当前会话 ID 到 store（支持会话间切换时实时更新未读状态）
watch(activeConversationId, (newId) => {
  messagesStore.setActiveConversation(newId)
})

onMounted(async () => {
  // 同步当前会话给 store：SSE 收到该会话新消息时将标记已读、不再 +1 全局未读
  messagesStore.setActiveConversation(activeConversationId.value)
  await loadConversations()
  if (activeConversationId.value) {
    await loadMessages(activeConversationId.value)
    await loadFollowStatus()
  }
  // 注册实时消息监听（SSE 推送到达时追加 / 更新会话列表）
  unsubscribeMessage = messagesStore.onMessage(handleIncomingMessage)
  // 仅保留低频兜底刷新会话列表（应对 SSE 连接断开或旧数据）
  convRefreshTimer = window.setInterval(() => {
    loadConversations()
  }, 60000)
})

onUnmounted(() => {
  if (convRefreshTimer) clearInterval(convRefreshTimer)
  if (unsubscribeMessage) {
    unsubscribeMessage()
    unsubscribeMessage = null
  }
  // 通知 store：已不在任何会话页面，新消息一律视为未读
  messagesStore.setActiveConversation('')
})
</script>

<template>
  <div class="messages-hub">
    <!-- 顶部 -->
    <header class="hub-header">
      <button class="back-btn" @click="router.back()" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <h1 class="hub-title">
        {{ activeConversationId ? otherUsername || '用户' : '私信' }}
      </h1>
      <button
        v-if="activeConversationId"
        class="header-menu-btn"
        @click="toggleHeaderMenu"
        aria-label="更多"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="5" cy="12" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
      <div v-else class="header-spacer"></div>

      <transition name="dropdown">
        <div v-if="showHeaderMenu" class="header-menu" @click="closeHeaderMenu">
          <div class="header-menu-arrow"></div>
          <button class="menu-item" @click="menuClearChat">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            清空聊天记录
          </button>
          <button class="menu-item" @click="menuDeleteConversation">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            删除会话
          </button>
          <button class="menu-item" :class="{ danger: !blockedByMe }" @click="menuToggleBlock">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>
            {{ blockedByMe ? '撤销拉黑' : '拉黑' }}
          </button>
        </div>
      </transition>
    </header>

    <div class="hub-body">
      <!-- 左侧会话列表面板 -->
      <aside class="conversation-panel">
        <div class="conversation-toolbar">
          <div class="conv-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              v-model="conversationQuery"
              class="conv-search-input"
              placeholder="搜索联系人"
              type="text"
            />
          </div>
        </div>

        <div class="conversation-list">
          <div v-if="loadingConversations && conversations.length === 0" class="loading">
            <div class="spinner"></div>
          </div>
          <div v-else-if="filteredConversations.length === 0" class="empty-list">
            <p>{{ conversationQuery ? '没有匹配的联系人' : '还没有私信对话' }}</p>
            <button v-if="!conversationQuery" class="empty-action" @click="openNewChat">
              开始第一段对话
            </button>
          </div>
          <button
            v-for="conv in filteredConversations"
            :key="conv.id"
            class="conversation-item"
            :class="{ active: conv.id === activeConversationId }"
            @click="openConversation(conv)"
          >
            <UserAvatar
              :src="conv.other_user?.avatar_url"
              :username="conv.other_user?.username || '用户'"
              :size="44"
            />
            <div class="conv-content">
              <div class="conv-row1">
                <span class="conv-name">{{ conv.other_user?.username || '未知用户' }}</span>
                <span class="conv-time">{{ formatTime(conv.last_message_at) }}</span>
              </div>
              <div class="conv-row2">
                <span class="conv-preview">{{ conv.last_message_content || '暂无消息' }}</span>
                <span v-if="conv.unread_count > 0" class="conv-badge">
                  {{ conv.unread_count > 99 ? '99+' : conv.unread_count }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <!-- 右侧聊天 -->
      <main class="chat-pane">
        <template v-if="activeConversationId">
          <div ref="messagesContainer" class="messages-container" @scroll="onMessagesScroll">
            <div v-if="loadingMore" class="load-more-bar">
              <div class="spinner-sm"></div>
              <span>加载更多...</span>
            </div>
            <div v-if="loadingMessages && messages.length === 0" class="loading">
              <div class="spinner"></div>
            </div>
            <div v-else-if="messages.length === 0" class="empty-chat">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.4">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
              <p>还没有消息，发送第一条消息开启对话吧</p>
            </div>
            <template v-else>
              <template v-for="(msg, index) in messages" :key="msg.id">
                <div v-if="shouldShowDateDivider(index)" class="date-divider">
                  <span>{{ formatChatDate(msg.created_at) }}</span>
                </div>
                <div
                  class="message"
                  :class="{ 'message-sent': msg.sender_id === authStore.user?.id, 'message-received': msg.sender_id !== authStore.user?.id }"
                >
                  <button
                    v-if="msg.sender_id !== authStore.user?.id"
                    class="msg-avatar-btn"
                    :disabled="!msg.sender_id"
                    @click="goToUser(msg.sender_id)"
                    aria-label="查看用户主页"
                  >
                    <UserAvatar
                      :src="msg.sender_avatar"
                      :username="msg.sender_username"
                      :size="32"
                    />
                  </button>
                  <div class="message-bubble">
                    <p class="message-content">{{ msg.content }}</p>
                    <span class="message-time">{{ formatChatTime(msg.created_at) }}</span>
                  </div>
                </div>
              </template>
            </template>
          </div>

          <!-- 限制提示 -->
          <div v-if="limitMessage" class="limit-banner">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="flex-shrink:0">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span>{{ limitMessage }}</span>
          </div>

          <footer class="chat-input-bar">
            <button class="tool-btn" title="发送表情" aria-label="发送表情" disabled>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </button>
            <button class="tool-btn" title="发送图片" aria-label="发送图片" disabled>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <textarea
              ref="textareaRef"
              v-model="newMessage"
              class="chat-input"
              :placeholder="canSendMessage ? '输入消息...' : '当前无法发送消息'"
              rows="1"
              :disabled="!canSendMessage"
              @keydown="onEnterKey"
              @input="autoResize"
            />
            <button
              class="send-btn"
              :disabled="!newMessage.trim() || sending || !canSendMessage"
              @click="send"
              aria-label="发送"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </footer>
        </template>
        <div v-else class="no-conversation">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor" opacity="0.3">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          <p class="no-conv-title">选择左侧的联系人开始聊天</p>
          <p class="no-conv-sub">点击左下角 ＋ 按钮可发起新对话</p>
        </div>
      </main>
    </div>

    <!-- 发起新聊天弹窗 -->
    <Teleport to="body">
      <transition name="modal">
        <div v-if="showNewChat" class="modal-mask" @click.self="closeNewChat">
          <div class="modal-panel">
            <header class="modal-header">
              <h3>选择联系人</h3>
              <button class="modal-close" @click="closeNewChat" aria-label="关闭">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </header>
            <div class="modal-search">
              <input
                v-model="newChatQuery"
                :placeholder="newChatQuery.trim() ? '搜索全站用户...' : '搜索关注的用户...'"
                class="search-input"
              />
            </div>
            <div class="modal-body">
              <div v-if="loadingFollowings" class="loading-inline">
                <div class="spinner-sm"></div>
                <span>加载关注列表...</span>
              </div>
              <div v-else-if="searchingUsers" class="loading-inline">
                <div class="spinner-sm"></div>
                <span>搜索中...</span>
              </div>
              <div v-else-if="newChatDisplayList.length === 0" class="empty-list-sm">
                {{ newChatQuery.trim() ? '没有找到匹配的用户' : (followingList.length === 0 ? '还没有关注任何用户' : '没有匹配的用户') }}
              </div>
              <button
                v-for="user in newChatDisplayList"
                :key="user.id"
                class="user-pick"
                @click="startChatWith(user.id)"
              >
                <UserAvatar :src="user.avatar_url" :username="user.username" :size="36" />
                <span class="user-pick-name">{{ user.username }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.messages-hub {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: min(100%, 1200px);
  margin: 0 auto;
  background: var(--bg-primary, #0f0f14);
  color: var(--text-primary, #e8e8ed);
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.35);
}

/* ── Header ────────────────────────────────────────────────────────── */
.hub-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary, #1a1a24);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  z-index: 5;
  position: relative;
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
}

.hub-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-menu-btn,
.header-spacer {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
}

.header-menu-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent, #6366f1);
}

.header-menu {
  position: absolute;
  top: 56px;
  right: 12px;
  min-width: 168px;
  background: var(--bg-secondary, #1a1a24);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  text-align: left;
  transition: background 0.15s ease;
}

.menu-item:hover {
  background: rgba(255,255,255,0.06);
}

.menu-item.danger {
  color: #ef4444;
}

.menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.12);
}

.dropdown-enter-active, .dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Body ──────────────────────────────────────────────────────────── */
.hub-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* ── Conversation Panel ───────────────────────────────────────────── */
.conversation-panel {
  width: 280px;
  border-right: 1px solid rgba(255,255,255,0.06);
  background: var(--bg-secondary, #1a1a24);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

@media (max-width: 768px) {
  .conversation-panel {
    width: 100%;
    border-right: none;
  }
  .chat-pane {
    display: none;
  }
  .hub-body:has(.chat-pane > *) .conversation-panel {
    display: none;
  }
  .hub-body:has(.chat-pane > *) .chat-pane {
    display: flex;
  }
}

.conversation-toolbar {
  padding: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.conv-search {
  position: relative;
  display: flex;
  align-items: center;
}

.conv-search .search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-secondary, #9ca3af);
  pointer-events: none;
}

.conv-search-input {
  width: 100%;
  padding: 8px 10px 8px 32px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary, #e8e8ed);
  font-size: 13px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: background 0.15s, border-color 0.15s;
}

.conv-search-input:focus {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--accent, #6366f1);
}

.conversation-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.conversation-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.conversation-item:hover {
  background: rgba(255,255,255,0.04);
}

.conversation-item.active {
  background: rgba(99, 102, 241, 0.15);
}

.conv-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conv-row1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.conv-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.conv-time {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  flex-shrink: 0;
}

.conv-row2 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.conv-preview {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.conv-badge {
  background: var(--accent, #6366f1);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.empty-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary, #9ca3af);
  padding: 32px 24px;
}

.empty-list p {
  margin: 0;
  font-size: 13px;
  text-align: center;
}

.empty-action {
  margin-top: 8px;
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
}

/* ── Chat pane ─────────────────────────────────────────────────────── */
.chat-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-primary, #0f0f14);
  position: relative;
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary, #9ca3af);
}

.empty-chat p {
  font-size: 14px;
  margin: 0;
}

.no-conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary, #9ca3af);
  padding: 24px;
}

.no-conv-title {
  font-size: 16px;
  margin: 8px 0 0;
}

.no-conv-sub {
  font-size: 13px;
  margin: 0;
  opacity: 0.7;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}

.load-more-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.date-divider {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.date-divider span {
  padding: 3px 10px;
  background: rgba(255,255,255,0.06);
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
}

.message {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.message-sent { justify-content: flex-end; }
.message-received { justify-content: flex-start; }

.msg-avatar-btn {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
  line-height: 0;
}

.msg-avatar-btn:disabled { cursor: default; }
.msg-avatar-btn:not(:disabled):hover { opacity: 0.85; }

.message-bubble {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 14px;
  word-wrap: break-word;
  word-break: break-word;
}

.message-sent .message-bubble {
  background: var(--accent, #6366f1);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message-received .message-bubble {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary, #e8e8ed);
  border-bottom-left-radius: 4px;
}

.message-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message-time {
  display: block;
  font-size: 10px;
  opacity: 0.7;
  margin-top: 4px;
  text-align: right;
}

/* ── Limit Banner ─────────────────────────────────────────────────── */
.limit-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(245, 158, 11, 0.08);
  color: #f59e0b;
  font-size: 12px;
  text-align: center;
  border-top: 1px solid rgba(245, 158, 11, 0.15);
  flex-shrink: 0;
  line-height: 1.5;
}

.limit-banner span {
  flex: 1;
  text-align: left;
}

/* ── Chat input bar ────────────────────────────────────────────────── */
.chat-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px 12px;
  background: var(--bg-secondary, #1a1a24);
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.tool-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.tool-btn:not(:disabled):hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-primary, #e8e8ed);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255,255,255,0.06);
  border: none;
  border-radius: 16px;
  color: var(--text-primary, #e8e8ed);
  font-size: 14px;
  resize: none;
  font-family: inherit;
  min-height: 36px;
  max-height: 120px;
  line-height: 1.5;
  outline: none;
  transition: background 0.15s;
}

.chat-input:focus {
  background: rgba(255,255,255,0.1);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent, #6366f1);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.2s, transform 0.2s;
}

.send-btn:not(:disabled):hover { transform: scale(1.05); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Modal ──────────────────────────────────────────────────────── */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

@media (min-width: 640px) {
  .modal-mask {
    align-items: center;
  }
}

.modal-panel {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  background: var(--bg-secondary, #1a1a24);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (min-width: 640px) {
  .modal-panel {
    border-radius: 16px;
    max-height: 70vh;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-primary, #e8e8ed);
}

.modal-search {
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  background: rgba(255,255,255,0.06);
  border: 1px solid transparent;
  border-radius: 10px;
  color: inherit;
  font-size: 14px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: var(--accent, #6366f1);
  background: rgba(255,255,255,0.08);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-pick {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  color: inherit;
  text-align: left;
  transition: background 0.15s ease;
}

.user-pick:hover {
  background: rgba(255,255,255,0.06);
}

.user-pick-name {
  font-size: 14px;
  font-weight: 500;
}

.loading-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.empty-list-sm {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.2s ease;
}

.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(20px);
}
</style>
