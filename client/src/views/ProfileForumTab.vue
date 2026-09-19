<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchMyForumPosts,
  fetchMyForumFavorites,
  fetchMyForumLikes,
  fetchMyForumComments,
  deleteForumPost,
  type ForumPost,
  type ForumMyComment,
} from '@/api/forum'
import { resolveCoverUrl } from '@/utils/assets'

const router = useRouter()

type ForumSubKey = 'myposts' | 'mylikes' | 'myfavorites' | 'mycomments' | 'myaudio' | 'myimages'
const activeForumSub = ref<ForumSubKey>('myposts')

// forum
const forumMyPosts = ref<ForumPost[]>([])
const forumMyPostsTotal = ref(0)
const forumMyPostsPage = ref(1)
const forumMyPostsTotalPages = ref(1)
const forumMyPostsLoading = ref(false)

const forumMyLikes = ref<ForumPost[]>([])
const forumMyLikesTotal = ref(0)
const forumMyLikesPage = ref(1)
const forumMyLikesTotalPages = ref(1)
const forumMyLikesLoading = ref(false)

const forumMyFavorites = ref<ForumPost[]>([])
const forumMyFavoritesTotal = ref(0)
const forumMyFavoritesPage = ref(1)
const forumMyFavoritesTotalPages = ref(1)
const forumMyFavoritesLoading = ref(false)

const forumMyComments = ref<ForumMyComment[]>([])
const forumMyCommentsTotal = ref(0)
const forumMyCommentsPage = ref(1)
const forumMyCommentsTotalPages = ref(1)
const forumMyCommentsLoading = ref(false)

const forumMyAudio = ref<ForumPost[]>([])
const forumMyAudioTotal = ref(0)
const forumMyAudioPage = ref(1)
const forumMyAudioTotalPages = ref(1)
const forumMyAudioLoading = ref(false)

const forumMyImages = ref<{ post_id: number; title: string; image: string; created_at: string }[]>([])
const forumMyImagesTotal = ref(0)
const forumMyImagesPage = ref(1)
const forumMyImagesTotalPages = ref(1)
const forumMyImagesLoading = ref(false)

const forumDeleteMsg = ref('')


const forumSubTabs = [
  { key: 'myposts', label: '发布的帖子' },
  { key: 'mylikes', label: '点赞' },
  { key: 'myfavorites', label: '收藏' },
  { key: 'mycomments', label: '评论' },
  { key: 'myaudio', label: '音频记录' },
  { key: 'myimages', label: '图片记录' },
] as const

async function loadForumMyPosts() {
  forumMyPostsLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyPostsPage.value })
    forumMyPosts.value = data.posts
    forumMyPostsTotal.value = data.total
    forumMyPostsTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyPosts.value = []
  } finally {
    forumMyPostsLoading.value = false
  }
}

async function loadForumMyLikes() {
  forumMyLikesLoading.value = true
  try {
    const data = await fetchMyForumLikes({ page: forumMyLikesPage.value })
    forumMyLikes.value = data.posts
    forumMyLikesTotal.value = data.total
    forumMyLikesTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyLikes.value = []
  } finally {
    forumMyLikesLoading.value = false
  }
}

async function loadForumMyFavorites() {
  forumMyFavoritesLoading.value = true
  try {
    const data = await fetchMyForumFavorites({ page: forumMyFavoritesPage.value })
    forumMyFavorites.value = data.posts
    forumMyFavoritesTotal.value = data.total
    forumMyFavoritesTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyFavorites.value = []
  } finally {
    forumMyFavoritesLoading.value = false
  }
}

async function loadForumMyComments() {
  forumMyCommentsLoading.value = true
  try {
    const data = await fetchMyForumComments({ page: forumMyCommentsPage.value })
    forumMyComments.value = data.comments
    forumMyCommentsTotal.value = data.total
    forumMyCommentsTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyComments.value = []
  } finally {
    forumMyCommentsLoading.value = false
  }
}

async function loadForumMyAudio() {
  forumMyAudioLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyAudioPage.value })
    forumMyAudio.value = (data.posts || []).filter((p: ForumPost) => !!p.music_file || !!p.music_title)
    forumMyAudioTotal.value = data.total
    forumMyAudioTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyAudio.value = []
  } finally {
    forumMyAudioLoading.value = false
  }
}

async function loadForumMyImages() {
  forumMyImagesLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyImagesPage.value })
    const images: { post_id: number; title: string; image: string; created_at: string }[] = []
    for (const post of (data.posts || [])) {
      const postImages = Array.isArray(post.images) ? post.images : []
      for (const img of postImages.slice(0, 6)) {
        images.push({ post_id: post.id, title: post.title, image: img, created_at: post.created_at })
      }
    }
    forumMyImages.value = images
    forumMyImagesTotal.value = images.length
    forumMyImagesTotalPages.value = 1
  } catch {
    forumMyImages.value = []
  } finally {
    forumMyImagesLoading.value = false
  }
}

async function deleteForumPostById(postId: number) {
  if (!window.confirm('确定删除该帖子吗？')) return
  forumDeleteMsg.value = ''
  try {
    await deleteForumPost(postId)
    forumDeleteMsg.value = '帖子已删除'
    await loadForumMyPosts()
  } catch (err: any) {
    forumDeleteMsg.value = err.message || '删除失败'
  }
}


watch(activeForumSub, (sub) => {
  if (sub === 'myposts' && forumMyPosts.value.length === 0) loadForumMyPosts()
  if (sub === 'mylikes' && forumMyLikes.value.length === 0) loadForumMyLikes()
  if (sub === 'myfavorites' && forumMyFavorites.value.length === 0) loadForumMyFavorites()
  if (sub === 'mycomments' && forumMyComments.value.length === 0) loadForumMyComments()
  if (sub === 'myaudio' && forumMyAudio.value.length === 0) loadForumMyAudio()
  if (sub === 'myimages' && forumMyImages.value.length === 0) loadForumMyImages()
})

watch(forumMyPostsPage, loadForumMyPosts)
watch(forumMyLikesPage, loadForumMyLikes)
watch(forumMyFavoritesPage, loadForumMyFavorites)
watch(forumMyCommentsPage, loadForumMyComments)
watch(forumMyAudioPage, loadForumMyAudio)

onMounted(() => {
  loadForumMyPosts()
})
</script>

<template>
    <!-- 我的论坛 -->
    <div class="tab-content">
      <div class="forum-layout">
        <!-- 子 Tab 栏（纵向） -->
        <div class="forum-sub-tabs">
          <button
            v-for="sub in forumSubTabs"
            :key="sub.key"
            class="forum-sub-tab"
            :class="{ active: activeForumSub === sub.key }"
            @click="activeForumSub = sub.key as ForumSubKey"
          >
            {{ sub.label }}
          </button>
        </div>

        <!-- 内容区 -->
        <div class="forum-sub-content">
          <div v-if="forumDeleteMsg" class="success-msg forum-action-msg" :class="{ 'error-msg': forumDeleteMsg.includes('失败') }">
            {{ forumDeleteMsg }}
          </div>

          <!-- 发布的帖子 -->
          <div v-if="activeForumSub === 'myposts'">
        <div v-if="forumMyPostsLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyPosts.length === 0" class="empty-state">
          <span class="empty-icon">&#128221;</span>
          <p>还没有发布过帖子</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布帖子</button>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyPosts" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-stat">&#10084; {{ post.like_count }}</span>
                  <span class="forum-post-stat">&#128172; {{ post.comment_count }}</span>
                  <span class="forum-post-stat">&#128065; {{ post.view_count }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
              <button
                class="forum-post-delete"
                title="删除帖子"
                @click.stop="deleteForumPostById(post.id)"
              >&#10005;</button>
            </div>
          </div>
          <div v-if="forumMyPostsTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyPostsPage <= 1" @click="forumMyPostsPage--">上一页</button>
            <span class="page-info">{{ forumMyPostsPage }} / {{ forumMyPostsTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyPostsPage >= forumMyPostsTotalPages" @click="forumMyPostsPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 点赞 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'mylikes'">
        <div v-if="forumMyLikesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyLikes.length === 0" class="empty-state">
          <span class="empty-icon">&#10084;</span>
          <p>还没有点赞过帖子</p>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyLikes" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-author">&#64;{{ post.author_username }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
            </div>
          </div>
          <div v-if="forumMyLikesTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyLikesPage <= 1" @click="forumMyLikesPage--">上一页</button>
            <span class="page-info">{{ forumMyLikesPage }} / {{ forumMyLikesTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyLikesPage >= forumMyLikesTotalPages" @click="forumMyLikesPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 收藏 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myfavorites'">
        <div v-if="forumMyFavoritesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyFavorites.length === 0" class="empty-state">
          <span class="empty-icon">&#9733;</span>
          <p>还没有收藏帖子</p>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyFavorites" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-author">&#64;{{ post.author_username }}</span>
                  <span class="forum-post-stat">&#10084; {{ post.like_count }}</span>
                  <span class="forum-post-stat">&#128172; {{ post.comment_count }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
            </div>
          </div>
          <div v-if="forumMyFavoritesTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyFavoritesPage <= 1" @click="forumMyFavoritesPage--">上一页</button>
            <span class="page-info">{{ forumMyFavoritesPage }} / {{ forumMyFavoritesTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyFavoritesPage >= forumMyFavoritesTotalPages" @click="forumMyFavoritesPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 评论 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'mycomments'">
        <div v-if="forumMyCommentsLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyComments.length === 0" class="empty-state">
          <span class="empty-icon">&#128172;</span>
          <p>还没有评论过帖子</p>
        </div>
        <div v-else>
          <div class="forum-comment-list">
            <div v-for="comment in forumMyComments" :key="comment.id" class="forum-comment-item" @click="router.push(`/forum/post/${comment.post_id}`)">
              <div class="forum-comment-post-title">
                回复了帖子：{{ comment.post_title }}
              </div>
              <p class="forum-comment-content">{{ comment.content }}</p>
              <div class="forum-post-meta">
                <span class="forum-post-stat">&#10084; {{ comment.like_count }}</span>
                <span class="forum-post-time">{{ comment.time_ago }}</span>
              </div>
            </div>
          </div>
          <div v-if="forumMyCommentsTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyCommentsPage <= 1" @click="forumMyCommentsPage--">上一页</button>
            <span class="page-info">{{ forumMyCommentsPage }} / {{ forumMyCommentsTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyCommentsPage >= forumMyCommentsTotalPages" @click="forumMyCommentsPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 音频记录 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myaudio'">
        <div v-if="forumMyAudioLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyAudio.length === 0" class="empty-state">
          <span class="empty-icon">&#127925;</span>
          <p>还没有发布过音频</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布音频</button>
        </div>
        <div v-else>
          <div class="beats-grid">
            <div v-for="post in forumMyAudio" :key="post.id" class="audio-record-item">
              <div class="audio-record-cover" @click="router.push(`/forum/post/${post.id}`)">
                <img v-if="post.music_cover_image || post.cover_image" :src="resolveCoverUrl(post.music_cover_image || post.cover_image)" :alt="post.music_title || post.title" />
                <div v-else class="audio-record-placeholder">&#127925;</div>
                <div class="audio-play-overlay">&#9658;</div>
              </div>
              <div class="audio-record-info">
                <p class="audio-record-title">{{ post.music_title || post.title }}</p>
                <p v-if="post.music_artist" class="audio-record-artist">{{ post.music_artist }}</p>
                <div class="audio-record-meta">
                  <span v-if="post.music_bpm">{{ post.music_bpm }} BPM</span>
                  <span v-if="post.music_genre">{{ post.music_genre }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="forumMyAudioTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyAudioPage <= 1" @click="forumMyAudioPage--">上一页</button>
            <span class="page-info">{{ forumMyAudioPage }} / {{ forumMyAudioTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyAudioPage >= forumMyAudioTotalPages" @click="forumMyAudioPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 图片记录 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myimages'">
        <div v-if="forumMyImagesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyImages.length === 0" class="empty-state">
          <span class="empty-icon">&#128247;</span>
          <p>还没有发布过图片</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布图片</button>
        </div>
        <div v-else>
          <div class="forum-images-grid">
            <div v-for="(img, idx) in forumMyImages" :key="idx" class="forum-image-item">
              <img :src="img.image" :alt="img.title" @click="router.push(`/forum/post/${img.post_id}`)" />
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>

</template>
