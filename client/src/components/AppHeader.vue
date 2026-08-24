<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNotificationsStore } from '@/stores/notifications'
import { resolveAvatarUrl } from '@/utils/assets'
import AuthPromptModal from './AuthPromptModal.vue'

const emit = defineEmits<{
  'open-membership': []
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()
const notificationsStore = useNotificationsStore()
const showAuthPrompt = ref(false)
const showThemePicker = ref(false)

// 未读私信数：由全局 SSE store 单点维护
const unreadMessageCount = computed(() => messagesStore.unreadCount)
// 未读通知数
const unreadNotificationCount = computed(() => notificationsStore.unreadCount)

const themes = [
  { id: 'dark', name: '深色', icon: '🌙' },
  { id: 'purple', name: '紫色', icon: '💜' },
  { id: 'ocean', name: '海洋', icon: '🌊' },
  { id: 'sunset', name: '日落', icon: '🌅' },
  { id: 'neon', name: '霓虹', icon: '⚡' },
]

const currentTheme = ref('dark')

onMounted(() => {
  const saved = localStorage.getItem('theme') || 'dark'
  currentTheme.value = saved
  document.documentElement.setAttribute('data-theme', saved)

  document.addEventListener('click', handleOutsideClick)

  // 登录状态下补偿拉取一次未读数（SSE 连接由 App.vue 维护）
  if (authStore.isAuthenticated) {
    messagesStore.refreshUnreadCount()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

function handleOutsideClick(e: Event) {
  const target = e.target as HTMLElement
  if (!target.closest('.theme-toggle') && !target.closest('.theme-picker')) {
    showThemePicker.value = false
  }
  if (!target.closest('.user-menu-wrap')) {
    showUserMenu.value = false
  }
}

function setTheme(themeId: string) {
  currentTheme.value = themeId
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('theme', themeId)
  showThemePicker.value = false
}

function handleBeatsClick(e: Event) {
  if (!authStore.isAuthenticated) {
    e.preventDefault()
    showAuthPrompt.value = true
  }
}

function handleAuthConfirm() {
  showAuthPrompt.value = false
  router.push('/login?requireAuth=1&redirect=/beats')
}

function handleAuthCancel() {
  showAuthPrompt.value = false
}

const vipBadgeConfig: Record<string, { text: string; color: string }> = {
  basic: { text: '基础VIP', color: '#cd7f32' },
  premium: { text: '高级VIP', color: '#c0c0c0' },
  ultimate: { text: '至尊VIP', color: '#f59e0b' },
}

const avatarLetter = computed(() => {
  return (authStore.user?.username || '?')[0].toUpperCase()
})

const avatarSrc = computed(() => {
  if (authStore.user?.avatar_url) return resolveAvatarUrl(authStore.user.avatar_url)
  return ''
})

const showUserMenu = ref(false)
function toggleUserMenu() { showUserMenu.value = !showUserMenu.value }
function closeUserMenu() { showUserMenu.value = false }
</script>

<template>
  <header class="app-header">
    <div class="header-inner container">
      <RouterLink to="/" class="logo">
        <span class="logo-icon">&#9835;</span>
        <span class="logo-text">RAP BEATS</span>
      </RouterLink>
      <nav class="nav-links">
        <RouterLink to="/" :class="{ active: route.path === '/' }">首页</RouterLink>
        <a v-if="!authStore.isAuthenticated" href="#" class="nav-link" @click.prevent="handleBeatsClick">伴奏库</a>
        <RouterLink v-else to="/beats" :class="{ active: route.path.startsWith('/beats') }">伴奏库</RouterLink>
        <RouterLink to="/forum" :class="{ active: route.path.startsWith('/forum') }">论坛</RouterLink>
        <RouterLink v-if="authStore.isAuthenticated && authStore.isAdmin" to="/upload" :class="{ active: route.path === '/upload' }">上传</RouterLink>
        <RouterLink v-if="authStore.isAdmin" to="/admin" :class="{ active: route.path.startsWith('/admin') }">管理后台</RouterLink>
      </nav>
      <div class="header-auth">
        <button class="theme-toggle" @click="showThemePicker = !showThemePicker" :title="'切换主题'">
          {{ themes.find(t => t.id === currentTheme)?.icon || '🎨' }}
        </button>
        <button class="membership-btn" @click="emit('open-membership')" title="会员权益">👑</button>
        <div v-if="showThemePicker" class="theme-picker">
          <button
            v-for="theme in themes"
            :key="theme.id"
            class="theme-option"
            :class="{ active: currentTheme === theme.id }"
            @click="setTheme(theme.id)"
            :title="theme.name"
          >
            <span class="theme-icon">{{ theme.icon }}</span>
            <span class="theme-name">{{ theme.name }}</span>
          </button>
        </div>
        <template v-if="authStore.isAuthenticated">
          <RouterLink to="/forum/messages" class="message-btn" :title="'私信'" aria-label="私信">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
            </svg>
            <span v-if="unreadMessageCount > 0" class="unread-dot" aria-label="未读消息">
              {{ unreadMessageCount > 99 ? '99+' : unreadMessageCount }}
            </span>
          </RouterLink>
          <RouterLink to="/forum/notifications" class="notification-btn" :title="'通知'" aria-label="通知">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <span v-if="unreadNotificationCount > 0" class="unread-dot notification-dot" aria-label="未读通知">
              {{ unreadNotificationCount > 99 ? '99+' : unreadNotificationCount }}
            </span>
          </RouterLink>
          <div class="user-menu-wrap">
            <button class="user-menu-trigger" @click.stop="toggleUserMenu" aria-label="用户菜单">
              <router-link to="/profile" class="header-avatar" aria-label="进入个人中心">
                <img v-if="avatarSrc" :src="avatarSrc" :alt="`${authStore.user?.username || '用户'}头像`" class="header-avatar-image" />
                <span v-else>{{ avatarLetter }}</span>
              </router-link>
              <span class="username">
                {{ authStore.user?.username }}
                <span v-if="authStore.isVip" class="vip-tag" :style="{ background: vipBadgeConfig[authStore.vipLevel]?.color || '#f59e0b' }">{{ vipBadgeConfig[authStore.vipLevel]?.text || 'VIP' }}</span>
              </span>
            </button>
            <transition name="dropdown">
              <div v-if="showUserMenu" class="user-dropdown" @click.stop>
                <router-link to="/profile" class="dropdown-item" @click="closeUserMenu">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                  个人主页
                </router-link>
                <router-link to="/forum/blocked" class="dropdown-item" @click="closeUserMenu">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                  黑名单
                </router-link>
                <router-link v-if="!authStore.isVip" to="/vip" class="dropdown-item dropdown-vip" @click="closeUserMenu">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                  开通VIP
                </router-link>
                <button class="dropdown-item dropdown-logout" @click="authStore.logout(); closeUserMenu()">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                  退出登录
                </button>
              </div>
            </transition>
          </div>
        </template>
        <template v-else>
          <RouterLink to="/login" class="btn btn-outline auth-btn-link">登录</RouterLink>
          <RouterLink to="/register" class="btn btn-primary auth-btn-link">注册</RouterLink>
        </template>
      </div>
    </div>
  </header>

  <AuthPromptModal
    v-if="showAuthPrompt"
    title="提示"
    message="伴奏库仅对注册用户开放，是否前往登录？"
    confirm-text="去登录"
    cancel-text="稍后再说"
    @confirm="handleAuthConfirm"
    @cancel="handleAuthCancel"
  />
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-primary);
}

.logo-icon {
  font-size: 24px;
  color: var(--accent);
}

.logo-text {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 2px;
}

.nav-links {
  display: flex;
  gap: 32px;
}

.nav-links a,
.nav-links .nav-link {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.2s ease;
  padding: 4px 0;
  position: relative;
  cursor: pointer;
  background: none;
  border: none;
}

.nav-links a:hover,
.nav-links a.active,
.nav-links .nav-link:hover {
  color: var(--text-primary);
}

.nav-links a.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.header-auth {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}

.header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  text-decoration: none;
  font-size: 14px;
  font-weight: 700;
}

.header-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.username {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  transition: color 0.2s;
}

.username:hover {
  color: var(--accent);
}

.logout-btn {
  padding: 6px 16px;
  font-size: 13px;
}

.vip-tag {
  display: inline-block;
  background: #f59e0b;
  color: #000;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  letter-spacing: 0.5px;
  vertical-align: middle;
}

.vip-link-nav {
  color: #f59e0b;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s;
}

.vip-link-nav:hover {
  opacity: 0.85;
}

.auth-btn-link {
  padding: 6px 16px;
  font-size: 13px;
  text-decoration: none;
}

.theme-toggle {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.theme-toggle:hover {
  border-color: var(--accent);
  background: var(--accent-light);
}

.membership-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.membership-btn:hover {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
}

.message-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: all 0.2s ease;
}
.message-btn:hover {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
  background: rgba(99, 102, 241, 0.1);
}

.notification-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary, #e8e8ed);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: all 0.2s ease;
}
.notification-btn:hover {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
  background: rgba(99, 102, 241, 0.1);
}

.notification-dot {
  background: #f59e0b;
}

.unread-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--bg-secondary);
}

.theme-picker {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1000;
  box-shadow: 0 8px 24px var(--shadow);
  min-width: 120px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.theme-option:hover {
  background: var(--accent-light);
}

.theme-option.active {
  background: var(--accent);
  color: #fff;
}

.theme-icon {
  font-size: 16px;
}

.theme-name {
  font-weight: 500;
}

/* ── User dropdown ────────────────────────────────────────────────────────── */
.user-menu-wrap {
  position: relative;
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
  transition: opacity 0.15s;
}

.user-menu-trigger:hover {
  opacity: 0.85;
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: var(--bg-secondary, #1a1a24);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.4);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary, #e8e8ed);
  text-decoration: none;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.dropdown-item:hover {
  background: rgba(255,255,255,0.06);
}

.dropdown-vip {
  color: #f59e0b;
}

.dropdown-logout {
  color: #ef4444;
}

.dropdown-logout:hover {
  background: rgba(239, 68, 68, 0.1);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 640px) {
  .header-inner {
    gap: 8px;
  }

  .nav-links {
    gap: 16px;
  }

  .logo-text {
    display: none;
  }

  .username {
    display: none;
  }

  .auth-btn-link,
  .logout-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>
