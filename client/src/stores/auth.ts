import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthResponse, VipLevel } from '@/types'
import { request } from '@/api/request'
import router from '@/router'

const TOKEN_KEY = 'rap-beats-token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)

  // 用于等待首次认证恢复完成，避免刷新需要登录态的页面时被错误地跳到 /login
  // 保存同一个 Promise，多个调用方 await 到的都是同一份结果
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isBeatmaker = computed(() => user.value?.is_beatmaker === 1)
  const canUpload = computed(() => isAdmin.value || isBeatmaker.value)
  const vipLevel = computed<VipLevel>(() => user.value?.vip_level || 'free')
  const isVip = computed(() => vipLevel.value !== 'free')
  const isPremiumOrAbove = computed(() => vipLevel.value === 'premium' || vipLevel.value === 'ultimate')
  const isUltimate = computed(() => vipLevel.value === 'ultimate')
  const canFullPreview = computed(() => isVip.value)

  function saveAuth(authData: AuthResponse) {
    token.value = authData.token
    user.value = authData.user
    localStorage.setItem(TOKEN_KEY, authData.token)
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function register(username: string, email: string, password: string) {
    const data = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    })
    saveAuth(data)
  }

  async function login(login: string, password: string) {
    const data = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    })
    saveAuth(data)
  }

  function logout() {
    clearAuth()
    router.push('/login')
  }

  async function checkAuth() {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) return false

    token.value = savedToken
    try {
      const data = await request<{ user: User }>('/api/auth/me')
      user.value = data.user
      return true
    } catch {
      clearAuth()
      return false
    }
  }

  async function init(): Promise<void> {
    // 多次调用复用同一个 Promise，避免并发触发 /api/auth/me
    if (initPromise) return initPromise
    initPromise = (async () => {
      const savedToken = localStorage.getItem(TOKEN_KEY)
      if (!savedToken) return
      token.value = savedToken
      try {
        const data = await request<{ user: User }>('/api/auth/me')
        user.value = data.user
      } catch {
        clearAuth()
      }
    })()
    return initPromise
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
    isBeatmaker,
    canUpload,
    isVip,
    vipLevel,
    isPremiumOrAbove,
    isUltimate,
    canFullPreview,
    register,
    login,
    logout,
    checkAuth,
    init
  }
})
