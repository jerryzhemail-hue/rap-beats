<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichContent } from '@/utils/sanitize'
import ForumAuthPrompt from '@/components/ForumAuthPrompt.vue'
import ForumMusicPlayer from '@/components/ForumMusicPlayer.vue'
import {
  fetchForumPost,
  fetchForumComments,
  createForumComment,
  deleteForumComment,
  deleteForumPost,
  toggleForumLike,
  toggleForumFavorite,
  toggleForumCommentLike,
  type ForumPost,
  type ForumComment,
} from '@/api/forum'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const authPromptRef = ref<any>(null)

const postId = Number(route.params.id)

const post = ref<ForumPost | null>(null)
const comments = ref<ForumComment[]>([])
const loading = ref(true)
const submitting = ref(false)
const submittingReply = ref<number | null>(null)
const error = ref('')
const previewIdx = ref<number | null>(null)

function previewImage(idx: number) {
  previewIdx.value = idx
}

function prevImage() {
  if (previewIdx.value !== null && previewIdx.value > 0) previewIdx.value--
}

function nextImage() {
  if (previewIdx.value !== null && previewIdx.value < (post.value?.images?.length ?? 0) - 1) previewIdx.value++
}
const replyTarget = ref<number | null>(null)
const replyContent = ref('')
const newCommentContent = ref('')

onMounted(async () => {
  await loadPost()
  await loadComments()
})

async function loadPost() {
  loading.value = true
  try {
    const data = await fetchForumPost(postId)
    post.value = data.post
  } catch (err: any) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadComments() {
  try {
    const data = await fetchForumComments(postId)
    comments.value = data.comments
  } catch (err) {
    console.error(err)
  }
}

async function handleLike() {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  if (!post.value) return
  try {
    const data = await toggleForumLike(postId)
    post.value.is_liked = data.liked
    post.value.like_count = data.like_count
  } catch (err) {
    console.error(err)
  }
}

async function handleFavorite() {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  if (!post.value) return
  try {
    const data = await toggleForumFavorite(postId)
    post.value.is_favorited = data.favorited
  } catch (err) {
    console.error(err)
  }
}

async function handleDeletePost() {
  if (!confirm('确定删除这篇帖子吗？')) return
  try {
    await deleteForumPost(postId)
    router.push('/forum')
  } catch (err: any) {
    alert(err.message || '删除失败')
  }
}

async function handleSubmitComment() {
  if (!newCommentContent.value.trim()) return
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  submitting.value = true
  try {
    const data = await createForumComment(postId, { content: newCommentContent.value.trim() })
    comments.value.push(data.comment)
    newCommentContent.value = ''
    if (post.value) post.value.comment_count++
  } catch (err: any) {
    alert(err.message || '评论失败')
  } finally {
    submitting.value = false
  }
}

async function handleSubmitReply(parentId: number) {
  if (!replyContent.value.trim()) return
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  submittingReply.value = parentId
  try {
    const data = await createForumComment(postId, { content: replyContent.value.trim(), parent_id: parentId })
    const parent = comments.value.find((c) => c.id === parentId)
    if (parent) {
      if (!parent.replies) parent.replies = []
      parent.replies.push(data.comment)
    }
    replyContent.value = ''
    replyTarget.value = null
    if (post.value) post.value.comment_count++
  } catch (err: any) {
    alert(err.message || '回复失败')
  } finally {
    submittingReply.value = null
  }
}

async function handleDeleteComment(comment: ForumComment) {
  if (!confirm('确定删除这条评论？')) return
  try {
    await deleteForumComment(comment.id)
    const parent = comments.value.find((c) => c.id === comment.parent_id)
    if (parent) {
      parent.replies = parent.replies?.filter((r) => r.id !== comment.id)
    } else {
      comments.value = comments.value.filter((c) => c.id !== comment.id)
    }
    if (post.value) post.value.comment_count--
  } catch (err: any) {
    alert(err.message || '删除失败')
  }
}

async function handleCommentLike(comment: ForumComment) {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  try {
    const data = await toggleForumCommentLike(comment.id)
    comment.is_liked = data.liked
    comment.like_count = data.like_count
  } catch (err) {
    console.error(err)
  }
}

function startReply(commentId: number) {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  replyTarget.value = commentId
  replyContent.value = ''
}

function cancelReply() {
  replyTarget.value = null
  replyContent.value = ''
}

function canDelete(authorId: number) {
  return authStore.isAuthenticated && (authStore.user?.id === authorId || authStore.isAdmin)
}

function getAvatarLetter(username: string) {
  return username?.charAt(0)?.toUpperCase() || 'U'
}
</script>

<template>
  <div class="post-page">
    <ForumAuthPrompt ref="authPromptRef" />
    <!-- 返回 -->
    <div class="post-topbar">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="loading-state">加载中...</div>

    <!-- 帖子主体 -->
    <div v-else-if="post" class="post-content-card">
      <!-- 分类标签 -->
      <div class="post-meta-top">
        <span class="post-cat-badge">{{ post.category_name }}</span>
        <span v-if="post.is_pinned" class="badge-pinned">置顶</span>
        <span v-if="post.is_essence" class="badge-essence">精华</span>
      </div>

      <!-- 标题（纯文本，转义处理） -->
      <h1 class="post-title">{{ post.title }}</h1>

      <!-- 作者行 -->
      <div class="post-author-row">
        <div class="author-avatar">
          <img v-if="post.author_avatar" :src="post.author_avatar" :alt="post.author_username" />
          <span v-else>{{ getAvatarLetter(post.author_username) }}</span>
        </div>
        <div class="author-info">
          <span class="author-name">{{ post.author_username }}</span>
          <span class="post-date">{{ post.time_ago }}</span>
        </div>
        <div class="post-stats">
          <span>👁 {{ post.view_count }}</span>
          <span>❤️ {{ post.like_count }}</span>
        </div>
      </div>

      <!-- 话题标签 -->
      <div v-if="post.topics?.length" class="post-topics">
        <span v-for="t in post.topics" :key="t.id" class="topic-tag"># {{ t.name }}</span>
      </div>

      <!-- 正文（服务端已做过 XSS 白名单过滤，前端再加一层 DOMPurify 纵深防御） -->
      <div class="post-body" v-html="sanitizeRichContent(post.content)"></div>

      <!-- 视频播放器 -->
      <div v-if="post.video_url" class="post-video-wrap">
        <video
          :src="post.video_url"
          :poster="post.video_cover || ''"
          controls
          preload="metadata"
          playsinline
          class="post-video"
        ></video>
      </div>

      <!-- 音乐播放器 -->
      <ForumMusicPlayer
        v-if="post.music_file"
        :src="post.music_file"
        :cover-image="post.music_cover_image"
        :title="post.music_title || undefined"
        :artist="post.music_artist || undefined"
        :genre="post.music_genre || undefined"
        :bpm="post.music_bpm ?? undefined"
        :allow-download="post.allow_download"
      />

      <!-- 图片画廊 -->
      <div v-if="post.images?.length" class="post-images" :class="{ 'single': post.images.length === 1, 'multi': post.images.length > 1 }">
        <img
          v-for="(img, idx) in post.images"
          :key="idx"
          class="post-image"
          :src="img"
          alt="帖子图片"
          @click="previewImage(idx)"
        />
      </div>

      <!-- 图片预览弹框 -->
      <Teleport to="body">
        <div v-if="previewIdx !== null" class="image-preview-modal" @click="previewIdx = null">
          <button class="preview-close" @click="previewIdx = null">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <img class="preview-img" :src="post.images![previewIdx]" @click.stop />
          <div v-if="post.images!.length > 1" class="preview-nav">
            <button :disabled="previewIdx === 0" @click.stop="prevImage">‹</button>
            <span>{{ previewIdx! + 1 }} / {{ post.images!.length }}</span>
            <button :disabled="previewIdx === post.images!.length - 1" @click.stop="nextImage">›</button>
          </div>
        </div>
      </Teleport>

      <!-- 操作栏 -->
      <div class="post-action-bar">
        <button class="action-btn" :class="{ liked: post.is_liked }" @click="handleLike">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" :fill="post.is_liked ? 'var(--accent)' : 'none'"/>
          </svg>
          {{ post.is_liked ? '已赞' : '赞' }} {{ post.like_count }}
        </button>
        <button class="action-btn" :class="{ liked: post.is_favorited }" @click="handleFavorite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" :fill="post.is_favorited ? 'var(--accent)' : 'none'"/>
          </svg>
          {{ post.is_favorited ? '已收藏' : '收藏' }}
        </button>
        <button v-if="canDelete(post.user_id)" class="action-btn action-delete" @click="handleDeletePost">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          删除
        </button>
      </div>
    </div>

    <!-- 评论区 -->
    <div v-if="post" class="comments-section">
      <h2 class="comments-title">评论 {{ post.comment_count }}</h2>

      <!-- 发布评论 -->
      <div class="comment-form">
        <div class="comment-avatar">
          <img v-if="authStore.user?.avatar_url" :src="authStore.user.avatar_url" :alt="authStore.user?.username" />
          <span v-else>{{ getAvatarLetter(authStore.user?.username || 'U') }}</span>
        </div>
        <div class="comment-input-wrap">
          <textarea
            v-model="newCommentContent"
            class="comment-textarea"
            placeholder="写下你的评论..."
            rows="3"
          />
          <div class="comment-submit-row">
            <button
              class="btn-submit"
              :disabled="!newCommentContent.trim() || submitting"
              @click="handleSubmitComment"
            >
              {{ submitting ? '发送中...' : '发表评论' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 评论列表 -->
      <div class="comments-list">
        <div v-for="comment in comments" :key="comment.id" class="comment-item">
          <div class="comment-avatar">
            <img v-if="comment.author_avatar" :src="comment.author_avatar" :alt="comment.author_username" />
            <span v-else>{{ getAvatarLetter(comment.author_username) }}</span>
          </div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author">{{ comment.author_username }}</span>
              <span class="comment-time">{{ comment.time_ago }}</span>
              <button
                v-if="canDelete(comment.user_id)"
                class="comment-delete"
                @click="handleDeleteComment(comment)"
              >删除</button>
            </div>
            <div class="comment-text">{{ comment.content }}</div>
            <div class="comment-actions">
              <button class="reply-btn" @click="startReply(comment.id)">回复</button>
              <button class="like-btn" :class="{ liked: comment.is_liked }" @click="handleCommentLike(comment)">
                {{ comment.is_liked ? '❤️' : '🤍' }} {{ comment.like_count > 0 ? comment.like_count : '' }}
              </button>
            </div>

            <!-- 回复表单 -->
            <div v-if="replyTarget === comment.id" class="reply-form">
              <textarea
                v-model="replyContent"
                class="comment-textarea"
                placeholder="写下你的回复..."
                rows="2"
              />
              <div class="reply-form-actions">
                <button class="btn-cancel-reply" @click="cancelReply">取消</button>
                <button
                  class="btn-submit"
                  :disabled="!replyContent.trim() || submittingReply !== null"
                  @click="handleSubmitReply(comment.id)"
                >
                  {{ submittingReply === comment.id ? '发送中...' : '发送' }}
                </button>
              </div>
            </div>

            <!-- 子回复 -->
            <div v-if="comment.replies?.length" class="replies-list">
              <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                <div class="comment-avatar avatar-sm">
                  <img v-if="reply.author_avatar" :src="reply.author_avatar" :alt="reply.author_username" />
                  <span v-else>{{ getAvatarLetter(reply.author_username) }}</span>
                </div>
                <div class="comment-body">
                  <div class="comment-header">
                    <span class="comment-author">{{ reply.author_username }}</span>
                    <span class="comment-time">{{ reply.time_ago }}</span>
                    <button
                      v-if="canDelete(reply.user_id)"
                      class="comment-delete"
                      @click="handleDeleteComment(reply)"
                    >删除</button>
                  </div>
                  <div class="comment-text">{{ reply.content }}</div>
                  <div class="comment-actions">
                    <button class="like-btn" :class="{ liked: reply.is_liked }" @click="handleCommentLike(reply)">
                      {{ reply.is_liked ? '❤️' : '🤍' }} {{ reply.like_count > 0 ? reply.like_count : '' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="comments.length === 0" class="no-comments">
          还没有评论，来抢沙发吧 🎤
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.post-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 16px;
}
.post-topbar {
  margin-bottom: 16px;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  background: transparent;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}
.back-btn:hover { background: var(--bg-card); color: var(--text-primary); }

.loading-state { text-align: center; color: var(--text-secondary); padding: 60px; }

.post-content-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 28px 32px;
  margin-bottom: 24px;
}
.post-meta-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.post-cat-badge {
  font-size: 12px;
  background: var(--accent-light);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 12px;
}
.badge-pinned { font-size: 11px; background: #f59e0b33; color: #f59e0b; padding: 2px 8px; border-radius: 10px; }
.badge-essence { font-size: 11px; background: #ef444433; color: #ef4444; padding: 2px 8px; border-radius: 10px; }

.post-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 16px;
  line-height: 1.4;
}
.post-author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.author-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.author-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-sm { width: 28px; height: 28px; font-size: 12px; }
.author-info { display: flex; flex-direction: column; }
.author-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.post-date { font-size: 12px; color: var(--text-secondary); }
.post-stats {
  margin-left: auto;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.post-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
}
.topic-tag {
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-light);
  padding: 3px 10px;
  border-radius: 12px;
  cursor: pointer;
}
.topic-tag:hover { background: rgba(124,58,237,0.2); }


.post-images {
  margin-top: 16px;
}
/* 单图：最大宽度展示 */
.post-images.single {
  display: flex;
  justify-content: flex-start;
}
.post-images.single .post-image {
  width: auto;
  max-width: 100%;
  max-height: 500px;
  height: auto;
}
/* 多图：网格展示 */
.post-images.multi {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.post-images.multi .post-image {
  width: 100%;
  height: 180px;
}
.post-image {
  object-fit: cover;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  border: 1px solid var(--border);
}
.post-image:hover {
  opacity: 0.85;
  transform: scale(1.02);
}

.image-preview-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
}
.preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255,255,255,0.1);
  border: none;
  color: #fff;
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-img {
  max-width: 90vw;
  max-height: 80vh;
  object-fit: contain;
  border-radius: var(--radius);
}
.preview-nav {
  display: flex;
  align-items: center;
  gap: 20px;
  color: #fff;
  font-size: 14px;
}
.preview-nav button {
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  transition: background 0.15s;
}
.preview-nav button:hover:not(:disabled) { background: rgba(255,255,255,0.3); }
.preview-nav button:disabled { opacity: 0.3; cursor: not-allowed; }

.post-video-wrap {
  margin: 16px 0;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.post-video {
  width: 100%;
  max-height: 540px;
  background: #000;
  border-radius: var(--radius-sm);
  display: block;
}

.post-body {
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.8;
  word-break: break-word;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

/* 内容中的行内图片 */
.post-body :deep(img) {
  max-width: 100%;
  max-height: 400px;
  width: auto;
  display: block;
  margin: 12px 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: opacity 0.15s;
}
.post-body :deep(img:hover) {
  opacity: 0.85;
}

/* 富文本样式 */
.post-body :deep(h1),
.post-body :deep(h2),
.post-body :deep(h3) {
  margin: 16px 0 8px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}
.post-body :deep(h1) { font-size: 22px; }
.post-body :deep(h2) { font-size: 18px; }
.post-body :deep(h3) { font-size: 16px; }

.post-body :deep(p) {
  margin: 8px 0;
}

.post-body :deep(blockquote) {
  margin: 12px 0;
  padding: 10px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
}

.post-body :deep(pre) {
  margin: 12px 0;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  overflow-x: auto;
}

.post-body :deep(ul),
.post-body :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.post-body :deep(li) {
  margin: 4px 0;
}

.post-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}

.post-body :deep(strong),
.post-body :deep(b) {
  font-weight: 700;
}

.post-body :deep(em),
.post-body :deep(i) {
  font-style: italic;
}

.post-body :deep(u) {
  text-decoration: underline;
}

.post-body :deep(s),
.post-body :deep(strike) {
  text-decoration: line-through;
}

.post-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border: none;
}
.action-btn:hover { background: var(--border); color: var(--text-primary); }
.action-btn.liked { color: var(--accent); background: var(--accent-light); }
.action-delete:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

/* ─── 评论区 ──────────────────────────────────────────────────────────── */
.comments-section {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 24px 28px;
}
.comments-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 20px;
}

.comment-form {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
}
.comment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
.comment-input-wrap { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.comment-textarea {
  background: var(--bg-secondary);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.comment-textarea:focus { border-color: var(--accent); }
.comment-textarea::placeholder { color: var(--text-secondary); }
.comment-submit-row { display: flex; justify-content: flex-end; }

.btn-submit {
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  border: none;
}
.btn-submit:hover:not(:disabled) { background: var(--accent-hover); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.comments-list { display: flex; flex-direction: column; gap: 20px; }
.comment-item { display: flex; gap: 12px; }
.comment-body { flex: 1; }
.comment-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.comment-author { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.comment-time { font-size: 12px; color: var(--text-secondary); }
.comment-delete {
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  padding: 2px 6px;
  border-radius: 4px;
  border: none;
  margin-left: auto;
}
.comment-delete:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
.comment-text { font-size: 14px; color: var(--text-primary); line-height: 1.6; white-space: pre-wrap; }
.reply-btn {
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 4px 0;
  margin-top: 6px;
}
.reply-btn:hover { color: var(--accent); }

.comment-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 6px;
}
.like-btn {
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 4px 0;
  transition: color 0.15s;
}
.like-btn:hover { color: #ef4444; }
.like-btn.liked { color: #ef4444; }

.reply-form { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.reply-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn-cancel-reply {
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}
.btn-cancel-reply:hover { color: var(--text-primary); }

.replies-list {
  margin-top: 12px;
  padding-left: 16px;
  border-left: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.reply-item { display: flex; gap: 10px; }

.no-comments {
  text-align: center;
  color: var(--text-secondary);
  padding: 30px;
  font-size: 14px;
}
</style>
