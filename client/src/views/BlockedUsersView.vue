<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchBlockList, unblockUser } from '@/api/forum'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()

const users = ref<Array<{ id: number; username: string; avatar_url: string | null }>>([])
const loading = ref(false)
const removingId = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    const data = await fetchBlockList()
    users.value = data.users
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function handleUnblock(userId: number, username: string) {
  if (!confirm(`确认移除对「${username}」的拉黑？`)) return
  removingId.value = userId
  try {
    await unblockUser(userId)
    users.value = users.value.filter((u) => u.id !== userId)
  } catch (err: any) {
    alert(err?.message || '移除失败')
  } finally {
    removingId.value = null
  }
}

function goToUser(userId: number) {
  router.push(`/forum/user/${userId}`)
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="blocked-page">
    <header class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <h1 class="hub-title">黑名单</h1>
      <div class="header-spacer"></div>
    </header>

    <div class="page-body">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
      </div>

      <div v-else-if="users.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor" opacity="0.3">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
        <p class="empty-title">黑名单为空</p>
        <p class="empty-sub">被拉黑的用户将无法给你发私信</p>
      </div>

      <div v-else class="user-list">
        <div
          v-for="user in users"
          :key="user.id"
          class="user-item"
        >
          <button class="avatar-btn" @click="goToUser(user.id)">
            <UserAvatar :src="user.avatar_url" :username="user.username" :size="48" />
          </button>
          <div class="user-info" @click="goToUser(user.id)">
            <span class="username">{{ user.username }}</span>
            <span class="hint">已拉黑，无法收发私信</span>
          </div>
          <button
            class="unblock-btn"
            :disabled="removingId === user.id"
            @click="handleUnblock(user.id, user.username)"
          >
            {{ removingId === user.id ? '移除中...' : '移除黑名单' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blocked-page {
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

.header-spacer {
  width: 36px;
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

.user-list {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg-secondary, #1a1a24);
  border: 1px solid rgba(255,255,255,0.05);
  transition: background 0.15s;
}

.user-item:hover {
  background: rgba(255,255,255,0.04);
}

.avatar-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.avatar-btn:hover {
  opacity: 0.85;
}

.user-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.username {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e8e8ed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 2px;
}

.unblock-btn {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.unblock-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}

.unblock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
