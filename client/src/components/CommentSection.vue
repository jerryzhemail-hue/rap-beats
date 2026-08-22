<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchComments, postComment, deleteComment } from '@/api/comments'
import type { Comment } from '@/api/comments'
import { formatTime } from '@/utils/format'

const props = defineProps<{
  beatId: number
}>()

const authStore = useAuthStore()

const comments = ref<Comment[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(0)
const loading = ref(false)
const submitting = ref(false)
const newContent = ref('')
const deletingId = ref<number | null>(null)

const canLoadMore = computed(() => page.value < totalPages.value)
const isLoggedIn = computed(() => authStore.isAuthenticated)
const currentUser = computed(() => authStore.user)

function canDelete(comment: Comment): boolean {
  if (!isLoggedIn.value || !currentUser.value) return false
  return comment.user_id === currentUser.value.id || currentUser.value.role === 'admin'
}

async function loadComments() {
  loading.value = true
  try {
    const data = await fetchComments(props.beatId, page.value) as any
    if (page.value === 1) {
      comments.value = data.comments
    } else {
      comments.value = [...comments.value, ...data.comments]
    }
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (e) {
    console.error('Failed to load comments', e)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  const content = newContent.value.trim()
  if (!content || submitting.value) return
  submitting.value = true
  try {
    const comment = await postComment(props.beatId, content) as Comment
    comments.value.unshift(comment)
    total.value++
    newContent.value = ''
  } catch (e: any) {
    alert(e.message || '评论发送失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: number) {
  if (deletingId.value !== null) return
  if (!confirm('确定要删除这条评论吗？')) return
  deletingId.value = id
  try {
    await deleteComment(id)
    comments.value = comments.value.filter(c => c.id !== id)
    total.value--
  } catch (e: any) {
    alert(e.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}

function loadMore() {
  page.value++
  loadComments()
}

onMounted(() => {
  loadComments()
})
</script>

<template>
  <div class="comment-section">
    <h3 class="section-title">评论 ({{ total }})</h3>

    <!-- 输入区 -->
    <div class="comment-input">
      <textarea
        v-model="newContent"
        :disabled="!isLoggedIn"
        :placeholder="isLoggedIn ? '写下你的评论...' : '登录后可评论'"
        maxlength="500"
        rows="3"
        class="input-area"
      ></textarea>
      <div class="input-footer">
        <span v-if="isLoggedIn" class="char-count">{{ newContent.length }}/500</span>
        <button
          v-if="isLoggedIn"
          class="btn btn-submit"
          :disabled="!newContent.trim() || submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '发送中...' : '发送' }}
        </button>
      </div>
    </div>

    <!-- 评论列表 -->
    <div v-if="loading && comments.length === 0" class="empty-hint">加载中...</div>

    <div v-else-if="comments.length === 0" class="empty-hint">暂无评论，快来抢沙发</div>

    <div v-else class="comment-list">
      <div v-for="comment in comments" :key="comment.id" class="comment-item">
        <div class="comment-header">
          <span class="comment-username">{{ comment.username }}</span>
          <span class="comment-time">{{ formatTime(comment.created_at) }}</span>
          <button
            v-if="canDelete(comment)"
            class="btn-delete"
            :disabled="deletingId === comment.id"
            @click="handleDelete(comment.id)"
          >
            {{ deletingId === comment.id ? '删除中...' : '删除' }}
          </button>
        </div>
        <p class="comment-content">{{ comment.content }}</p>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="canLoadMore" class="load-more">
      <button class="btn btn-outline" @click="loadMore" :disabled="loading">
        {{ loading ? '加载中...' : '加载更多' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.comment-section {
  margin-top: 48px;
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 20px 0;
}

.comment-input {
  margin-bottom: 24px;
}

.input-area {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s ease;
}

.input-area:focus {
  outline: none;
  border-color: var(--accent);
}

.input-area:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-area::placeholder {
  color: var(--text-secondary);
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.char-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-submit {
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-submit:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.comment-username {
  font-weight: 600;
  font-size: 14px;
  color: var(--accent);
}

.comment-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-delete {
  margin-left: auto;
  font-size: 12px;
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  transition: opacity 0.2s ease;
}

.btn-delete:hover:not(:disabled) {
  opacity: 0.7;
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
}

.empty-hint {
  text-align: center;
  padding: 32px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
