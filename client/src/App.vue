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

const route = useRoute()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()
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

// 私信实时推送：登录即建立 SSE 连接，登出即断开（全局唯一连接，驱动 AppHeader 角标）
watch(
  () => authStore.isAuthenticated,
  (authed) => {
    if (authed && authStore.token) {
      messagesStore.connect(authStore.token)
    } else {
      messagesStore.disconnect()
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
