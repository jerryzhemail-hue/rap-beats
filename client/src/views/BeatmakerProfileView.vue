<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBeatmakerProfile, type BeatmakerProfile } from '@/api/beatmaker'
import BeatmakerBadge from '@/components/BeatmakerBadge.vue'

const route = useRoute()
const router = useRouter()
const profile = ref<BeatmakerProfile | null>(null)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  const userId = Number(route.params.userId)
  if (!userId) {
    router.push('/beatmakers')
    return
  }
  loading.value = true
  try {
    const data = await fetchBeatmakerProfile(userId)
    profile.value = data.profile
  } catch (err: any) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="profile-page">
    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="profile" class="profile-card">
      <header class="profile-header">
        <div class="avatar-wrap">
          <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.display_name" />
          <div v-else class="avatar-placeholder">{{ profile.display_name.charAt(0) }}</div>
        </div>
        <div class="header-info">
          <h1>{{ profile.display_name }}</h1>
          <p class="username">@{{ profile.username }}</p>
          <BeatmakerBadge size="md" variant="subtle" />
          <p v-if="profile.certified_at" class="certified">
            认证于 {{ new Date(profile.certified_at).toLocaleDateString('zh-CN') }}
          </p>
        </div>
      </header>

      <section v-if="profile.bio" class="bio-section">
        <h3>个人简介</h3>
        <p>{{ profile.bio }}</p>
      </section>

      <section v-if="profile.portfolio_url" class="links-section">
        <h3>作品链接</h3>
        <p v-if="profile.portfolio_url">
          <strong>作品集：</strong>
          <a :href="profile.portfolio_url" target="_blank" rel="noopener">{{ profile.portfolio_url }}</a>
        </p>
        <p v-if="profile.sample_audio_url">
          <strong>代表作：</strong>
          <a :href="profile.sample_audio_url" target="_blank" rel="noopener">{{ profile.sample_audio_url }}</a>
        </p>
      </section>

      <section class="stats-section">
        <div class="stat-card">
          <span class="stat-value">{{ profile.total_beats }}</span>
          <span class="stat-label">作品</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ profile.total_likes }}</span>
          <span class="stat-label">累计点赞</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ profile.total_downloads }}</span>
          <span class="stat-label">累计下载</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 16px;
}

.state {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary, #6b7280);
}

.state.error { color: #b91c1c; }

.profile-card {
  background: var(--card-bg, #fff);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.profile-header {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.avatar-wrap {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
}

.avatar-wrap img,
.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  font-weight: 700;
}

.header-info h1 {
  margin: 0 0 4px;
  font-size: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.username {
  margin: 0 0 8px;
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
}

.certified {
  margin: 8px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

section {
  margin-top: 24px;
}

section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-secondary, #9ca3af);
  letter-spacing: 0.5px;
}

section p { margin: 0 0 8px; line-height: 1.6; }

section a { color: #d97706; text-decoration: none; }
section a:hover { text-decoration: underline; }

.stats-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 24px;
}

.stat-card {
  background: rgba(245, 158, 11, 0.06);
  padding: 16px;
  border-radius: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #b45309;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin-top: 4px;
}
</style>