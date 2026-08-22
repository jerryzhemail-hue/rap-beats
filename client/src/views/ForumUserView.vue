<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  fetchForumUser,
  fetchFollowStatus,
  followUser,
  unfollowUser,
  fetchForumUserPosts,
  fetchUserFollowers,
  fetchUserFollowings,
  ensureConversation,
  type ForumUser,
  type ForumPost,
} from '@/api/forum'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const userId = computed(() => parseInt(route.params.userId as string))

const user = ref<ForumUser | null>(null)
const followStatus = ref({ is_following: false, is_followed_by: false })
const posts = ref<ForumPost[]>([])
const postsTotal = ref(0)
const loading = ref(false)
const activeTab = ref<'posts' | 'followers' | 'followings'>('posts')
const followersList = ref<any[]>([])
const followingsList = ref<any[]>([])
const followersTotal = ref(0)
const followingsTotal = ref(0)
const loadingFollowers = ref(false)
const loadingFollowings = ref(false)

const isOwnProfile = computed(() => authStore.user?.id === userId.value)

async function loadUser() {
  loading.value = true
  try {
    const [userData, postsData] = await Promise.all([
      fetchForumUser(userId.value),
      fetchForumUserPosts(userId.value),
    ])
    user.value = userData.user
    posts.value = postsData.posts
    postsTotal.value = postsData.pagination.total
    
    if (!isOwnProfile.value && authStore.isAuthenticated) {
      const status = await fetchFollowStatus(userId.value)
      followStatus.value = status
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadFollowers() {
  if (followersList.value.length > 0) return
  loadingFollowers.value = true
  try {
    const data = await fetchUserFollowers(userId.value)
    followersList.value = data.followers
    followersTotal.value = data.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loadingFollowers.value = false
  }
}

async function loadFollowings() {
  if (followingsList.value.length > 0) return
  loadingFollowings.value = true
  try {
    const data = await fetchUserFollowings(userId.value)
    followingsList.value = data.followings
    followingsTotal.value = data.pagination.total
  } catch (err) {
    console.error(err)
  } finally {
    loadingFollowings.value = false
  }
}

async function handleFollow() {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  try {
    if (followStatus.value.is_following) {
      await unfollowUser(userId.value)
      followStatus.value.is_following = false
      if (user.value?.forum_profile) {
        user.value.forum_profile.follower_count = Math.max(0, (user.value.forum_profile?.follower_count ?? 1) - 1)
      }
    } else {
      await followUser(userId.value)
      followStatus.value.is_following = true
      if (user.value?.forum_profile) {
        user.value.forum_profile.follower_count = (user.value.forum_profile?.follower_count || 0) + 1
      }
    }
  } catch (err: any) {
    console.error(err)
    alert(err.message || '操作失败')
  }
}

async function startChat() {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  if (userId.value === authStore.user?.id) {
    alert('不能给自己发私信')
    return
  }
  try {
    await ensureConversation(userId.value)
  } catch (err: any) {
    alert(err?.message || '无法发起私信')
    return
  }
  const a = Math.min(userId.value, authStore.user!.id)
  const b = Math.max(userId.value, authStore.user!.id)
  const conversationId = encodeURIComponent(`${a}_${b}`)
  router.push(`/forum/messages/${conversationId}`)
}

function goToPost(postId: number) {
  router.push(`/forum/post/${postId}`)
}

function goToUser(userId: number) {
  router.push(`/forum/user/${userId}`)
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60))
      return mins <= 1 ? '刚刚' : `${mins}分钟前`
    }
    return `${hours}小时前`
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
}

onMounted(() => {
  loadUser()
})

// 切换标签时按需加载数据
watch(activeTab, (tab) => {
  if (tab === 'followers') loadFollowers()
  if (tab === 'followings') loadFollowings()
})

// 切换用户时重新加载数据
watch(userId, () => {
  user.value = null
  posts.value = []
  followStatus.value = { is_following: false, is_followed_by: false }
  followersList.value = []
  followingsList.value = []
  activeTab.value = 'posts'
  loadUser()
})
</script>

<template>
  <div class="user-page">
    <header class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <h1>{{ user?.username || '用户主页' }}</h1>
      <div class="header-spacer"></div>
    </header>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>

    <template v-else-if="user">
      <div class="user-info">
        <div class="avatar-section">
          <UserAvatar :src="user.avatar_url" :username="user.username" :size="96" />
        </div>
        <div class="info-section">
          <h2 class="username">{{ user.username }}</h2>
          
          <div v-if="user.forum_profile" class="stats-row">
            <span><strong>{{ user.forum_profile.post_count }}</strong> 帖子</span>
            <span><strong>{{ user.forum_profile.follower_count }}</strong> 粉丝</span>
            <span><strong>{{ user.forum_profile.following_count }}</strong> 关注</span>
          </div>

          <p v-if="user.forum_profile?.bio" class="bio">{{ user.forum_profile.bio }}</p>
          
          <div class="location" v-if="user.forum_profile?.location">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            {{ user.forum_profile.location }}
          </div>

          <div v-if="!isOwnProfile" class="actions">
            <button 
              class="btn btn-primary"
              @click="handleFollow"
            >
              {{ followStatus.is_following ? '已关注' : '关注' }}
            </button>
            <button class="btn btn-secondary" @click="startChat">
              发私信
            </button>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'posts' }"
          @click="activeTab = 'posts'"
        >
          帖子
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'followers' }"
          @click="activeTab = 'followers'"
        >
          粉丝
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'followings' }"
          @click="activeTab = 'followings'"
        >
          关注
        </button>
      </div>

      <div class="tab-content">
        <!-- 帖子列表 -->
        <div v-if="activeTab === 'posts'" class="posts-list">
          <div v-if="posts.length === 0" class="empty-tab">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
            <p>暂无帖子</p>
          </div>
          <div
            v-for="post in posts"
            :key="post.id"
            class="post-item"
            @click="goToPost(post.id)"
          >
            <div class="post-header">
              <span class="category-tag">{{ post.category_name }}</span>
              <span class="post-time">{{ formatTime(post.created_at) }}</span>
            </div>
            <h3 class="post-title">{{ post.title }}</h3>
            <p class="post-preview">{{ post.content_preview || post.content?.slice(0, 100) }}</p>
            <div class="post-stats">
              <span>💬 {{ post.comment_count }}</span>
              <span>❤️ {{ post.like_count }}</span>
              <span>👁️ {{ post.view_count }}</span>
            </div>
          </div>
        </div>

        <!-- 粉丝列表 -->
        <div v-if="activeTab === 'followers'" class="user-list">
          <div v-if="loadingFollowers" class="loading">
            <div class="spinner small"></div>
          </div>
          <div v-else-if="followersList.length === 0" class="empty-tab">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            <p>暂无粉丝</p>
          </div>
          <div
            v-else
            v-for="follower in followersList"
            :key="follower.id"
            class="user-item"
            @click="goToUser(follower.id)"
          >
            <UserAvatar :src="follower.avatar_url" :username="follower.username" :size="44" class="user-avatar" />
            <div class="user-item-info">
              <span class="user-item-name">{{ follower.username }}</span>
              <span class="followed-time">关注于 {{ formatTime(follower.followed_at) }}</span>
            </div>
          </div>
        </div>

        <!-- 关注列表 -->
        <div v-if="activeTab === 'followings'" class="user-list">
          <div v-if="loadingFollowings" class="loading">
            <div class="spinner small"></div>
          </div>
          <div v-else-if="followingsList.length === 0" class="empty-tab">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            <p>暂无关注</p>
          </div>
          <div
            v-else
            v-for="following in followingsList"
            :key="following.id"
            class="user-item"
            @click="goToUser(following.id)"
          >
            <UserAvatar :src="following.avatar_url" :username="following.username" :size="44" class="user-avatar" />
            <div class="user-item-info">
              <span class="user-item-name">{{ following.username }}</span>
              <span class="followed-time">关注于 {{ formatTime(following.followed_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="not-found">
      <p>用户不存在</p>
    </div>
  </div>
</template>

<style scoped>
.user-page {
  min-height: 100vh;
  background: var(--bg-primary, #0f0f14);
  color: var(--text-primary, #e8e8ed);
  padding: 0 16px;
}

.user-page > * {
  max-width: 75%;
  margin-left: auto;
  margin-right: auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
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
}

.page-header h1 {
  font-size: 18px;
  font-weight: 600;
  flex: 1;
}

.header-spacer {
  width: 36px;
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
  border-top-color: var(--accent, #6c5ce7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.user-info {
  padding: 24px 16px;
  display: flex;
  gap: 20px;
}

.avatar-section {
  flex-shrink: 0;
}

.avatar-section {
  position: relative;
}

.info-section {
  flex: 1;
  min-width: 0;
}

.username {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 12px 0;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--text-secondary, #888);
}

.stats-row strong {
  color: var(--text-primary, #e8e8ed);
  margin-right: 4px;
}

.bio {
  font-size: 14px;
  color: var(--text-secondary, #aaa);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.location {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-tertiary, #666);
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--accent, #6c5ce7);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: rgba(255,255,255,0.1);
  color: var(--text-primary, #e8e8ed);
}

.btn-secondary:hover {
  background: rgba(255,255,255,0.15);
}

.tabs {
  display: flex;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: var(--bg-secondary, #1a1a24);
}

.tab {
  flex: 1;
  padding: 14px 0;
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  font-size: 14px;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
}

.tab.active {
  color: var(--text-primary, #e8e8ed);
  font-weight: 600;
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: var(--accent, #6c5ce7);
  border-radius: 2px;
}

.tab-content {
  padding: 0 16px;
}

.empty-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 60px 0;
  color: var(--text-tertiary, #666);
  font-size: 14px;
}

.empty-tab svg {
  opacity: 0.5;
}

.posts-list {
  padding-top: 16px;
}

.post-item {
  padding: 16px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer;
  transition: background 0.2s;
}

.post-item:hover {
  background: rgba(255,255,255,0.02);
  margin: 0 -16px;
  padding: 16px;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.category-tag {
  background: rgba(108, 92, 231, 0.2);
  color: var(--accent, #6c5ce7);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.post-time {
  font-size: 12px;
  color: var(--text-tertiary, #666);
}

.post-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.post-preview {
  font-size: 14px;
  color: var(--text-secondary, #888);
  margin: 0 0 12px 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-tertiary, #666);
}

.user-list {
  padding-top: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  cursor: pointer;
  transition: background 0.2s;
}

.user-item:hover {
  background: rgba(255,255,255,0.02);
  margin: 0 -16px;
  padding: 12px 16px;
}

.user-avatar {
  width: 44px;
  height: 44px;
}

.user-item-info {
  flex: 1;
  min-width: 0;
}

.user-item-name {
  display: block;
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 2px;
}

.followed-time {
  font-size: 12px;
  color: var(--text-tertiary, #666);
}

.not-found {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #888);
}
</style>
