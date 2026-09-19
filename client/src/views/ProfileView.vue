<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { resolveAvatarUrl } from '@/utils/assets'
import ProfileForumTab from '@/views/ProfileForumTab.vue'
import ProfileUploadsTab from '@/views/ProfileUploadsTab.vue'
import ProfileDownloadsTab from '@/views/ProfileDownloadsTab.vue'
import ProfileFavoritesTab from '@/views/ProfileFavoritesTab.vue'
import ProfileFeedbackTab from '@/views/ProfileFeedbackTab.vue'
import ProfileSettingsTab from '@/views/ProfileSettingsTab.vue'
import { fetchProfileFull } from '@/api/user'
import { fetchSignInStatus } from '@/api/forum'
import { formatDate } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
type TabKey = 'uploads' | 'downloads' | 'favorites' | 'forum' | 'settings' | 'feedback'

const activeTab = ref<TabKey>('downloads')

watch(() => authStore.isAdmin, (isAdmin) => {
  if (!isAdmin && activeTab.value === 'uploads') {
    activeTab.value = 'downloads'
  }
})

// 完整个人资料（头部用）
const profileFull = ref<Awaited<ReturnType<typeof fetchProfileFull>> | null>(null)
const copyAccountSuccess = ref('')
const copyAccountError = ref('')

const user = computed(() => authStore.user)

const avatarLetter = computed(() => {
  return (user.value?.username || '?')[0].toUpperCase()
})

const avatarSrc = computed(() => {
  if (user.value?.avatar_url) return resolveAvatarUrl(user.value.avatar_url)
  return ''
})

const profileTabs = computed(() => {
  const tabs = [
    { key: 'downloads', label: '下载记录' },
    { key: 'favorites', label: '我的收藏' },
    { key: 'forum', label: '我的论坛' },
    { key: 'feedback', label: '意见反馈' },
    { key: 'settings', label: '个人设置' },
  ]
  if (authStore.isAdmin) {
    tabs.splice(0, 0, { key: 'uploads', label: '我的上传' })
  }
  return tabs
})



async function loadProfileFull() {
  try {
    profileFull.value = await fetchProfileFull(undefined)
  } catch (e) {
    console.error('loadProfileFull failed', e)
  }
}

async function copyAccount() {
  copyAccountError.value = ''
  copyAccountSuccess.value = ''
  const acct = profileFull.value?.username
  if (!acct) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(acct)
    } else {
      // Fallback: 临时 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = acct
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copyAccountSuccess.value = '已复制 RAP BEATS 账号'
    setTimeout(() => { copyAccountSuccess.value = '' }, 1500)
  } catch (e) {
    copyAccountError.value = '复制失败，请手动选中'
  }
}

function switchTab(tab: TabKey) {
  activeTab.value = tab
}

onMounted(async () => {
  const tabParam = route.query.tab as string
  if (tabParam && ['uploads', 'downloads', 'favorites', 'forum', 'settings', 'feedback'].includes(tabParam)) {
    activeTab.value = tabParam as TabKey
  }
  loadSignInStatus()
  await loadProfileFull()
})

const signInStatus = ref({ signed_today: false, consecutive_days: 0, total_points: 0 })

async function loadSignInStatus() {
  if (!authStore.isAuthenticated) return
  try {
    signInStatus.value = await fetchSignInStatus()
  } catch {}
}

</script>

<template>
  <div class="profile-page container">
    <!-- 用户信息区 -->
    <div class="profile-hero">
      <div class="avatar-circle">
        <img v-if="avatarSrc" :src="avatarSrc" :alt="`${user?.username || '用户'}头像`" class="avatar-image" />
        <span v-else>{{ avatarLetter }}</span>
      </div>
      <div class="profile-info">
        <h1 class="profile-name">{{ profileFull?.nickname || user?.username }}</h1>
        <div class="profile-account-row">
          <span class="account-tag">RAP BEATS 账号</span>
          <span class="account-id">{{ user?.username }}</span>
          <button class="copy-btn" type="button" @click="copyAccount">复制</button>
          <span v-if="copyAccountSuccess" class="copy-tip copy-tip-ok">{{ copyAccountSuccess }}</span>
          <span v-if="copyAccountError" class="copy-tip copy-tip-err">{{ copyAccountError }}</span>
        </div>
        <p class="profile-email">{{ user?.email }}</p>
        <div class="profile-meta">
          <span class="role-badge" :class="user?.role === 'admin' ? 'role-admin' : 'role-user'">
            {{ user?.role === 'admin' ? 'Admin' : 'User' }}
          </span>
          <span v-if="authStore.isVip" class="role-badge" :style="{ background: authStore.vipLevel === 'basic' ? '#cd7f3233' : authStore.vipLevel === 'premium' ? '#c0c0c033' : '#f59e0b33', color: authStore.vipLevel === 'basic' ? '#cd7f32' : authStore.vipLevel === 'premium' ? '#c0c0c0' : '#f59e0b', borderColor: authStore.vipLevel === 'basic' ? '#cd7f3255' : authStore.vipLevel === 'premium' ? '#c0c0c055' : '#f59e0b55' }">
            {{ authStore.vipLevel === 'basic' ? '基础会员' : authStore.vipLevel === 'premium' ? '高级会员' : '至尊会员' }}
          </span>
          <span class="points-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
            {{ signInStatus.total_points }} 积分
          </span>
          <span class="join-date">注册于 {{ formatDate(profileFull?.created_at || '') }}</span>
        </div>

        <!-- 个人简介 -->
        <div v-if="profileFull?.bio" class="profile-bio">
          {{ profileFull.bio }}
        </div>

        <!-- 4 个 stats 数字 -->
        <div v-if="profileFull?.stats" class="profile-stats">
          <button class="stat-item" type="button" @click="router.push(`/u/${user?.id}/following`)" title="点击查看关注列表">
            <span class="stat-num">{{ profileFull.stats.following_count }}</span>
            <span class="stat-label">关注</span>
          </button>
          <button class="stat-item" type="button" @click="router.push(`/u/${user?.id}/followers`)" title="点击查看粉丝列表">
            <span class="stat-num">{{ profileFull.stats.follower_count }}</span>
            <span class="stat-label">粉丝</span>
          </button>
          <button class="stat-item" type="button" disabled title="收到的总赞数">
            <span class="stat-num">{{ profileFull.stats.likes_received }}</span>
            <span class="stat-label">获赞</span>
          </button>
          <button class="stat-item" type="button" disabled title="收藏总数">
            <span class="stat-num">{{ profileFull.stats.favorites_count }}</span>
            <span class="stat-label">收藏</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 切换栏 -->
    <div class="tab-bar">
      <button
        v-for="tab in profileTabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key as TabKey)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 我的上传 -->
    <ProfileUploadsTab v-if="activeTab === 'uploads'" />
    <ProfileDownloadsTab v-if="activeTab === 'downloads'" />
    <ProfileFavoritesTab v-if="activeTab === 'favorites'" />
    <ProfileForumTab v-if="activeTab === 'forum'" />
    <!-- 个人设置 -->
    <ProfileSettingsTab v-if="activeTab === 'settings'" @profile-saved="loadProfileFull" />
    <ProfileFeedbackTab v-if="activeTab === 'feedback'" />
  </div>
</template>

<style scoped>
.profile-page {
  width:80%;
  padding-top: 40px;
  padding-bottom: 80px;
  min-height: calc(100vh - 64px);
}

/* 用户信息区 */
.profile-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 32px 0 36px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}

.avatar-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 28px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.profile-email {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.role-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

.role-admin {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.role-user {
  background: var(--accent-light);
  color: var(--accent);
  border: 1px solid rgba(124, 58, 237, 0.3);
}

.points-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.join-date {
  font-size: 13px;
  color: var(--text-secondary);
}

.profile-bio {
  margin-top: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 500px;
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}

.tab-btn {
  padding: 14px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  position: relative;
  top: 1px;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Tab 内容区 */
.tab-content {
  min-height: 300px;
}

/* 积分中心 */
.points-overview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  border-radius: 16px;
  margin-bottom: 16px;
}

.points-overview .points-icon {
  width: 56px;
  height: 56px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.points-overview .points-info {
  flex: 1;
}

.points-overview .points-value {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.points-overview .points-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 4px;
}

.points-overview .points-detail-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.points-overview .points-detail-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sign-in-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.sign-in-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sign-in-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 14px;
}

.sign-in-streak {
  font-size: 12px;
  color: #f59e0b;
  font-weight: 600;
}

.sign-in-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sign-in-points {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.sign-in-points .points-amount {
  font-size: 24px;
  font-weight: 700;
  color: #f59e0b;
}

.sign-in-points .points-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.sign-in-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.sign-in-btn:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.sign-in-btn.disabled {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

.sign-in-btn.loading {
  opacity: 0.7;
}

.points-tasks {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.tasks-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 10px;
}

.task-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-info {
  flex: 1;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.task-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.task-reward {
  font-size: 14px;
  font-weight: 700;
  color: #22c55e;
}

.streak-rewards {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.rewards-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.rewards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.reward-item {
  text-align: center;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.reward-days {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.reward-points {
  font-size: 14px;
  font-weight: 700;
  color: #f59e0b;
}

/* 伴奏网格 */
.beats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

/* 下载记录列表 */
.download-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.download-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.download-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.dl-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.dl-info {
  flex: 1;
  min-width: 0;
}

.dl-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dl-producer {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.dl-time {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-secondary);
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 15px;
  margin: 0;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: 80px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}

.page-btn {
  padding: 8px 20px;
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.uploads-msg {
  margin-bottom: 20px;
}

.uploads-manage-grid {
  align-items: start;
}

.upload-manage-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-manage-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.manage-btn {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.manage-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.manage-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.manage-btn-danger {
  color: #ef4444;
}

.manage-btn-danger:hover {
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.upload-edit-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1000;
}

.upload-edit-card {
  width: min(100%, 520px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.upload-edit-title {
  margin: 0 0 18px;
  font-size: 20px;
  font-weight: 700;
}

.upload-edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-cover-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.upload-cover-preview,
.upload-cover-placeholder {
  width: 112px;
  height: 112px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  overflow: hidden;
  flex-shrink: 0;
}

.upload-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.upload-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.upload-cover-actions {
  flex: 1;
}

.upload-cover-input {
  width: 100%;
  color: var(--text-secondary);
}

.upload-cover-hint {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.upload-free-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.upload-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* 设置表单 */
.settings-section {
  max-width: 480px;
  margin-bottom: 48px;
}

.avatar-settings {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar-circle-large {
  width: 96px;
  height: 96px;
  font-size: 36px;
}

.avatar-actions {
  flex: 1;
}

.avatar-button-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.avatar-input {
  width: 100%;
  margin-bottom: 10px;
  color: var(--text-secondary);
}

.avatar-hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.avatar-reset-btn {
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.avatar-reset-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
}

.form-input:focus {
  border-color: var(--accent);
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
}
.form-textarea:focus { border-color: var(--accent); }

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.save-btn {
  align-self: flex-start;
  padding: 10px 28px;
  font-size: 14px;
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.success-msg {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  border: 1px solid rgba(22, 163, 74, 0.2);
  margin-bottom: 16px;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  margin-bottom: 16px;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── 论坛模块 ──────────────────────────────────────────────────────────────── */
.forum-action-msg {
  margin-bottom: 16px;
}

.forum-layout {
  display: flex;
  gap: 28px;
  align-items: flex-start;
}

.forum-sub-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  width: 120px;
  border-right: 1px solid var(--border);
  padding-right: 20px;
}

.forum-sub-content {
  flex: 1;
  min-width: 0;
}

.forum-sub-tab {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
  white-space: nowrap;
  text-align: left;
}

.forum-sub-tab:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.forum-sub-tab.active {
  color: var(--accent);
  background: rgba(124, 58, 237, 0.08);
  font-weight: 600;
}

/* 帖子列表 */
.forum-post-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.forum-post-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  position: relative;
}

.forum-post-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.forum-post-left {
  flex: 1;
  min-width: 0;
}

.forum-post-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.forum-post-preview {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

.forum-post-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.forum-post-cat {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 20px;
  border: 1px solid rgba(124, 58, 237, 0.3);
}

.forum-post-author {
  font-size: 12px;
  color: var(--text-secondary);
}

.forum-post-stat {
  font-size: 12px;
  color: var(--text-secondary);
}

.forum-post-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.pin-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: #f59e0b;
  color: #fff;
  border-radius: 4px;
  font-weight: 700;
}

.essence-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: #ec4899;
  color: #fff;
  border-radius: 4px;
  font-weight: 700;
}

.forum-post-thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.forum-post-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.forum-post-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.forum-post-delete:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* 评论列表 */
.forum-comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.forum-comment-item {
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.forum-comment-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.forum-comment-post-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forum-comment-content {
  font-size: 14px;
  margin: 0 0 8px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

/* 音频记录 */
.audio-record-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.audio-record-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-secondary);
}

.audio-record-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audio-record-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--accent);
  background: var(--accent-light);
}

.audio-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 0.2s;
}

.audio-record-cover:hover .audio-play-overlay {
  opacity: 1;
}

.audio-record-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audio-record-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-record-artist {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.audio-record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.audio-record-meta span {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 图片记录 */
.forum-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.forum-image-item {
  border-radius: var(--radius-sm);
  overflow: hidden;
  aspect-ratio: 1;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: border-color 0.2s;
}

.forum-image-item:hover {
  border-color: var(--accent);
}

.forum-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (max-width: 640px) {
  .forum-layout {
    flex-direction: column;
  }
  .forum-sub-tabs {
    flex-direction: row;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-right: 0;
    padding-bottom: 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .forum-sub-tabs::-webkit-scrollbar {
    display: none;
  }
  .forum-sub-tab {
    flex-shrink: 0;
    text-align: center;
    border-radius: 20px;
  }
  .forum-sub-tab.active {
    background: rgba(124, 58, 237, 0.08);
  }
  .profile-hero {
    gap: 16px;
  }
  .avatar-circle {
    width: 56px;
    height: 56px;
    font-size: 22px;
  }
  .profile-name {
    font-size: 20px;
  }
  .tab-btn {
    padding: 12px 14px;
    font-size: 13px;
  }
  .beats-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }
  .membership-header {
    flex-direction: column;
  }
  .membership-stats,
  .membership-benefits-list {
    grid-template-columns: 1fr;
  }
  .upload-manage-actions,
  .upload-edit-actions {
    flex-direction: column;
  }
  .upload-cover-panel {
    flex-direction: column;
  }
  .manage-btn,
  .upload-edit-actions .btn {
    width: 100%;
  }
  .avatar-settings {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* 意见反馈 */
.feedback-section {
  padding: 0 4px;
}

.feedback-form {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-select {
  width: 100%;
  padding: 10px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.form-select:focus { border-color: #7c3aed; }

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
}
.form-textarea:focus { border-color: #7c3aed; }

.char-count {
  text-align: right;
  font-size: 12px;
  color: #6b6b80;
  margin-top: 4px;
}

.success-message {
  color: #4ade80;
  font-size: 14px;
  padding: 8px 12px;
  background: rgba(74,222,128,0.1);
  border-radius: 6px;
}

.my-feedback-list { margin-top: 32px; }

.feedback-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.feedback-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 16px;
}

.feedback-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.feedback-type-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.feedback-type-badge.bug { background: rgba(239,68,68,0.15); color: #f87171; }
.feedback-type-badge.suggestion { background: rgba(234,179,8,0.15); color: #fbbf24; }
.feedback-type-badge.other { background: rgba(59,130,246,0.15); color: #60a5fa; }

.feedback-status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.feedback-status-badge.pending { background: rgba(234,179,8,0.15); color: #fbbf24; }
.feedback-status-badge.replied { background: rgba(74,222,128,0.15); color: #4ade80; }
.feedback-status-badge.closed { background: rgba(148,163,184,0.15); color: #94a3b8; }

.feedback-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e8;
  margin-bottom: 6px;
}

.feedback-card-content {
  font-size: 13px;
  color: #8888a8;
  line-height: 1.5;
  margin-bottom: 8px;
}

.feedback-reply {
  background: rgba(124,58,237,0.1);
  border-left: 3px solid #7c3aed;
  padding: 8px 12px;
  border-radius: 0 6px 6px 0;
  margin-bottom: 8px;
}
.feedback-reply-label {
  font-size: 12px;
  color: #a78bfa;
  margin-bottom: 4px;
}
.feedback-reply-content {
  font-size: 13px;
  color: #c4b5fd;
  line-height: 1.5;
}

.feedback-card-time {
  font-size: 12px;
  color: #6b6b80;
}

/* ─── 个人中心头部新增样式 ──────────────────────────────────────────────────── */

/* RAP BEATS 账号标识 */
.profile-account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 4px 0 6px;
}
.account-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
  color: #fff;
  border-radius: 4px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.account-id {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
}
.copy-btn {
  padding: 2px 10px;
  font-size: 11px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.copy-tip {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  animation: fadeOut 1.5s forwards;
}
.copy-tip-ok {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}
.copy-tip-err {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}
@keyframes fadeOut {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}

/* 4 个 stats 数字 */
.profile-stats {
  display: flex;
  align-items: stretch;
  gap: 14px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 20px;
  min-width: 80px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: default;
  transition: all 0.15s;
}
.stat-item:not(:disabled):hover {
  border-color: var(--accent);
  background: var(--bg-card);
}
.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .profile-stats { gap: 8px; }
  .stat-item { padding: 8px 12px; min-width: 60px; }
  .stat-num { font-size: 16px; }
}
</style>
