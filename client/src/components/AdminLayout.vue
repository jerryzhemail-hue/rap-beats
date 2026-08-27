<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const pageTitle = computed(() => {
  if (route.path === '/admin') return '数据看板'
  if (route.path === '/admin/hot-data') return '热门数据'
  if (route.path === '/admin/users') return '用户管理'
  if (route.path === '/admin/beats') return '内容管理'
  if (route.path === '/admin/rappers') return 'Rapper 管理'
  if (route.path === '/admin/banners') return 'Banner 管理'
  if (route.path === '/admin/forum') return '论坛管理'
  if (route.path === '/admin/feedback') return '意见反馈'
  if (route.path === '/admin/license') return '使用协议'
  if (route.path === '/admin/home-footer') return '首页尾部'
  return '管理后台'
})
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <span class="logo-main">RAP BEATS</span>
        <span class="logo-sub">管理后台</span>
      </div>
      <nav class="admin-nav">
        <router-link to="/admin" class="nav-item" :class="{ active: route.path === '/admin' }">
          <span class="nav-icon">📊</span>
          数据看板
        </router-link>
        <router-link to="/admin/hot-data" class="nav-item" :class="{ active: route.path === '/admin/hot-data' }">
          <span class="nav-icon">🔥</span>
          热门数据
        </router-link>
        <router-link to="/admin/users" class="nav-item" :class="{ active: route.path === '/admin/users' }">
          <span class="nav-icon">👥</span>
          用户管理
        </router-link>
        <router-link to="/admin/beats" class="nav-item" :class="{ active: route.path === '/admin/beats' }">
          <span class="nav-icon">🎵</span>
          内容管理
        </router-link>
        <router-link to="/admin/rappers" class="nav-item" :class="{ active: route.path === '/admin/rappers' }">
          <span class="nav-icon">🎤</span>
          Rapper 管理
        </router-link>
        <router-link to="/admin/banners" class="nav-item" :class="{ active: route.path === '/admin/banners' }">
          <span class="nav-icon">🖼️</span>
          Banner 管理
        </router-link>
        <router-link to="/admin/forum" class="nav-item" :class="{ active: route.path === '/admin/forum' }">
          <span class="nav-icon">💬</span>
          论坛管理
        </router-link>
        <router-link to="/admin/feedback" class="nav-item" :class="{ active: route.path === '/admin/feedback' }">
          <span class="nav-icon">📮</span>
          意见反馈
        </router-link>
        <router-link to="/admin/license" class="nav-item" :class="{ active: route.path === '/admin/license' }">
          <span class="nav-icon">📋</span>
          使用协议
        </router-link>
        <router-link to="/admin/home-footer" class="nav-item" :class="{ active: route.path === '/admin/home-footer' }">
          <span class="nav-icon">🧩</span>
          首页尾部
        </router-link>
      </nav>
      <div class="admin-footer">
        <router-link to="/" class="back-link">← 返回前台</router-link>
      </div>
    </aside>
    <main class="admin-main">
      <header class="admin-header">
        <h1>{{ pageTitle }}</h1>
        <span class="admin-user">{{ authStore.user?.username }}</span>
      </header>
      <div class="admin-content">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: #141425;
}

.admin-sidebar {
  width: 240px;
  min-height: 100vh;
  background: #0f0f1a;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1e1e3a;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 50;
}

.admin-logo {
  padding: 24px 20px;
  border-bottom: 1px solid #1e1e3a;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logo-main {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #fff;
}

.logo-sub {
  font-size: 12px;
  color: #7c3aed;
  font-weight: 500;
  letter-spacing: 1px;
}

.admin-nav {
  flex: 1;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: rgba(124, 58, 237, 0.1);
  color: #fff;
}

.nav-item.active {
  background: rgba(124, 58, 237, 0.15);
  color: #7c3aed;
}

.nav-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.admin-footer {
  padding: 16px 20px;
  border-top: 1px solid #1e1e3a;
}

.back-link {
  color: #a0a0b0;
  font-size: 13px;
  text-decoration: none;
  transition: color 0.2s;
}

.back-link:hover {
  color: #7c3aed;
}

.admin-main {
  flex: 1;
  margin-left: 240px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  background: #141425;
  border-bottom: 1px solid #1e1e3a;
  position: sticky;
  top: 0;
  z-index: 40;
}

.admin-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: #fff;
}

.admin-user {
  font-size: 14px;
  color: #a0a0b0;
  font-weight: 500;
}

.admin-content {
  flex: 1;
  padding: 32px;
}
</style>
