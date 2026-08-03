<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthPromptModal from '@/components/AuthPromptModal.vue'

const router = useRouter()
const showAuthPrompt = ref(false)

function requireAuth() {
  showAuthPrompt.value = true
}

function handleConfirm() {
  showAuthPrompt.value = false
  router.push('/login')
}

function handleCancel() {
  showAuthPrompt.value = false
}

defineExpose({ requireAuth })
</script>

<template>
  <AuthPromptModal
    v-if="showAuthPrompt"
    title="登录后即可解锁更多功能"
    message="登录或注册账号后，你可以发帖、评论、点赞和收藏感兴趣的内容，还能参与每日签到获取积分。"
    confirm-text="去登录"
    cancel-text="取消"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>
