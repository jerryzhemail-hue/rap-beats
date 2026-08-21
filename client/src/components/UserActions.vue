<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  fetchFollowStatus,
  followUser,
  unfollowUser,
} from '@/api/forum'

const props = withDefaults(
  defineProps<{
    userId: number | null | undefined
    username?: string | null
    /** 紧凑样式（用于帖子卡/评论区等空间有限处） */
    compact?: boolean
    /** 默认是否已经关注（由父组件传入可减少一次请求） */
    initialIsFollowing?: boolean
  }>(),
  {
    username: null,
    compact: false,
    initialIsFollowing: false,
  }
)

const emit = defineEmits<{
  'update:following': [following: boolean]
}>()

const router = useRouter()
const authStore = useAuthStore()

const isFollowing = ref(props.initialIsFollowing)
const loadingFollow = ref(false)
const startingChat = ref(false)

const isSelf = computed(() => authStore.user?.id === props.userId)
const showActions = computed(() => !!props.userId && !isSelf.value)

function buildConversationId(otherId: number): string {
  const me = authStore.user!.id
  const a = Math.min(me, otherId)
  const b = Math.max(me, otherId)
  return encodeURIComponent(`${a}_${b}`)
}

async function refreshStatus() {
  if (!authStore.isAuthenticated || !props.userId || isSelf.value) {
    return
  }
  try {
    const data = await fetchFollowStatus(props.userId)
    isFollowing.value = !!data.is_following
    emit('update:following', isFollowing.value)
  } catch (err) {
    // 静默：接口失败不影响显示
  }
}

async function handleFollow(e: Event) {
  e.stopPropagation()
  e.preventDefault()
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  if (!props.userId || isSelf.value || loadingFollow.value) return
  loadingFollow.value = true
  try {
    if (isFollowing.value) {
      await unfollowUser(props.userId)
      isFollowing.value = false
    } else {
      await followUser(props.userId)
      isFollowing.value = true
    }
    emit('update:following', isFollowing.value)
  } catch (err: any) {
    alert(err?.message || '操作失败')
  } finally {
    loadingFollow.value = false
  }
}

function handleMessage(e: Event) {
  e.stopPropagation()
  e.preventDefault()
  if (startingChat.value) return
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  if (!props.userId || isSelf.value) return
  startingChat.value = true
  try {
    const conversationId = buildConversationId(props.userId)
    router.push(`/forum/messages/${conversationId}`)
  } finally {
    startingChat.value = false
  }
}

watch(
  () => [authStore.isAuthenticated, props.userId] as const,
  ([authed, uid]) => {
    if (authed && uid) {
      refreshStatus()
    }
    if (!authed) isFollowing.value = false
  }
)

onMounted(() => {
  refreshStatus()
})
</script>

<template>
  <div v-if="showActions" class="user-actions" :class="{ compact }">
    <button
      class="action-btn follow-btn"
      :class="{ following: isFollowing }"
      :disabled="loadingFollow"
      :title="isFollowing ? '取消关注' : `关注 ${props.username || ''}`"
      @click="handleFollow"
    >
      <span class="icon" aria-hidden="true">{{ isFollowing ? '✓' : '+' }}</span>
      <span class="label">{{ isFollowing ? '已关注' : '关注' }}</span>
    </button>
    <button
      class="action-btn message-btn"
      :disabled="startingChat"
      :title="`私信 ${props.username || ''}`"
      @click="handleMessage"
    >
      <span class="icon" aria-hidden="true">✉</span>
      <span class="label">私信</span>
    </button>
  </div>
</template>

<style scoped>
.user-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-actions.compact {
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  background: transparent;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.compact .action-btn {
  padding: 4px 10px;
  font-size: 11px;
}

.action-btn .icon {
  font-size: 12px;
  font-weight: 700;
}

.follow-btn {
  background: var(--accent, #6366f1);
  color: #fff;
  border-color: var(--accent, #6366f1);
}

.follow-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.follow-btn.following {
  background: transparent;
  color: var(--text-primary, #e8e8ed);
  border-color: var(--border);
}

.follow-btn.following:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

.message-btn {
  color: var(--text-primary, #e8e8ed);
  border-color: var(--border);
}

.message-btn:hover:not(:disabled) {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
  background: rgba(99, 102, 241, 0.1);
}
</style>
