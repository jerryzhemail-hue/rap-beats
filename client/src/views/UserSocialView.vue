<script setup lang="ts">
/**
 * UserSocialView.vue — 公开关注/粉丝列表页
 * 路由: /u/:id/:tab (tab = following | followers)
 *  - 不需要登录即可访问
 *  - 已登录用户能看到"是否已关注"状态 + 一键关注/取消关注
 *  - 头像 → 跳转到 /u/:id 公开页
 *  - 路由变化自动重载
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  fetchSocialList,
  followUser,
  unfollowUser,
  type SocialListItem
} from '@/api/user'
import { fetchProfileFull } from '@/api/user'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const targetUserId = computed(() => parseInt(route.params.id as string))
const tab = computed<'following' | 'followers'>(() => {
  return route.params.tab === 'following' ? 'following' : 'followers'
})

// 目标用户基本信息（头部展示）
const profileFull = ref<Awaited<ReturnType<typeof fetchProfileFull>> | null>(null)
const targetLoading = ref(false)

// 列表
const users = ref<SocialListItem[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const totalPages = ref(0)
const limit = 20

// 操作中状态
const operatingId = ref<number | null>(null)

async function loadProfile() {
  if (isNaN(targetUserId.value)) return
  targetLoading.value = true
  try {
    profileFull.value = await fetchProfileFull(targetUserId.value)
  } catch {
    // 404 时不报错，由列表展示空状态
  } finally {
    targetLoading.value = false
  }
}

async function loadList() {
  if (isNaN(targetUserId.value)) return
  loading.value = true
  try {
    const data = await fetchSocialList({
      userId: targetUserId.value,
      type: tab.value,
      page: page.value,
      limit,
    })
    users.value = data.users
    total.value = data.pagination.total
    totalPages.value = data.pagination.total_pages
  } catch (e) {
    console.error('loadList failed', e)
    users.value = []
  } finally {
    loading.value = false
  }
}

watch(
  [targetUserId, tab],
  async () => {
    page.value = 1
    users.value = []
    await Promise.all([loadProfile(), loadList()])
  },
  { immediate: true }
)

function switchTab(newTab: 'following' | 'followers') {
  if (newTab === tab.value) return
  router.push(`/u/${targetUserId.value}/${newTab}`)
}

function changePage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  loadList()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function toggleFollow(item: SocialListItem) {
  if (!authStore.user) {
    if (router) router.push('/login')
    return
  }
  if (operatingId.value) return
  if (item.id === authStore.user.id) return // 不可关注自己
  operatingId.value = item.id
  try {
    if (item.is_followed_by_me) {
      await unfollowUser(item.id)
      item.is_followed_by_me = false
    } else {
      await followUser(item.id)
      item.is_followed_by_me = true
    }
  } catch (e) {
    console.error('toggleFollow failed', e)
  } finally {
    operatingId.value = null
  }
}

function visitUser(id: number) {
  router.push(`/u/${id}`)
}

const isEmpty = computed(() => !loading.value && users.value.length === 0)
const title = computed(() => {
  const name = profileFull.value?.nickname || profileFull.value?.username || `用户${targetUserId.value}`
  return tab.value === 'following' ? `${name}的关注` : `${name}的粉丝`
})
</script>

<template>
  <div class="social-view">
    <!-- 顶部用户卡片 -->
    <div v-if="profileFull" class="social-header">
      <div class="header-avatar" @click="visitUser(targetUserId)">
        <img v-if="profileFull.avatar_url" :src="profileFull.avatar_url" :alt="profileFull.username" />
        <span v-else>{{ (profileFull.nickname || profileFull.username || '?').charAt(0).toUpperCase() }}</span>
      </div>
      <div class="header-info">
        <h1 class="header-name">
          {{ profileFull.nickname || profileFull.username }}
        </h1>
        <div class="header-meta">
          <span class="account-tag">RAP BEATS 账号</span>
          <span class="account-id">{{ profileFull.username }}</span>
          <span v-if="profileFull.is_beatmaker" class="bm-badge">认证制作人</span>
        </div>
      </div>
    </div>
    <div v-else-if="targetLoading" class="header-loading">
      <div class="spinner"></div>
    </div>

    <h2 class="page-title">{{ title }}</h2>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'followers' }"
        @click="switchTab('followers')"
      >
        粉丝 <span class="count" v-if="profileFull?.stats?.follower_count != null">{{ profileFull.stats.follower_count }}</span>
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'following' }"
        @click="switchTab('following')"
      >
        关注 <span class="count" v-if="profileFull?.stats?.following_count != null">{{ profileFull.stats.following_count }}</span>
      </button>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="list-loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <div class="empty-icon">👥</div>
      <p>{{ tab === 'following' ? 'TA 还没有关注任何人' : 'TA 还没有粉丝' }}</p>
    </div>

    <ul v-else class="user-list">
      <li v-for="u in users" :key="u.id" class="user-card">
        <div class="user-avatar" @click="visitUser(u.id)">
          <img v-if="u.avatar_url" :src="u.avatar_url" :alt="u.nickname" />
          <span v-else>{{ u.nickname.charAt(0).toUpperCase() }}</span>
          <span v-if="u.is_beatmaker" class="bm-tag" title="认证制作人">★</span>
        </div>
        <div class="user-meta" @click="visitUser(u.id)">
          <div class="user-nickname">{{ u.nickname }}</div>
          <div class="user-account">
            <span class="account-mini">RAP BEATS</span>
            <span>{{ u.username }}</span>
            <span v-if="u.vip_level !== 'free'" class="vip-mini">
              {{ u.vip_level === 'basic' ? '基础' : u.vip_level === 'premium' ? '高级' : '至尊' }}
            </span>
          </div>
        </div>
        <button
          v-if="authStore.user && u.id !== authStore.user.id"
          type="button"
          class="follow-btn"
          :class="{ following: u.is_followed_by_me }"
          :disabled="operatingId === u.id"
          @click.stop="toggleFollow(u)"
        >
          {{ operatingId === u.id ? '...' : u.is_followed_by_me ? '已关注' : '关注' }}
        </button>
      </li>
    </ul>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button type="button" class="page-btn" :disabled="page <= 1" @click="changePage(page - 1)">‹</button>
      <span class="page-info">{{ page }} / {{ totalPages }} · 共 {{ total }} 人</span>
      <button type="button" class="page-btn" :disabled="page >= totalPages" @click="changePage(page + 1)">›</button>
    </div>
  </div>
</template>

<style scoped>
.social-view {
  width: 60%;
  margin: 0 auto;
  padding: 24px 20px 80px;
}

.social-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
}

.header-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  overflow: hidden;
}
.header-avatar img { width: 100%; height: 100%; object-fit: cover; }

.header-info { flex: 1; min-width: 0; }
.header-name {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.header-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.account-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  border-radius: 3px;
  letter-spacing: 0.5px;
}
.account-id { font-size: 12px; color: var(--accent); font-family: 'Menlo', 'Monaco', monospace; }
.bm-badge { font-size: 11px; color: #f59e0b; }

.header-loading,
.list-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 30px;
  color: var(--text-secondary);
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.page-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.tab-btn {
  flex: 1;
  padding: 12px 0;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.tab-btn .count {
  display: inline-block;
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.tab-btn.active .count { color: var(--accent); }

.empty-state {
  text-align: center;
  padding: 50px 20px;
  color: var(--text-secondary);
}
.empty-icon { font-size: 48px; opacity: 0.5; margin-bottom: 10px; }

.user-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: all 0.15s;
}
.user-card:hover {
  border-color: var(--accent);
  background: var(--bg-secondary);
}

.user-avatar {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  overflow: hidden;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bm-tag {
  position: absolute;
  right: -2px;
  bottom: -2px;
  background: #f59e0b;
  color: #fff;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-card);
}

.user-meta { flex: 1; min-width: 0; cursor: pointer; }
.user-nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-account {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-secondary);
}
.account-mini {
  padding: 1px 5px;
  background: var(--bg-secondary);
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  color: var(--text-secondary);
}
.vip-mini {
  padding: 1px 6px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border-radius: 3px;
  font-size: 10px;
}

.follow-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.follow-btn.following {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border);
}
.follow-btn:hover:not(:disabled) {
  opacity: 0.85;
}
.follow-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}
.page-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 12px; color: var(--text-secondary); }
</style>
