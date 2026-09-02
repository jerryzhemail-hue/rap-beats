<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBeat, getDownloadUrl } from '@/api/beats'
import { addFavorite, removeFavorite } from '@/api/favorites'
import { fetchVipStatus } from '@/api/user'
import { fetchDownloadPermission } from '@/api/forum'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import CommentSection from '@/components/CommentSection.vue'
import BeatLicenseAgreement from '@/components/BeatLicenseAgreement.vue'
import type { Beat, VipStatus } from '@/types'
import { resolveCoverUrl } from '@/utils/assets'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const beat = ref<Beat | null>(null)
const loading = ref(true)
const error = ref(false)
const vipStatus = ref<VipStatus | null>(null)
const vipOnlyBlocked = ref(false)
const downloadPermission = ref({ remaining_permissions: 0, exchange_cost: 10 })
const exchangingDownload = ref(false)
const showLicense = ref(false)

const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#252540" width="400" height="400"/><text fill="#7c3aed" font-size="120" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')

function getCoverUrl(coverImage: string | null): string {
  return resolveCoverUrl(coverImage, defaultCover)
}

onMounted(async () => {
  const id = Number(route.params.id)
  if (isNaN(id)) {
    error.value = true
    loading.value = false
    return
  }
  try {
    const fetched = await fetchBeat(id)
    // 双保险：后端 tags 列有时是 JSON 字符串，确保前端始终拿到 string[]
    if (fetched && typeof fetched.tags === 'string') {
      try {
        const parsed = JSON.parse(fetched.tags)
        fetched.tags = Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []
      } catch {
        fetched.tags = []
      }
    } else if (fetched && !Array.isArray(fetched.tags)) {
      fetched.tags = []
    }
    beat.value = fetched
  } catch (err: any) {
    if (err?.message?.includes('VIP') || err?.message?.includes('专属')) {
      vipOnlyBlocked.value = true
    }
    error.value = true
  } finally {
    loading.value = false
  }
  // 获取VIP状态
  if (authStore.isAuthenticated) {
    try {
      vipStatus.value = await fetchVipStatus()
    } catch {
      // ignore
    }
    // 获取下载权限状态
    try {
      const perm = await fetchDownloadPermission()
      downloadPermission.value = perm
    } catch {
      // ignore
    }
  }
})

function onPlay() {
  if (!beat.value) return
  // VIP 专属内容必须 premium/ultimate；其他身份一律拦截、不调用 play()
  if (beat.value.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }
  playerStore.play(beat.value)
}

async function onDownload() {
  if (!authStore.isAuthenticated) {
    if (confirm('下载伴奏需要登录账号。是否前往登录？')) {
      router.push('/login')
    }
    return
  }

  // VIP 专属内容检查
  if (beat.value!.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }

  // 如果是VIP或非VIP有积分权限，统一弹出协议确认
  if (authStore.isVip || downloadPermission.value.remaining_permissions > 0) {
    showLicense.value = true
    return
  }

  // 没有权限：跳转到积分中心
  router.push('/points?tab=benefits')
}

function handleLicenseAgreed() {
  showLicense.value = false
  window.location.href = getDownloadUrl(beat.value!.id)
}

function handleLicenseCancelled() {
  showLicense.value = false
}

async function handleExchangeDownload() {
  // 跳转到积分中心兑换
  router.push('/points?tab=benefits')
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function toggleFavorite() {
  if (!beat.value) return
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  try {
    if (beat.value.is_favorited) {
      await removeFavorite(beat.value.id)
      beat.value.is_favorited = false
    } else {
      await addFavorite(beat.value.id)
      beat.value.is_favorited = true
    }
  } catch {
    // ignore errors
  }
}
</script>

<template>
  <div class="detail-view">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="skeleton skeleton-cover-large"></div>
      <div class="skeleton-info">
        <div class="skeleton skeleton-text" style="width: 60%; height: 28px"></div>
        <div class="skeleton skeleton-text" style="width: 40%; height: 18px"></div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <template v-if="vipOnlyBlocked">
        <div class="vip-blocked">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <p style="color: #f59e0b; font-size: 18px; font-weight: 600; margin-top: 16px;">此伴奏为高级专属内容</p>
          <p style="color: #a0a0b0; margin-top: 8px;">请升级至高级或至尊会员</p>
          <button class="btn btn-vip" style="margin-top: 20px;" @click="router.push('/vip')">升级会员</button>
        </div>
      </template>
      <template v-else>
        <p>未找到该伴奏</p>
        <button class="btn btn-outline" @click="router.push('/beats')">返回伴奏库</button>
      </template>
    </div>

    <!-- Content -->
    <div v-else-if="beat" class="detail-content">
      <div class="detail-top">
        <div class="detail-cover">
          <img
            :src="getCoverUrl(beat.cover_image)"
            :alt="beat.title"
            class="cover-img"
          />
        </div>
        <div class="detail-info">
          <!-- 创作者身份条：头像 + 名字 + Beatmaker 徽章，点击跳创作者主页 -->
          <router-link
            v-if="beat.uploaded_by"
            :to="`/beatmaker/profile/${beat.uploaded_by}`"
            class="creator-row"
          >
            <img
              v-if="beat.creator_avatar"
              :src="beat.creator_avatar"
              class="creator-avatar"
            />
            <div v-else class="creator-avatar creator-avatar-fallback">
              {{ (beat.creator_display_name || beat.producer || '?').charAt(0).toUpperCase() }}
            </div>
            <span class="creator-name">
              {{ beat.creator_display_name || beat.producer }}
            </span>
            <span
              v-if="beat.creator_is_beatmaker"
              class="creator-badge"
            >Beatmaker</span>
            <span
              v-else-if="beat.creator_role === 'admin'"
              class="creator-badge creator-badge-admin"
            >Admin</span>
          </router-link>

          <h1 class="detail-title">{{ beat.title }}</h1>
          <p class="detail-producer">{{ beat.producer }}</p>

          <div class="detail-meta">
            <div class="meta-item">
              <span class="meta-label">BPM</span>
              <span class="meta-value">{{ beat.bpm }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">调性</span>
              <span class="meta-value">{{ beat.key }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">风格</span>
              <span class="meta-value">{{ beat.genre }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">时长</span>
              <span class="meta-value">{{ formatDuration(beat.duration) }}</span>
            </div>
          </div>

          <div class="detail-tags">
            <span v-for="tag in beat.tags" :key="tag" class="tag">{{ tag }}</span>
            <span v-if="beat.is_vip_only" class="tag tag-vip">VIP专属</span>
          </div>

          <div class="detail-actions">
            <button class="btn btn-primary play-action" @click="onPlay">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              播放
            </button>
            <template v-if="authStore.isVip">
              <button class="btn btn-outline download-action" @click="onDownload">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下载
                <span v-if="vipStatus && vipStatus.vip_level === 'basic'" class="download-count-inline">({{ vipStatus.remaining_downloads }}/10)</span>
                <span v-else-if="vipStatus && vipStatus.vip_level === 'premium'" class="download-count-inline">({{ vipStatus.remaining_downloads }}/30)</span>
              </button>
            </template>
            <template v-else-if="downloadPermission.remaining_permissions > 0">
              <button class="btn btn-outline download-action has-permission" @click="onDownload">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下载 (积分权限)
              </button>
            </template>
            <template v-else>
              <button class="btn btn-points download-action" @click="handleExchangeDownload" :disabled="exchangingDownload">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                {{ exchangingDownload ? '兑换中...' : `${downloadPermission.exchange_cost}积分兑换下载` }}
              </button>
            </template>
            <button class="btn btn-outline favorite-action" :class="{ 'is-favorited': beat.is_favorited }" @click="toggleFavorite">
              <span v-if="beat.is_favorited">❤️</span>
              <span v-else>🤍</span>
              {{ beat.is_favorited ? '已收藏' : '收藏' }}
            </button>
          </div>

          <p class="download-count">
            下载 {{ beat.download_count }} 次
            <span v-if="vipStatus && authStore.vipLevel !== 'ultimate'" class="vip-tip">
              · <template v-if="authStore.isVip">今日剩余 {{ vipStatus.remaining_downloads ?? '∞' }} 次下载</template>
              <template v-else-if="downloadPermission.remaining_permissions > 0">积分兑换权限剩余 {{ downloadPermission.remaining_permissions }} 次</template>
              <template v-else>可用 {{ downloadPermission.exchange_cost }} 积分兑换下载权限</template>
              <RouterLink to="/points" class="vip-link">积分中心</RouterLink>
            </span>
          </p>
        </div>
      </div>

      <CommentSection :beat-id="beat.id" />
    </div>
  </div>

  <BeatLicenseAgreement
    v-if="showLicense && beat"
    :beat-id="beat.id"
    :beat-title="beat.title"
    @agreed="handleLicenseAgreed"
    @cancelled="handleLicenseCancelled"
  />
</template>

<style scoped>
.detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.loading-state {
  display: flex;
  gap: 40px;
}

.skeleton-cover-large {
  width: 300px;
  height: 300px;
  flex-shrink: 0;
}

.skeleton-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 20px;
}

.error-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.error-state p {
  font-size: 16px;
  margin-bottom: 16px;
}

.detail-content {
  display: flex;
  flex-direction: column;
}

.detail-top {
  display: flex;
  gap: 40px;
}

.detail-cover {
  width: 300px;
  height: 300px;
  flex-shrink: 0;
  border-radius: var(--radius);
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.creator-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text-secondary);
  margin-bottom: 8px;
  transition: color 0.15s ease;
}

.creator-row:hover {
  color: var(--accent);
}

.creator-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-card);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.creator-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.creator-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creator-row:hover .creator-name {
  color: var(--accent);
}

.creator-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  letter-spacing: 0.3px;
}

.creator-badge-admin {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.detail-title {
  font-size: 32px;
  font-weight: 800;
  margin: 0;
}

.detail-producer {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.detail-meta {
  display: flex;
  gap: 24px;
  margin-top: 8px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 16px;
  font-weight: 600;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.tag {
  font-size: 12px;
  padding: 4px 12px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 999px;
  font-weight: 500;
}

.detail-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.play-action {
  padding: 14px 32px;
  font-size: 16px;
}

.download-action {
  padding: 14px 32px;
  font-size: 16px;
  text-decoration: none;
}

.download-action.has-permission {
  border-color: #10b981;
  color: #10b981;
}

.download-action.has-permission:hover {
  background-color: rgba(16, 185, 129, 0.1);
}

.btn-points {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 14px 32px;
  font-size: 16px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.btn-points:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-points:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.download-count {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.vip-tip {
  color: var(--text-secondary);
}

.vip-link {
  color: #f59e0b;
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}

.vip-link:hover {
  text-decoration: underline;
}

.download-count-inline {
  font-size: 12px;
  color: #f59e0b;
  margin-left: 4px;
}

.tag-vip {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.vip-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.btn-vip {
  background: #f59e0b;
  color: #000;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-vip:hover {
  background: #d97706;
}

.favorite-action {
  padding: 14px 32px;
  font-size: 16px;
  transition: transform 0.2s ease;
}

.favorite-action:hover {
  transform: scale(1.05);
}

.favorite-action.is-favorited {
  color: #ef4444;
  border-color: #ef4444;
}

@media (max-width: 768px) {
  .detail-top {
    flex-direction: column;
    align-items: center;
  }

  .detail-cover {
    width: 100%;
    max-width: 320px;
    height: auto;
    aspect-ratio: 1;
  }

  .detail-info {
    align-items: center;
    text-align: center;
  }

  .detail-meta {
    justify-content: center;
  }

  .detail-tags {
    justify-content: center;
  }

  .detail-actions {
    justify-content: center;
    flex-wrap: wrap;
  }

  .detail-title {
    font-size: 24px;
  }
}
</style>
