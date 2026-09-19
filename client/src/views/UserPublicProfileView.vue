<script setup lang="ts">
/**
 * UserPublicProfileView.vue — 公开个人主页
 * 路由: /u/:id
 *  - 任何用户可访问，无需登录
 *  - 隐私：邮箱/IP 不显示
 *  - 已登录用户可关注/取消关注 + 跳转到粉丝/关注列表
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { fetchProfileFull, followUser, unfollowUser } from '@/api/user'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const targetId = computed(() => parseInt(route.params.id as string))
const loading = ref(false)
const profile = ref<Awaited<ReturnType<typeof fetchProfileFull>> | null>(null)
const notFound = ref(false)
const isFollowing = ref(false)
const followLoading = ref(false)

async function loadProfile() {
  if (isNaN(targetId.value)) {
    notFound.value = true
    return
  }
  loading.value = true
  notFound.value = false
  try {
    const data = await fetchProfileFull(targetId.value)
    profile.value = data
    isFollowing.value = data.is_followed_by_me
  } catch (e: any) {
    if (e?.message?.includes('404') || e?.status === 404) {
      notFound.value = true
    } else {
      console.error('loadProfile failed', e)
    }
  } finally {
    loading.value = false
  }
}

watch(targetId, () => loadProfile())
onMounted(() => loadProfile())

async function toggleFollow() {
  if (!authStore.user) {
    if (router) router.push('/login')
    return
  }
  if (authStore.user.id === targetId.value) return
  if (followLoading.value) return
  followLoading.value = true
  try {
    if (isFollowing.value) {
      await unfollowUser(targetId.value)
      isFollowing.value = false
      if (profile.value?.stats) {
        profile.value.stats.follower_count = Math.max(0, profile.value.stats.follower_count - 1)
      }
    } else {
      await followUser(targetId.value)
      isFollowing.value = true
      if (profile.value?.stats) {
        profile.value.stats.follower_count += 1
      }
    }
  } catch (e: any) {
    console.error('toggleFollow failed', e)
  } finally {
    followLoading.value = false
  }
}

const formatDate = (s: string) => {
  if (!s) return ''
  return new Date(s).toLocaleDateString('zh-CN')
}

const vipLabel = computed(() => {
  const v = profile.value?.vip_level
  if (v === 'ultimate') return '至尊会员'
  if (v === 'premium') return '高级会员'
  if (v === 'basic') return '基础会员'
  return null
})

const isSelf = computed(() => authStore.user?.id === targetId.value)
</script>

<template>
  <div class="public-view">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="notFound" class="empty-state">
      <div class="empty-icon">🚫</div>
      <p>用户不存在或已被删除</p>
      <button type="button" class="back-btn" @click="router.back()">返回</button>
    </div>

    <div v-else-if="profile" class="profile-content">
      <!-- 头部 -->
      <div class="profile-hero">
        <div class="avatar-circle">
          <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.username" />
          <span v-else>{{ (profile.nickname || profile.username).charAt(0).toUpperCase() }}</span>
        </div>
        <div class="profile-info">
          <h1 class="profile-name">
            {{ profile.nickname || profile.username }}
            <span v-if="profile.is_beatmaker" class="bm-inline" title="认证制作人">★</span>
          </h1>
          <div class="profile-account-row">
            <span class="account-tag">RAP BEATS 账号</span>
            <span class="account-id">{{ profile.username }}</span>
          </div>
          <div class="profile-meta">
            <span class="role-badge" :class="profile.role === 'admin' ? 'role-admin' : 'role-user'">
              {{ profile.role === 'admin' ? 'Admin' : 'User' }}
            </span>
            <span v-if="vipLabel" class="vip-badge">{{ vipLabel }}</span>
            <span class="join-date">注册于 {{ formatDate(profile.created_at) }}</span>
          </div>

          <div class="profile-stats">
            <router-link :to="`/u/${targetId}/followers`" class="stat-item">
              <span class="stat-num">{{ profile.stats.follower_count }}</span>
              <span class="stat-label">粉丝</span>
            </router-link>
            <router-link :to="`/u/${targetId}/following`" class="stat-item">
              <span class="stat-num">{{ profile.stats.following_count }}</span>
              <span class="stat-label">关注</span>
            </router-link>
            <div class="stat-item">
              <span class="stat-num">{{ profile.stats.likes_received }}</span>
              <span class="stat-label">获赞</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ profile.stats.favorites_count }}</span>
              <span class="stat-label">收藏</span>
            </div>
          </div>

          <div class="profile-actions">
            <button
              v-if="!isSelf"
              type="button"
              class="follow-btn"
              :class="{ following: isFollowing }"
              :disabled="followLoading"
              @click="toggleFollow"
            >
              {{ followLoading ? '...' : isFollowing ? '已关注' : '关注' }}
            </button>
            <router-link v-if="isSelf" to="/profile" class="edit-link">编辑个人资料</router-link>
          </div>
        </div>
      </div>

      <!-- 作品统计 -->
      <div class="profile-details">
        <div class="detail-card">
          <span class="detail-num">{{ profile.stats.post_count }}</span>
          <span class="detail-label">论坛发帖</span>
        </div>
        <div class="detail-card">
          <span class="detail-num">{{ profile.stats.beats_uploaded }}</span>
          <span class="detail-label">作品</span>
        </div>
        <div class="detail-card">
          <span class="detail-num">{{ profile.stats.favorites_count }}</span>
          <span class="detail-label">收藏</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.public-view {
  width: 80%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 80px;
}

.loading,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 20px;
  color: var(--text-secondary);
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-icon { font-size: 56px; opacity: 0.5; }
.back-btn {
  padding: 8px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 18px;
  cursor: pointer;
}

.profile-content { display: flex; flex-direction: column; gap: 16px; }

.profile-hero {
  display: flex;
  gap: 20px;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.avatar-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  font-size: 36px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.avatar-circle img { width: 100%; height: 100%; object-fit: cover; }

.profile-info { flex: 1; min-width: 0; }
.profile-name {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.bm-inline {
  background: #f59e0b;
  color: #fff;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.profile-account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.account-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  border-radius: 3px;
}
.account-id { font-size: 13px; color: var(--accent); font-family: 'Menlo', 'Monaco', monospace; }

.profile-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.role-badge,
.vip-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.role-user { background: rgba(124, 58, 237, 0.15); color: #a78bfa; }
.role-admin { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.vip-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.join-date { font-size: 12px; color: var(--text-secondary); }

.profile-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  min-width: 70px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.15s;
}
a.stat-item:hover { border-color: var(--accent); }
.stat-num { font-size: 18px; font-weight: 700; line-height: 1; }
.stat-label { font-size: 11px; color: var(--text-secondary); }

.profile-actions { display: flex; gap: 10px; align-items: center; }
.follow-btn {
  padding: 8px 22px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 18px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
.follow-btn.following {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border);
}
.follow-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.edit-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 18px;
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.detail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.detail-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
}
.detail-label {
  font-size: 12px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .profile-hero { flex-direction: column; align-items: center; text-align: center; }
  .profile-account-row { justify-content: center; }
  .profile-meta { justify-content: center; }
  .profile-stats { justify-content: center; }
  .profile-actions { justify-content: center; }
  .profile-details { grid-template-columns: 1fr; }
}
</style>
