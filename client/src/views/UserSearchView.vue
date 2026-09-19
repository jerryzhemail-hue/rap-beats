<script setup lang="ts">
/**
 * UserSearchView.vue — 全站用户搜索结果页
 * 路由: /users/search?q=xxx&type=rapbeats|nickname
 *  - 公开页（未登录也可访问）
 *  - 支持双模式搜索：RAP BEATS 账号精确/前缀/子串 / 昵称模糊
 *  - 已登录用户可一键关注/取消关注
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { searchUsers, followUser, unfollowUser, type SocialListItem } from '@/api/user'
import { ensureConversation } from '@/api/forum'
import { ElButton } from 'element-plus'
import UserSearchResultCard from '@/views/UserSearchResultCard.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const queryText = ref<string>((route.query.q as string) || '')
const searchType = ref<'rapbeats' | 'nickname'>(
  route.query.type === 'nickname' ? 'nickname' : 'rapbeats'
)
const loading = ref(false)
const results = ref<(SocialListItem & { matched?: boolean })[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(0)
const limit = 20
const operatingId = ref<number | null>(null)
const messagingId = ref<number | null>(null)

const hasQuery = computed(() => queryText.value.trim().length > 0)

async function doSearch(reset = true) {
  if (!hasQuery.value) {
    results.value = []
    total.value = 0
    totalPages.value = 0
    return
  }
  if (reset) page.value = 1
  loading.value = true
  try {
    const data = await searchUsers({
      q: queryText.value.trim(),
      type: searchType.value,
      page: page.value,
      limit,
    })
    results.value = data.users as any
    total.value = data.total
    totalPages.value = data.totalPages
    await ensureFollowState()
  } catch (e) {
    console.error('search failed', e)
    results.value = []
  } finally {
    loading.value = false
  }
}

function submit() {
  // 更新 URL，但不刷新页面
  router.replace({
    path: '/users/search',
    query: {
      q: queryText.value.trim(),
      type: searchType.value,
    },
  }).then(() => doSearch(true))
}

function switchType(t: 'rapbeats' | 'nickname') {
  if (t === searchType.value) return
  searchType.value = t
  submit()
}

function changePage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  doSearch(false)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function toggleFollow(item: any) {
  if (!authStore.user) {
    if (router) router.push('/login')
    return
  }
  if (item.id === authStore.user.id) return
  if (operatingId.value) return
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

async function openMessage(item: any) {
  if (!authStore.user) {
    router.push('/login')
    return
  }
  if (messagingId.value === item.id) return
  messagingId.value = item.id
  try {
    const conv = await ensureConversation(item.id)
    router.push(`/forum/messages/${encodeURIComponent(conv.id)}`)
  } catch (e: any) {
    console.error('openMessage failed', e)
    alert(e?.message || '无法发起私信')
  } finally {
    messagingId.value = null
  }
}

async function ensureFollowState() {
  // 已登录但 is_followed_by_me 字段缺失时（社交接口有，搜索接口无），先全部置 false
  if (!authStore.user) return
  results.value.forEach((u) => {
    if (typeof (u as any).is_followed_by_me !== 'boolean') {
      ;(u as any).is_followed_by_me = false
    }
  })
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch([searchType, queryText], () => {
  // 防抖：避免每次按键都触发搜索
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => submit(), 300)
})
onMounted(() => {
  if (hasQuery.value) doSearch(true)
})
</script>

<template>
  <div class="search-view">
    <div class="search-bar">
      <div class="input-wrap">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          v-model="queryText"
          type="text"
          class="search-input"
          placeholder="搜索 RAP BEATS 账号或昵称..."
          maxlength="20"
          @keyup.enter="submit"
        />
        <button v-if="queryText" class="clear-btn" type="button" @click="queryText = ''; submit()">×</button>
      </div>
      <button type="button" class="submit-btn" @click="submit">搜索</button>
    </div>

    <div class="type-tabs">
      <button
        type="button"
        class="type-tab"
        :class="{ active: searchType === 'rapbeats' }"
        @click="switchType('rapbeats')"
      >搜索 RAP BEATS 账号</button>
      <button
        type="button"
        class="type-tab"
        :class="{ active: searchType === 'nickname' }"
        @click="switchType('nickname')"
      >搜索昵称</button>
    </div>

    <div v-if="!hasQuery" class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>输入关键词开始搜索</p>
      <p class="hint">
        提示：RAP BEATS 账号是登录名（如 testadmin）；昵称是个人资料里设置的展示名
      </p>
    </div>

    <div v-else-if="loading" class="list-loading">
      <div class="spinner"></div>
      <span>搜索中...</span>
    </div>

    <div v-else-if="results.length === 0" class="empty-state">
      <div class="empty-icon">😶</div>
      <p>没有找到 "{{ queryText }}" 相关用户</p>
    </div>

    <div v-else>
      <div class="result-info">
        共找到 <strong>{{ total }}</strong> 个用户
        <span v-if="queryText" class="result-info-key">"{{ queryText }}"</span>
      </div>
      <div class="user-grid">
          <UserSearchResultCard
            v-for="u in results"
            :key="u.id"
            :user="u"
            :operating-id="operatingId"
            :messaging-id="messagingId"
            @toggle-follow="toggleFollow"
            @open-message="openMessage"
          />
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <el-button :disabled="page <= 1" @click="changePage(page - 1)">‹</el-button>
        <span class="page-info">{{ page }} / {{ totalPages }} · 共 {{ total }} 人</span>
        <el-button :disabled="page >= totalPages" @click="changePage(page + 1)">›</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-view {
  width: 80%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 0 80px;
}

.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-secondary);
}
.search-input {
  width: 100%;
  height: 44px;
  padding: 0 36px 0 42px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 22px;
  outline: none;
  transition: border-color 0.15s;
}
.search-input:focus { border-color: var(--accent); }
.clear-btn {
  position: absolute;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--border);
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.clear-btn:hover { background: var(--text-secondary); color: var(--bg-card); }
.submit-btn {
  height: 44px;
  padding: 0 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 22px;
  font-weight: 600;
  cursor: pointer;
}

.type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.type-tab {
  flex: 1;
  padding: 10px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.type-tab:hover { border-color: var(--accent); color: var(--text-primary); }
.type-tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}
.empty-icon { font-size: 48px; opacity: 0.5; margin-bottom: 12px; }
.hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

.list-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
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

.result-info {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  padding: 8px 0;
}

.result-info strong {
  color: var(--text-primary);
  font-weight: 700;
  margin: 0 2px;
}

.result-info-key {
  color: var(--accent);
  font-weight: 600;
  margin-left: 4px;
}

/* ============ 三列网格布局 ============ */
.user-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .user-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .user-grid {
    grid-template-columns: 1fr;
  }
}

/* ============ 用户卡片：左中右三列 ============ */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.page-info {
  font-size: 12px;
  color: var(--text-secondary);
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
</style>
