<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBeatmakerStore } from '@/stores/beatmaker'
import { useAuthStore } from '@/stores/auth'
import BeatmakerBadge from '@/components/BeatmakerBadge.vue'

const store = useBeatmakerStore()
const authStore = useAuthStore()
const router = useRouter()
const loading = ref(false)
const showAuthPrompt = ref(false)

onMounted(async () => {
  loading.value = true
  try { await store.loadList(true) } finally { loading.value = false }
})

const beatmakers = computed(() => store.list)
const isAuthenticated = computed(() => authStore.isAuthenticated)

/** 点击卡片：未登录弹出引导，已登录跳转详情 */
function handleCardClick(userId: string) {
  if (!isAuthenticated.value) {
    showAuthPrompt.value = true
    return
  }
  router.push(`/beatmaker/profile/${userId}`)
}

/** 点击申请认证 */
function handleApply() {
  if (!isAuthenticated.value) {
    showAuthPrompt.value = true
    return
  }
  router.push('/beatmaker/apply')
}

/** 引导弹窗确认 */
function handleAuthConfirm() {
  showAuthPrompt.value = false
  router.push({
    path: '/login',
    query: { redirect: '/beatmakers', requireAuth: '1' }
  })
}

/** 引导弹窗取消 */
function handleAuthCancel() {
  showAuthPrompt.value = false
}

/** 关闭引导弹窗（点击X） */
function handleAuthClose() {
  showAuthPrompt.value = false
}
</script>

<template>
  <div class="list-page">
    <header class="page-header">
      <div class="header-content">
        <div>
          <h1>认证 Beatmaker</h1>
          <p class="subtitle">已通过原创制作人认证的 Beatmaker，可在平台上架原创伴奏</p>
        </div>
        <button class="btn-apply" @click="handleApply">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <span>{{ isAuthenticated ? '申请认证' : '成为 Beatmaker' }}</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="beatmakers.length === 0" class="state empty">
      <p>暂无认证 Beatmaker</p>
      <button class="btn primary" @click="handleApply">成为第一个</button>
    </div>
    <div v-else class="page-body">
      <!-- 未登录引导横幅 -->
      <div v-if="!isAuthenticated" class="auth-banner">
        <div class="banner-glow"></div>
        <div class="banner-content">
          <div class="banner-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div class="banner-text">
            <h3>登录后查看认证 Beatmaker 完整资料</h3>
            <p>解锁详细主页、联系方式、作品集，与原创制作人直接沟通合作</p>
          </div>
          <div class="banner-actions">
            <button class="banner-btn primary" @click="handleAuthConfirm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              立即登录
            </button>
            <button class="banner-btn secondary" @click="handleAuthCancel">继续浏览</button>
          </div>
        </div>
      </div>

      <div class="bm-grid" :class="{ 'blur-overlay': !isAuthenticated }">
        <article
          v-for="bm in beatmakers"
          :key="bm.user_id"
          class="bm-card"
          @click="handleCardClick(bm.user_id)"
        >
          <div class="bm-avatar">
            <img v-if="bm.avatar_url" :src="bm.avatar_url" :alt="bm.display_name" />
            <div v-else class="avatar-placeholder">{{ bm.display_name.charAt(0) }}</div>
            <BeatmakerBadge size="sm" variant="solid" :show-label="false" />
          </div>
          <div class="bm-info">
            <h3 class="bm-name">
              {{ bm.display_name }}
              <span class="username">@{{ bm.username }}</span>
            </h3>
            <BeatmakerBadge size="sm" variant="subtle" />
            <p v-if="bm.bio" class="bm-bio">{{ bm.bio }}</p>
            <a
              v-if="bm.portfolio_url && isAuthenticated"
              :href="bm.portfolio_url"
              target="_blank"
              rel="noopener"
              class="portfolio-link"
              @click.stop
            >
              作品集 ↗
            </a>
            <div v-else-if="bm.portfolio_url && !isAuthenticated" class="portfolio-link locked">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              登录查看作品集
            </div>
          </div>
          <div class="bm-stats">
            <div class="stat">
              <span class="stat-value">{{ bm.total_beats }}</span>
              <span class="stat-label">作品</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ bm.total_likes }}</span>
              <span class="stat-label">点赞</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ bm.total_downloads }}</span>
              <span class="stat-label">下载</span>
            </div>
          </div>
          <!-- 未登录锁定遮罩 -->
          <div v-if="!isAuthenticated" class="card-lock">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>登录查看详情</span>
          </div>
        </article>
      </div>
    </div>

    <!-- 登录引导弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAuthPrompt" class="modal-overlay" @click.self="handleAuthCancel">
          <div class="modal-container" role="dialog" aria-modal="true">
            <button class="modal-close" @click="handleAuthClose" aria-label="关闭">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>

            <div class="modal-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>

            <h3 class="modal-title">登录解锁 Beatmaker 完整内容</h3>
            <p class="modal-message">
              认证 Beatmaker 是平台核心创作者，登录后你可以：
            </p>
            <ul class="modal-perks">
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                查看 Beatmaker 详细主页与完整简介
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                访问外部作品集链接，深入了解作品风格
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                下载原创伴奏，与制作人直接沟通合作
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                申请成为认证 Beatmaker，上架自己的作品
              </li>
            </ul>

            <div class="modal-actions">
              <button class="modal-btn modal-btn-secondary" @click="handleAuthCancel">
                稍后再说
              </button>
              <button class="modal-btn modal-btn-primary" @click="handleAuthConfirm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                去登录
              </button>
            </div>

            <p class="modal-footer">
              还没有账号？
              <button class="link-btn" @click="() => { showAuthPrompt = false; router.push('/register') }">立即注册</button>
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.list-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}

.page-header {
  margin-bottom: 24px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  color: var(--text-secondary, #6b7280);
  font-size: 15px;
}

.btn-apply {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  flex-shrink: 0;
}

.btn-apply:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(245, 158, 11, 0.4);
}

.state {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary, #6b7280);
}

.state.empty button { margin-top: 16px; }

.page-body {
  position: relative;
}

/* 登录引导横幅 */
.auth-banner {
  position: relative;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(124, 58, 237, 0.12));
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 20px;
  overflow: hidden;
}

.banner-glow {
  position: absolute;
  top: -50%;
  right: -20%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%);
  pointer-events: none;
}

.banner-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.banner-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
}

.banner-text {
  flex: 1;
  min-width: 200px;
}

.banner-text h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.banner-text p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.banner-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.banner-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.banner-btn.primary {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  box-shadow: 0 3px 10px rgba(245, 158, 11, 0.35);
}

.banner-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(245, 158, 11, 0.45);
}

.banner-btn.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary, #111827);
}

.banner-btn.secondary:hover {
  background: rgba(0, 0, 0, 0.08);
}

/* Beatmaker 卡片网格 */
.bm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  transition: filter 0.3s ease;
}

.bm-grid.blur-overlay {
  filter: blur(1px) saturate(0.9);
  pointer-events: none;
}

/* 但卡片本身可以被点击触发弹窗 */
.blur-overlay .bm-card {
  pointer-events: auto;
}

.bm-card {
  position: relative;
  background: var(--card-bg, #fff);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  overflow: hidden;
}

.bm-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.bm-avatar {
  position: relative;
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
}

.bm-avatar img,
.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
}

.bm-card :deep(.beatmaker-badge) {
  position: absolute;
  bottom: -4px;
  right: -4px;
}

.bm-name {
  margin: 0 0 4px;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.username {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary, #9ca3af);
}

.bm-bio {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.portfolio-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #d97706;
  text-decoration: none;
}

.portfolio-link.locked {
  color: var(--text-secondary, #9ca3af);
  opacity: 0.8;
}

.portfolio-link:hover { text-decoration: underline; }

.bm-stats {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.stat { display: flex; flex-direction: column; align-items: center; }
.stat-value { font-weight: 700; font-size: 16px; }
.stat-label { font-size: 12px; color: var(--text-secondary, #9ca3af); }

/* 未登录锁定标签 */
.card-lock {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(17, 24, 39, 0.85);
  color: #fff;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  backdrop-filter: blur(4px);
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.modal-container {
  background: var(--bg-card, #252540);
  border-radius: 20px;
  padding: 36px 32px 28px;
  max-width: 440px;
  width: 100%;
  text-align: center;
  position: relative;
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.6);
}

.modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #fff);
}

.modal-icon {
  width: 84px;
  height: 84px;
  margin: 0 auto 20px;
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(124, 58, 237, 0.15));
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #fff);
  margin: 0 0 10px;
}

.modal-message {
  font-size: 15px;
  color: var(--text-secondary, #b0b0b0);
  line-height: 1.6;
  margin: 0 0 20px;
}

.modal-perks {
  list-style: none;
  padding: 0;
  margin: 0 0 28px;
  text-align: left;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
}

.modal-perks li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 0;
  font-size: 14px;
  color: var(--text-secondary, #d1d5db);
}

.modal-perks li svg {
  color: #22c55e;
  flex-shrink: 0;
  margin-top: 2px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 28px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 110px;
  justify-content: center;
}

.modal-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary, #b0b0b0);
}

.modal-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-primary, #fff);
}

.modal-btn-primary {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
}

.modal-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(245, 158, 11, 0.45);
}

.modal-btn-primary:active {
  transform: translateY(0);
}

.modal-footer {
  margin: 20px 0 0;
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
}

.link-btn {
  background: none;
  border: none;
  color: #f59e0b;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
}

.link-btn:hover {
  text-decoration: underline;
}

/* 弹窗过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  opacity: 0;
  transform: translateY(16px) scale(0.96);
}

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.btn.primary {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
}
</style>
