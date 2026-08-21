<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import twemoji from 'twemoji'
import { sanitizeRichContent } from '@/utils/sanitize'
import ForumAuthPrompt from '@/components/ForumAuthPrompt.vue'
import {
  fetchForumCategories,
  fetchForumTopics,
  fetchForumPosts,
  fetchSignInStatus,
  doSignIn,
  toggleForumLike,
  toggleForumFavorite,
  type ForumCategory,
  type ForumTopic,
  type ForumPost,
} from '@/api/forum'
import UserActions from '@/components/UserActions.vue'

const router = useRouter()
const authStore = useAuthStore()
const authPromptRef = ref<any>(null)

// ─── Data ───────────────────────────────────────────────────────────────────
const categories = ref<ForumCategory[]>([])
const topics = ref<ForumTopic[]>([])
const posts = ref<ForumPost[]>([])
const total = ref(0)
const currentPage = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const sort = ref<'latest' | 'hot'>('latest')
const activeCategoryId = ref<number | null>(null)

// ─── 签到 ──────────────────────────────────────────────────────────────────
const signInStatus = ref({ signed_today: false, consecutive_days: 0, total_points: 0 })
const signingIn = ref(false)
const signInMsg = ref('')

// ─── Computed ───────────────────────────────────────────────────────────────
const hasMore = computed(() => posts.value.length < total.value)

// ─── Load ──────────────────────────────────────────────────────────────────
async function loadInit() {
  loading.value = true
  try {
    const [catsData, topicsData, postsData, signData] = await Promise.all([
      fetchForumCategories(),
      fetchForumTopics(),
      fetchForumPosts({ category_id: activeCategoryId.value ?? undefined, sort: sort.value, page: 1, limit: 20 }),
      authStore.isAuthenticated ? fetchSignInStatus() : Promise.resolve(null),
    ])
    categories.value = catsData.categories
    topics.value = topicsData.topics
    posts.value = postsData.posts
    total.value = postsData.total
    currentPage.value = 1
    if (signData) signInStatus.value = signData
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const data = await fetchForumPosts({
      category_id: activeCategoryId.value ?? undefined,
      sort: sort.value,
      page: currentPage.value + 1,
      limit: 20,
    })
    posts.value.push(...data.posts)
    total.value = data.total
    currentPage.value++
  } catch (err) {
    console.error(err)
  } finally {
    loadingMore.value = false
  }
}

// ─── 签到 ──────────────────────────────────────────────────────────────────
async function handleSignIn() {
  if (signInStatus.value.signed_today) return
  signingIn.value = true
  try {
    const data = await doSignIn()
    signInStatus.value = { signed_today: true, consecutive_days: data.consecutive_days ?? 1, total_points: data.total_points }
    signInMsg.value = data.message
    setTimeout(() => { signInMsg.value = '' }, 3000)
  } catch (err: any) {
    signInMsg.value = err.message || '签到失败'
    setTimeout(() => { signInMsg.value = '' }, 3000)
  } finally {
    signingIn.value = false
  }
}

// ─── 交互 ──────────────────────────────────────────────────────────────────
async function handleLike(post: ForumPost) {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  try {
    const data = await toggleForumLike(post.id)
    post.is_liked = data.liked
    post.like_count = data.like_count
  } catch (err) {
    console.error(err)
  }
}

async function handleFavorite(post: ForumPost) {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  try {
    const data = await toggleForumFavorite(post.id)
    post.is_favorited = data.favorited
  } catch (err) {
    console.error(err)
  }
}

function goToPost(post: ForumPost) {
  router.push(`/forum/post/${post.id}`)
}

function goToNewPost() {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  router.push('/forum/new')
}

// ─── 切换分类 ──────────────────────────────────────────────────────────────
function selectCategory(id: number | null) {
  activeCategoryId.value = id
  loadInit()
}

// ─── 切换排序 ──────────────────────────────────────────────────────────────
function changeSort(s: 'latest' | 'hot') {
  sort.value = s
  loadInit()
}

// ─── 滚动加载 ──────────────────────────────────────────────────────────────
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  loadInit()
  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { threshold: 0.1 }
  )
  if (sentinelRef.value) observer.observe(sentinelRef.value)
})

watch(sentinelRef, (el) => {
  if (el && observer) observer.observe(el)
})

function getTopicHref(topic: ForumTopic) {
  return `/forum?topic=${topic.slug}`
}

function getAvatarLetter(username: string) {
  return username?.charAt(0)?.toUpperCase() || 'U'
}

function renderEmoji(text: string): string {
  if (!text) return ''
  // 先用 DOMPurify 过滤 XSS，再用 twemoji 转 emoji（用于正文预览）
  const safe = sanitizeRichContent(text)
  return twemoji.parse(safe, { base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/', ext: '.png' })
}

function toggleAudio(e: Event, post: ForumPost) {
  e.stopPropagation()
  const audio = (e.target as HTMLElement).closest('.post-music-card')?.querySelector('audio') as HTMLAudioElement | null
  if (!audio) return
  if (post._playing) {
    audio.pause()
    post._playing = false
  } else {
    // 暂停其他卡片的音频
    posts.value.forEach(p => { if (p.id !== post.id) p._playing = false })
    document.querySelectorAll('.mc-audio').forEach((el: any) => { if (el !== audio) el.pause() })
    audio.play()
    post._playing = true
  }
}

// ─── 图片预览 ───────────────────────────────────────────────────────────────
const previewPost = ref<ForumPost | null>(null)
const previewIdx = ref<number | null>(null)

function openPreview(post: ForumPost, idx: number) {
  previewPost.value = post
  previewIdx.value = idx
}
function closePreview() {
  previewIdx.value = null
  previewPost.value = null
}
function prevImage() {
  if (previewIdx.value !== null && previewPost.value && previewIdx.value > 0) {
    previewIdx.value--
  }
}
function nextImage() {
  if (previewIdx.value !== null && previewPost.value && previewIdx.value < previewPost.value.images.length - 1) {
    previewIdx.value++
  }
}
</script>

<template>
  <div class="forum-page">
    <ForumAuthPrompt ref="authPromptRef" />
    <!-- 左侧栏：分类导航 -->
    <aside class="forum-sidebar-left">
      <div class="sidebar-section">
        <div class="sidebar-title">版块</div>
        <button
          class="cat-item"
          :class="{ active: activeCategoryId === null }"
          @click="selectCategory(null)"
        >
          <span class="cat-icon">📋</span>
          <span class="cat-name">全部</span>
        </button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="cat-item"
          :class="{ active: activeCategoryId === cat.id }"
          @click="selectCategory(cat.id)"
        >
          <span class="cat-icon">{{ cat.icon }}</span>
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ cat.post_count }}</span>
        </button>
      </div>
    </aside>

    <!-- 中间栏：帖子信息流 -->
    <main class="forum-main">
      <!-- 顶部 Tab -->
      <div class="feed-header">
        <div class="feed-tabs">
          <button
            class="feed-tab"
            :class="{ active: sort === 'latest' }"
            @click="changeSort('latest')"
          >最新</button>
          <button
            class="feed-tab"
            :class="{ active: sort === 'hot' }"
            @click="changeSort('hot')"
          >热门</button>
        </div>
        <button class="new-post-btn" @click="goToNewPost">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          发帖
        </button>
      </div>

      <!-- 加载态 -->
      <div v-if="loading" class="forum-loading">
        <div class="skeleton-card" v-for="i in 5" :key="i">
          <div class="skel skel-title"></div>
          <div class="skel skel-text"></div>
          <div class="skel skel-meta"></div>
        </div>
      </div>

      <!-- 空态 -->
      <div v-else-if="posts.length === 0" class="forum-empty">
        <div class="empty-icon">📭</div>
        <p>还没有帖子，快来发第一帖吧！</p>
        <button class="btn-primary" @click="goToNewPost">发布帖子</button>
      </div>

      <!-- 帖子列表 -->
      <div v-else class="post-list">
        <article
          v-for="post in posts"
          :key="post.id"
          class="post-card"
          @click="goToPost(post)"
        >
          <!-- 作者信息 -->
          <div class="post-author">
            <button
              v-if="post.user_id"
              class="author-avatar author-avatar-btn"
              :title="`查看 ${post.author_username} 的主页`"
              @click.stop="router.push(`/forum/user/${post.user_id}`)"
            >
              <img v-if="post.author_avatar" :src="post.author_avatar" :alt="post.author_username" />
              <span v-else>{{ getAvatarLetter(post.author_username) }}</span>
            </button>
            <div v-else class="author-avatar">
              <img v-if="post.author_avatar" :src="post.author_avatar" :alt="post.author_username" />
              <span v-else>{{ getAvatarLetter(post.author_username) }}</span>
            </div>
            <div class="author-info">
              <button
                v-if="post.user_id"
                class="author-name-btn"
                @click.stop="router.push(`/forum/user/${post.user_id}`)"
              >{{ post.author_username }}</button>
              <span v-else class="author-name">{{ post.author_username }}</span>
              <span class="post-time">{{ post.time_ago }}</span>
            </div>
            <UserActions
              v-if="post.user_id"
              :user-id="post.user_id"
              :username="post.author_username"
              compact
              class="post-card-actions"
              @click.stop
            />
            <span class="post-cat-tag">{{ post.category_name }}</span>
          </div>

          <!-- 内容 -->
          <h2 class="post-title" v-html="renderEmoji(post.title)"></h2>
          <p class="post-preview" v-html="renderEmoji(post.content_preview)"></p>

          <!-- 图片轮播 -->
          <div v-if="post.images?.length" class="post-images" @click.stop>
            <div class="img-masonry">
              <div
                v-for="(img, idx) in post.images.slice(0, 7)"
                :key="idx"
                class="img-item"
                @click="openPreview(post, idx)"
              >
                <img :src="img" alt="配图" loading="lazy" />
                <div v-if="idx === 6 && post.images.length > 7" class="img-more">+{{ post.images.length - 7 }}</div>
              </div>
            </div>
          </div>

          <!-- 音乐卡片 -->
          <div v-if="post.music_file" class="post-music-card" @click.stop>
            <div class="mc-waveform">
              <div class="mc-wave-bar" v-for="i in 12" :key="i" :style="{ animationDelay: `${(i * 0.07).toFixed(2)}s`, height: `${20 + Math.sin(i * 0.8) * 15}px` }"></div>
            </div>
            <div class="mc-cover">
              <img v-if="post.music_cover_image" :src="post.music_cover_image" alt="封面" />
              <div v-else class="mc-cover-placeholder">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              <button class="mc-play-btn" @click="toggleAudio($event, post)">
                <svg v-if="!post._playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              </button>
            </div>
            <div class="mc-info">
              <div class="mc-title">{{ post.music_title || '未知歌名' }}</div>
              <div class="mc-artist">{{ post.music_artist || '未知艺术家' }}</div>
              <div class="mc-meta">
                <span v-if="post.music_genre" class="mc-tag">{{ post.music_genre }}</span>
                <span v-if="post.music_bpm" class="mc-tag">{{ post.music_bpm }} BPM</span>
              </div>
            </div>
            <audio :src="post.music_file" preload="metadata" class="mc-audio" @ended="post._playing = false"></audio>
          </div>

          <!-- 话题标签 -->
          <div v-if="post.topics?.length" class="post-topics">
            <span v-for="t in post.topics.slice(0, 3)" :key="t.id" class="topic-tag"># {{ t.name }}</span>
          </div>

          <!-- 底部互动 -->
          <div class="post-actions" @click.stop>
            <button class="action-btn like-btn" :class="{ liked: post.is_liked }" @click="handleLike(post)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path class="heart-path" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {{ post.like_count || 0 }}
            </button>
            <button class="action-btn" @click="router.push(`/forum/post/${post.id}`)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {{ post.comment_count || 0 }}
            </button>
            <button class="action-btn" :class="{ favorited: post.is_favorited }" @click="handleFavorite(post)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" :fill="post.is_favorited ? 'var(--accent)' : 'none'"/>
              </svg>
              收藏
            </button>
          </div>
        </article>

        <!-- 加载更多 -->
        <div ref="sentinelRef" class="load-more-sentinel">
          <div v-if="loadingMore" class="loading-more">加载中...</div>
          <div v-else-if="!hasMore && posts.length > 0" class="no-more">— 没有更多了 —</div>
        </div>
      </div>
    </main>

    <!-- 图片预览弹框 -->
    <Teleport to="body">
      <div v-if="previewIdx !== null && previewPost" class="image-preview-modal" @click="closePreview">
        <button class="preview-close" @click="closePreview">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <img
          class="preview-img"
          :src="previewPost.images[previewIdx]"
          @click.stop
          alt="预览"
        />
        <div v-if="previewPost.images.length > 1" class="preview-nav">
          <button :disabled="previewIdx === 0" @click.stop="prevImage">‹</button>
          <span>{{ previewIdx! + 1 }} / {{ previewPost.images.length }}</span>
          <button :disabled="previewIdx === previewPost.images.length - 1" @click.stop="nextImage">›</button>
        </div>
      </div>
    </Teleport>

    <!-- 右侧栏 -->
    <aside class="forum-sidebar-right">
      <!-- 登录提示卡 -->
      <div class="right-card">
        <template v-if="!authStore.isAuthenticated">
          <div class="right-card-title">加入讨论</div>
          <p class="right-card-desc">登录后可以发帖、评论、签到得积分</p>
          <div class="right-card-btns">
            <RouterLink to="/login" class="btn-primary btn-sm">登录</RouterLink>
            <RouterLink to="/register" class="btn-outline btn-sm">注册</RouterLink>
          </div>
        </template>
        <template v-else>
          <div class="user-info-row">
            <div class="user-avatar-sm">
              <img v-if="authStore.user?.avatar_url" :src="authStore.user.avatar_url" :alt="authStore.user.username" />
              <span v-else>{{ getAvatarLetter(authStore.user?.username || '') }}</span>
            </div>
            <div>
              <div class="user-name-sm">{{ authStore.user?.username }}</div>
              <div class="user-points">
                <span class="points-icon">⭐</span>
                {{ signInStatus.total_points }} 积分
              </div>
            </div>
          </div>
          <button
            class="sign-in-btn"
            :class="{ signed: signInStatus.signed_today }"
            :disabled="signInStatus.signed_today || signingIn"
            @click="handleSignIn"
          >
            <span v-if="signingIn">签到中...</span>
            <span v-else-if="signInStatus.signed_today">✅ 今日已签到</span>
            <span v-else>📅 每日签到 +1</span>
          </button>
          <div v-if="signInMsg" class="sign-msg">{{ signInMsg }}</div>
          <div v-if="signInStatus.consecutive_days > 0 && signInStatus.signed_today" class="consecutive-days">
            连续签到 <strong>{{ signInStatus.consecutive_days }}</strong> 天
          </div>
          <RouterLink to="/points" class="points-center-link">
            <span class="points-icon">⭐</span>
            积分中心
            <span class="arrow">→</span>
          </RouterLink>
          <RouterLink to="/vip" class="vip-center-link">
            <span class="vip-icon">👑</span>
            会员中心
            <span class="arrow">→</span>
          </RouterLink>
        </template>
      </div>

      <!-- 热门话题 -->
      <div class="right-card">
        <div class="right-card-title">热门话题</div>
        <div class="topic-list">
          <RouterLink
            v-for="(topic, idx) in topics"
            :key="topic.id"
            :to="getTopicHref(topic)"
            class="topic-item"
          >
            <span class="topic-rank" :class="{ top: idx < 3 }">{{ idx + 1 }}</span>
            <div class="topic-info">
              <span class="topic-name"># {{ topic.name }}</span>
              <span class="topic-count">{{ topic.post_count }} 帖</span>
            </div>
          </RouterLink>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* 布局 */
.forum-page {
  display: grid;
  grid-template-columns: 200px 1fr 260px;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px;
  min-height: calc(100vh - 120px);
}

/* 左侧栏 */
.forum-sidebar-left {
  position: sticky;
  top: 80px;
  height: fit-content;
}
.sidebar-section {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 12px;
}
.sidebar-title {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  background: transparent;
}
.cat-item:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.cat-item.active {
  background: var(--accent-light);
  color: var(--accent);
}
.cat-icon { font-size: 15px; width: 20px; text-align: center; }
.cat-name { flex: 1; text-align: left; }
.cat-count {
  font-size: 11px;
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--text-secondary);
}

/* 主栏 */
.forum-main { min-width: 0; }

.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 8px 16px;
}
.feed-tabs { display: flex; gap: 4px; }
.feed-tab {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  background: transparent;
}
.feed-tab:hover { color: var(--text-primary); }
.feed-tab.active {
  background: var(--accent);
  color: #fff;
}
.new-post-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.new-post-btn:hover { background: var(--accent-hover); }

/* 加载骨架屏 */
.forum-loading { display: flex; flex-direction: column; gap: 12px; }
.skeleton-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 20px;
}
.skel {
  background: linear-gradient(90deg, var(--bg-secondary) 25%, #2e2e48 50%, var(--bg-secondary) 75%);
  background-size: 200%;
  border-radius: 6px;
  animation: shimmer 1.2s infinite;
}
.skel-title { height: 18px; width: 60%; margin-bottom: 12px; }
.skel-text { height: 14px; width: 90%; margin-bottom: 8px; }
.skel-meta { height: 12px; width: 40%; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 空态 */
.forum-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  gap: 12px;
  color: var(--text-secondary);
}
.empty-icon { font-size: 48px; }
.btn-primary {
  padding: 10px 24px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  border: none;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-outline {
  padding: 9px 20px;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: transparent;
  text-decoration: none;
  display: inline-block;
}
.btn-outline:hover { border-color: var(--accent); }
.btn-primary.btn-sm, .btn-outline.btn-sm { padding: 7px 16px; font-size: 13px; }

/* 帖子卡片 */
.post-list { display: flex; flex-direction: column; gap: 12px; }
.post-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 18px 20px;
  cursor: pointer;
  transition: background 0.15s;
}
.post-card:hover { background: #2a2a50; }

.post-author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.author-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.author-avatar img { width: 100%; height: 100%; object-fit: cover; }
.author-avatar-btn {
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.author-avatar-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px var(--accent-light, rgba(99, 102, 241, 0.3));
}
.author-info { display: flex; flex-direction: column; }
.author-name { font-size: 13px; font-weight: 600; color: var(--text-primary); line-height: 1.2; }
.author-name-btn {
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
}
.author-name-btn:hover { color: var(--accent); }
.post-time { font-size: 11px; color: var(--text-secondary); line-height: 1.2; }
.post-card-actions { margin-left: 8px; }
.post-cat-tag {
  margin-left: auto;
  font-size: 11px;
  background: var(--bg-secondary);
  padding: 2px 8px;
  border-radius: 10px;
  color: var(--text-secondary);
}
.post-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-primary);
  line-height: 1.4;
}
.post-preview {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 10px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.post-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.topic-tag {
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-light);
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
}
.topic-tag:hover { background: rgba(124, 58, 237, 0.2); }

/* 图片瀑布流 */
.post-images { margin-bottom: 10px; }
.img-masonry {
  columns: 3;
  column-gap: 4px;
}
.img-masonry .img-item {
  break-inside: avoid;
  margin-bottom: 4px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  display: block;
}
.img-masonry .img-item img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.3s;
}
.img-masonry .img-item:hover img { transform: scale(1.05); }
.img-more {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  border-radius: 6px;
}

/* 音乐卡片 */
.post-music-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(0,0,0,0.3));
  border-radius: 14px;
  margin-bottom: 10px;
  border: 1px solid rgba(124, 58, 237, 0.2);
  cursor: default;
  position: relative;
  overflow: hidden;
}
.post-music-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(124,58,237,0.04), transparent);
  pointer-events: none;
}
.mc-waveform {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.25;
  pointer-events: none;
}
.mc-wave-bar {
  width: 3px;
  background: var(--accent);
  border-radius: 2px;
  animation: wavePulse 1.2s ease-in-out infinite alternate;
}
@keyframes wavePulse {
  from { transform: scaleY(0.4); }
  to   { transform: scaleY(1); }
}
.mc-cover {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, #252540, #1a1a30);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.mc-cover img { width: 100%; height: 100%; object-fit: cover; }
.mc-cover-placeholder { display: flex; align-items: center; justify-content: center; }
.mc-play-btn {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.4);
  color: #fff;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 10px;
}
.mc-cover:hover .mc-play-btn { opacity: 1; }
.mc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1;
}
.mc-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mc-artist {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mc-meta { display: flex; gap: 4px; margin-top: 2px; }
.mc-tag {
  font-size: 10px;
  color: var(--accent);
  background: rgba(124,58,237,0.15);
  padding: 1px 6px;
  border-radius: 8px;
}
.mc-audio {
  display: none;
}

.post-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
  background: transparent;
  padding: 4px 6px;
  border-radius: 6px;
}
.action-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
.like-btn { position: relative; overflow: visible; }
.like-btn:active .heart-path { transform: scale(0.8); }
.heart-path {
  transition: fill 0.2s ease, transform 0.15s ease;
  transform-origin: center;
}
.like-btn.liked .heart-path { fill: var(--accent); animation: heartPop 0.35s ease; }

@keyframes heartPop {
  0% { transform: scale(1); }
  30% { transform: scale(1.35); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.action-btn.favorited { color: var(--accent); }

.load-more-sentinel { padding: 20px 0; text-align: center; }
.loading-more { color: var(--text-secondary); font-size: 13px; }
.no-more { color: var(--text-secondary); font-size: 12px; }

/* 右侧栏 */
.forum-sidebar-right {
  position: sticky;
  top: 80px;
  height: fit-content;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.right-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
}
.right-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.right-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  line-height: 1.5;
}
.right-card-btns {
  display: flex;
  gap: 8px;
}
.right-card-btns > * { flex: 1; text-align: center; }

.user-info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.user-avatar-sm {
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
.user-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }
.user-name-sm { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.user-points { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-secondary); }
.points-icon { font-size: 11px; }

.sign-in-btn {
  width: 100%;
  padding: 9px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  border: none;
  margin-bottom: 8px;
}
.sign-in-btn:hover:not(:disabled) { background: var(--accent-hover); }
.sign-in-btn.signed { background: var(--bg-secondary); color: var(--text-secondary); cursor: default; }
.sign-in-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.sign-msg { font-size: 12px; color: var(--accent); text-align: center; }
.consecutive-days { font-size: 12px; color: var(--text-secondary); text-align: center; margin-top: 4px; }
.consecutive-days strong { color: var(--accent); }

.points-center-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  color: #d97706;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.points-center-link:hover {
  background: linear-gradient(135deg, #fde68a, #fcd34d);
  transform: translateY(-1px);
}

.points-center-link .arrow {
  margin-left: auto;
  font-size: 14px;
}

.vip-center-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  color: #d97706;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.vip-center-link:hover {
  background: linear-gradient(135deg, #fde68a, #fcd34d);
  transform: translateY(-1px);
}

.vip-center-link .arrow {
  margin-left: auto;
  font-size: 14px;
}

.vip-center-link .vip-icon {
  font-size: 16px;
}

.topic-list { display: flex; flex-direction: column; gap: 4px; }
.topic-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--text-primary);
}
.topic-item:hover { background: var(--bg-secondary); }
.topic-rank {
  font-size: 12px;
  color: var(--text-secondary);
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.topic-rank.top { color: var(--accent); font-weight: 700; }
.topic-info { display: flex; flex-direction: column; }
.topic-name { font-size: 13px; }
.topic-count { font-size: 11px; color: var(--text-secondary); }

/* 图片预览 */
.image-preview-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.88);
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
  transition: background 0.15s;
}
.preview-close:hover { background: rgba(255,255,255,0.2); }
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
</style>
