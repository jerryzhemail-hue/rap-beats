<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { addFavorite, removeFavorite } from '@/api/favorites'
import { getDownloadUrl } from '@/api/beats'
import type { Beat } from '@/types'
import { resolveCoverUrl } from '@/utils/assets'
import BeatLicenseAgreement from './BeatLicenseAgreement.vue'

const props = defineProps<{
  beat: Beat
  rank?: number
}>()

const router = useRouter()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const showLicense = ref(false)
const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#252540" width="200" height="200"/><text fill="#7c3aed" font-size="60" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')

function getCoverUrl(coverImage: string | null): string {
  return resolveCoverUrl(coverImage, defaultCover)
}

function onPlayClick(e: Event) {
  e.stopPropagation()
  // VIP 专属内容必须 premium/ultimate；其他身份一律拦截、不调用 play()
  if (props.beat.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }
  playerStore.play(props.beat)
}

function onCardClick() {
  router.push(`/beats/${props.beat.id}`)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function toggleFavorite(e: Event) {
  e.stopPropagation()
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  try {
    if (props.beat.is_favorited) {
      await removeFavorite(props.beat.id)
      props.beat.is_favorited = false
    } else {
      await addFavorite(props.beat.id)
      props.beat.is_favorited = true
    }
  } catch {
    // ignore errors
  }
}

function handleDownload(e: Event) {
  e.stopPropagation()
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  // VIP 专属内容检查
  if (props.beat.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }

  // 弹出协议确认弹窗
  showLicense.value = true
}

function handleLicenseAgreed() {
  showLicense.value = false
  window.open(getDownloadUrl(props.beat.id), '_blank')
}

function handleLicenseCancelled() {
  showLicense.value = false
}
</script>

<template>
  <div class="beat-card" @click="onCardClick">
    <div class="card-cover">
      <img
        :src="getCoverUrl(beat.cover_image)"
        :alt="beat.title"
        class="cover-img"
        loading="lazy"
      />
      <div class="cover-overlay">
        <button class="play-btn" @click="onPlayClick">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>
      <div class="badges-row">
        <span v-if="rank" class="rank-badge">TOP {{ rank }}</span>
        <span v-if="beat.is_free" class="free-badge">FREE</span>
        <span v-if="beat.is_vip_only" class="vip-badge">VIP</span>
        <span class="bpm-badge">{{ beat.bpm }} BPM</span>
      </div>
      <button class="favorite-btn" :class="{ active: beat.is_favorited }" @click.stop="toggleFavorite">
        <span v-if="beat.is_favorited">❤️</span>
        <span v-else>🤍</span>
      </button>
      <button class="download-btn" @click.stop="handleDownload" title="下载">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
    <div class="card-info">
      <h3 class="card-title">{{ beat.title }}</h3>
      <div class="card-producer-row">
        <router-link
          v-if="beat.uploaded_by"
          :to="`/beatmaker/profile/${beat.uploaded_by}`"
          class="card-producer"
        >{{ beat.producer }}</router-link>
        <span v-else class="card-producer">{{ beat.producer }}</span>
        <span
          v-if="beat.creator_role === 'beatmaker' || beat.creator_is_beatmaker"
          class="beatmaker-badge"
          title="认证 Beatmaker 原创制作人"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Beatmaker
        </span>
      </div>
      <div class="card-meta">
        <span class="genre-tag">{{ beat.genre }}</span>
        <span class="key-tag">{{ beat.key }}</span>
        <span v-if="beat.recent_downloads !== undefined" class="trend-tag">近7天 {{ beat.recent_downloads }} 下载</span>
        <span class="duration">{{ formatDuration(beat.duration) }}</span>
      </div>
    </div>
  </div>
  <BeatLicenseAgreement
    v-if="showLicense"
    :beat-id="beat.id"
    :beat-title="beat.title"
    @agreed="handleLicenseAgreed"
    @cancelled="handleLicenseCancelled"
  />
</template>

<style scoped>
.beat-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.beat-card:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.card-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: linear-gradient(135deg, #252540 0%, #1e1e2e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.beat-card:hover .cover-overlay {
  opacity: 1;
}

.play-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.2s ease;
  padding: 0;
}

.play-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.1);
}

.badges-row {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 56px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 2;
}

.bpm-badge {
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.rank-badge {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 4px 9px;
  border-radius: 999px;
  letter-spacing: 0.8px;
}

.free-badge {
  background: #16a34a;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.vip-badge {
  background: #f59e0b;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.favorite-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  padding: 4px;
  line-height: 1;
  transition: transform 0.2s ease;
  z-index: 2;
}

.favorite-btn:hover {
  transform: scale(1.2);
}

.favorite-btn.active {
  filter: none;
}

.download-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.2s ease;
  z-index: 2;
}

.download-btn:hover {
  background: var(--accent);
  transform: scale(1.1);
}

.card-info {
  padding: 14px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-producer-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  width: 100%;
  min-width: 0;
}

.card-producer {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
  transition: color 0.15s ease;
  max-width: 160px;
}

.card-producer.router-link-active {
  color: inherit;
}

.card-producer:hover {
  color: var(--accent);
}

.beatmaker-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  letter-spacing: 0.3px;
  line-height: 1.4;
  cursor: default;
  user-select: none;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.genre-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-light);
  color: var(--accent);
}

.key-tag {
  font-size: 11px;
  color: var(--text-secondary);
}

.trend-tag {
  font-size: 11px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.duration {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: auto;
}
</style>
