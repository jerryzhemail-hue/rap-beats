<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBeatmakerStore } from '@/stores/beatmaker'
import BeatmakerBadge from '@/components/BeatmakerBadge.vue'

const store = useBeatmakerStore()
const router = useRouter()
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try { await store.loadList(true) } finally { loading.value = false }
})

const beatmakers = computed(() => store.list)
</script>

<template>
  <div class="list-page">
    <header class="page-header">
      <h1>认证 Beatmaker</h1>
      <p class="subtitle">已通过原创制作人认证的 Beatmaker，可在平台上架原创伴奏</p>
    </header>

    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="beatmakers.length === 0" class="state empty">
      <p>暂无认证 Beatmaker</p>
      <button class="btn primary" @click="router.push('/beatmaker/apply')">成为第一个</button>
    </div>
    <div v-else class="bm-grid">
      <article
        v-for="bm in beatmakers"
        :key="bm.user_id"
        class="bm-card"
        @click="router.push(`/beatmaker/profile/${bm.user_id}`)"
      >
        <div class="bm-avatar">
          <img v-if="bm.avatar_url" :src="bm.avatar_url" :alt="bm.display_name" />
          <div v-else class="avatar-placeholder">{{ bm.display_name.charAt(0) }}</div>
          <BeatmakerBadge size="sm" variant="solid" :show-label="false" />
        </div>
        <div class="bm-info">
          <h3 class="bm-name">
            {{ bm.display_name }}
            <span class="username">@{{ bm.username }}</span>
          </h3>
          <BeatmakerBadge size="sm" variant="subtle" />
          <p v-if="bm.bio" class="bm-bio">{{ bm.bio }}</p>
          <a v-if="bm.portfolio_url" :href="bm.portfolio_url" target="_blank" rel="noopener" class="portfolio-link" @click.stop>
            作品集 ↗
          </a>
        </div>
        <div class="bm-stats">
          <div class="stat">
            <span class="stat-value">{{ bm.total_beats }}</span>
            <span class="stat-label">作品</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ bm.total_likes }}</span>
            <span class="stat-label">点赞</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ bm.total_downloads }}</span>
            <span class="stat-label">下载</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.list-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
}

.subtitle {
  margin: 0 0 24px;
  color: var(--text-secondary, #6b7280);
}

.state {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary, #6b7280);
}

.state.empty button { margin-top: 16px; }

.bm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.bm-card {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.bm-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.bm-avatar {
  position: relative;
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
}

.bm-avatar img,
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
  font-size: 28px;
  font-weight: 700;
}

.bm-card :deep(.beatmaker-badge) {
  position: absolute;
  bottom: -4px;
  right: -4px;
}

.bm-name {
  margin: 0 0 4px;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.username {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary, #9ca3af);
}

.bm-bio {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.portfolio-link {
  font-size: 13px;
  color: #d97706;
  text-decoration: none;
}

.portfolio-link:hover { text-decoration: underline; }

.bm-stats {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.stat { display: flex; flex-direction: column; align-items: center; }
.stat-value { font-weight: 700; font-size: 16px; }
.stat-label { font-size: 12px; color: var(--text-secondary, #9ca3af); }

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.btn.primary {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
}
</style>