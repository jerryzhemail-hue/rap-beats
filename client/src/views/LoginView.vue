<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loginInput = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const isFromProtectedRoute = computed(() => route.query.requireAuth === '1')

async function onLogin() {
  error.value = ''

  if (!loginInput.value.trim()) {
    error.value = '请输入用户名或邮箱'
    return
  }
  if (!password.value) {
    error.value = '请输入密码'
    return
  }

  loading.value = true
  try {
    await authStore.login(loginInput.value.trim(), password.value)
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (err: any) {
    error.value = err.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-icon">&#9835;</span>
        <h1 class="auth-title">欢迎回来</h1>
        <p class="auth-subtitle">登录以发现和播放高品质说唱伴奏</p>
      </div>

      <div v-if="isFromProtectedRoute" class="require-auth-notice">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>伴奏库仅对注册用户开放，请先登录</span>
      </div>

      <form class="auth-form" @submit.prevent="onLogin">
        <div v-if="error" class="error-msg">{{ error }}</div>

        <div class="form-group">
          <label class="form-label" for="login">用户名 / 邮箱</label>
          <input
            id="login"
            v-model="loginInput"
            type="text"
            class="form-input"
            placeholder="输入用户名或邮箱"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="输入密码"
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn btn-primary auth-btn" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>登录</span>
        </button>
      </form>

      <div class="auth-footer">
        <span>没有账号？</span>
        <router-link to="/register" class="auth-link">去注册</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 40px 36px;
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-icon {
  font-size: 36px;
  color: var(--accent);
  display: block;
  margin-bottom: 12px;
}

.auth-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
}

.auth-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.require-auth-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 20px;
  border: 1px solid rgba(245, 158, 11, 0.25);
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
  transition: border-color 0.2s ease;
}

.form-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
}

.form-input:focus {
  border-color: var(--accent);
}

.auth-btn {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  margin-top: 4px;
}

.auth-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.auth-link {
  color: var(--accent);
  font-weight: 500;
  margin-left: 4px;
  transition: color 0.2s ease;
}

.auth-link:hover {
  color: var(--accent-hover);
}

@media (max-width: 480px) {
  .auth-card {
    padding: 32px 24px;
  }
}
</style>
