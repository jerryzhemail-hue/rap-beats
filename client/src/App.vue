<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AudioPlayer from '@/components/AudioPlayer.vue'
import FeedbackFloatButton from '@/components/FeedbackFloatButton.vue'
import MembershipBanner from '@/components/MembershipBanner.vue'
import { usePlayerStore } from '@/stores/player'

const route = useRoute()
const playerStore = usePlayerStore()
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

// 首次访问自动弹出，10 秒后自动关闭
onMounted(() => {
  showMembershipBanner.value = true
  setTimeout(() => {
    showMembershipBanner.value = false
  }, 10000)
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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding-bottom: 96px;
}
</style>
