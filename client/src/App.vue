<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AudioPlayer from '@/components/AudioPlayer.vue'
import FeedbackFloatButton from '@/components/FeedbackFloatButton.vue'
import MembershipBanner from '@/components/MembershipBanner.vue'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNotificationsStore } from '@/stores/notifications'
import { useHomepageConfigStore } from '@/stores/homepage-config'

const route = useRoute()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()
const notificationsStore = useNotificationsStore()
const homepageConfigStore = useHomepageConfigStore()
const showMembershipBanner = ref(false)

// 暴露给 AppHeader 调用
defineExpose({ showMembershipBanner })

const playerExcludedNames = ['Login', 'Register', 'Upload', 'Profile', 'AdminDashboard', 'AdminHotData', 'AdminUsers', 'AdminBeats', 'AdminBanners', 'AdminForum', 'AdminFeedback']

watch(
  () => route.name,
  (name) => {
    if (!name) return
    if (playerExcludedNames.includes(String(name))) {
      playerStore.close()
    }
  }
)

// 私信和通知实时推送：登录即建立 SSE 连接，登出即断开
watch(
  () => authStore.isAuthenticated,
  (authed) => {
    if (authed && authStore.token) {
      messagesStore.connect(authStore.token)
      notificationsStore.refreshUnreadCount()
      // 登录后拉取首页头部模块可见性配置（按角色过滤）
      homepageConfigStore.reset()
      homepageConfigStore.load()
    } else {
      messagesStore.disconnect()
      // 登出后重置为游客配置
      homepageConfigStore.reset()
      homepageConfigStore.load()
    }
  },
  { immediate: true }
)

// 首次访问自动弹出，10 秒后自动关闭
onMounted(() => {
  showMembershipBanner.value = true
  setTimeout(() => {
    showMembershipBanner.value = false
  }, 10000)
})

onUnmounted(() => {
  messagesStore.disconnect()
})
</script>

<template>
  <div class="app-layout">
    <AppHeader @open-membership="showMembershipBanner = true" />
    <main class="main-content">
      <router-view />
    </main>
    <AudioPlayer />
    <FeedbackFloatButton />
    <MembershipBanner v-if="showMembershipBanner" @close="showMembershipBanner = false" />
  </div>
</template>

<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
</style>
