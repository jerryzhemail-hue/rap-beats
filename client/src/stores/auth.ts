import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthResponse, VipLevel } from '@/types'
import { request } from '@/api/request'
import router from '@/router'

const TOKEN_KEY = 'rap-beats-token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
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

  async function init() {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) return

    token.value = savedToken
    try {
      const data = await request<{ user: User }>('/api/auth/me')
      user.value = data.user
    } catch {
      clearAuth()
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
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
