<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

function validate(): boolean {
  if (!username.value.trim()) {
    error.value = '请输入用户名'
    return false
  }
  if (username.value.trim().length < 3 || username.value.trim().length > 20) {
    error.value = '用户名需要3-20个字符'
    return false
  }
  if (!email.value.trim()) {
    error.value = '请输入邮箱'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    error.value = '请输入有效的邮箱地址'
    return false
  }
  if (!password.value) {
    error.value = '请输入密码'
    return false
  }
  if (password.value.length < 6) {
    error.value = '密码至少需要6个字符'
    return false
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return false
  }
  return true
}

async function onRegister() {
  error.value = ''

  if (!validate()) return

  loading.value = true
  try {
    await authStore.register(username.value.trim(), email.value.trim(), password.value)
    router.push('/')
  } catch (err: any) {
    error.value = err.message || '注册失败，请稍后再试'
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
        <h1 class="auth-title">创建账号</h1>
        <p class="auth-subtitle">注册即可畅听海量高品质说唱伴奏</p>
      </div>

      <form class="auth-form" @submit.prevent="onRegister">
        <div v-if="error" class="error-msg">{{ error }}</div>

        <div class="form-group">
          <label class="form-label" for="username">用户名</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="form-input"
            placeholder="3-20个字符"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="email">邮箱</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="form-input"
            placeholder="your@email.com"
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="至少6个字符"
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="confirm-password">确认密码</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            class="form-input"
            placeholder="再次输入密码"
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="btn btn-primary auth-btn" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>注册</span>
        </button>
      </form>

      <div class="auth-footer">
        <span>已有账号？</span>
        <router-link to="/login" class="auth-link">去登录</router-link>
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
