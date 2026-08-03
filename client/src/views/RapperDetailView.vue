<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { fetchRapper } from '@/api/rappers'
import { fetchBeats, getDownloadUrl, updateBeat, deleteBeat } from '@/api/beats'
import { resolveCoverUrl } from '@/utils/assets'
import type { Beat } from '@/types'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#252540" width="200" height="200"/><text fill="#7c3aed" font-size="60" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')

interface RapperDetail {
  id: number
  name: string
  avatar_url: string | null
  bio: string | null
  sort_order: number
  count: number
}

const rapper = ref<RapperDetail | null>(null)
const beats = ref<Beat[]>([])
const loading = ref(true)
const beatsLoading = ref(false)
const error = ref('')
const page = ref(1)
const totalPages = ref(1)

function getCoverUrl(coverImage: string | null): string {
  return resolveCoverUrl(coverImage, defaultCover)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function isPlaying(beatId: number): boolean {
  return playerStore.currentBeat?.id === beatId && playerStore.isPlaying
}

function playBeat(beat: Beat) {
  if (beat.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }
  playerStore.play(beat)
}

function goToBeat(beatId: number) {
  router.push(`/beats/${beatId}`)
}

function downloadBeat(beat: Beat) {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  if (beat.is_vip_only && !authStore.isPremiumOrAbove) {
    if (confirm('此伴奏为高级专属内容，请升级至高级或至尊会员')) {
      router.push('/vip')
    }
    return
  }
  window.open(getDownloadUrl(beat.id), '_blank')
}

async function loadData() {
  const id = Number(route.params.id)
  if (isNaN(id)) {
    error.value = '无效的 ID'
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    rapper.value = await fetchRapper(id)
    await loadBeats()
  } catch (err: any) {
    error.value = err.message || '加载失败'
    console.error('Failed to load rapper:', err)
  } finally {
    loading.value = false
  }
}

async function loadBeats() {
  if (!rapper.value) return

  beatsLoading.value = true
  try {
    const data = await fetchBeats({
      rapper: rapper.value.name,
      page: page.value,
      limit: 20
    })
    beats.value = data.beats
    totalPages.value = data.totalPages
  } catch (err) {
    console.error('Failed to load beats:', err)
  } finally {
    beatsLoading.value = false
  }
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadBeats()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(loadData)

// 管理员编辑相关
const editingBeat = ref<Beat | null>(null)
const editForm = ref({
  title: '',
  producer: '',
  rapper: '',
  bpm: 0,
  key: '',
  genre: '',
  is_free: false
})

function openEditDialog(beat: Beat) {
  editingBeat.value = beat
  editForm.value = {
    title: beat.title || '',
    producer: beat.producer || '',
    rapper: beat.rapper || '',
    bpm: beat.bpm || 0,
    key: beat.key || '',
    genre: beat.genre || '',
    is_free: !!beat.is_free
  }
}

function closeEditDialog() {
  editingBeat.value = null
}

async function saveEdit() {
  if (!editingBeat.value) return
  try {
    await updateBeat(editingBeat.value.id, {
      title: editForm.value.title,
      producer: editForm.value.producer,
      rapper: editForm.value.rapper,
      bpm: editForm.value.bpm,
      key: editForm.value.key,
      genre: editForm.value.genre,
      is_free: editForm.value.is_free
    })
    closeEditDialog()
    await loadBeats()
  } catch (err) {
    console.error('Failed to update beat:', err)
    alert('更新失败，请重试')
  }
}

async function handleDelete(beat: Beat) {
  if (!confirm(`确定要删除《${beat.title}》这首伴奏吗？此操作不可恢复。`)) {
    return
  }
  try {
    await deleteBeat(beat.id)
    await loadBeats()
  } catch (err) {
    console.error('Failed to delete beat:', err)
    alert('删除失败，请重试')
  }
}
</script>

<template>
  <div class="rapper-detail">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="btn btn-outline" @click="loadData">重试</button>
    </div>

    <!-- Content -->
    <template v-else-if="rapper">
      <!-- Back button -->
      <button class="back-btn" @click="router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        返回
      </button>

      <!-- Header -->
      <div class="rapper-header">
        <div class="rapper-avatar">
          <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
          <span v-else class="avatar-placeholder">{{ rapper.name.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="rapper-info">
          <h1 class="rapper-name">{{ rapper.name }}</h1>
          <p v-if="rapper.bio" class="rapper-bio">{{ rapper.bio }}</p>
          <div class="rapper-stats">
            <span class="stat-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              {{ rapper.count }} 首伴奏
            </span>
          </div>
        </div>
      </div>

      <!-- Beats section -->
      <div class="beats-section">
        <h2 class="section-title">全部伴奏</h2>

        <div v-if="beatsLoading" class="beats-loading">
          <div class="spinner"></div>
        </div>

        <div v-else-if="beats.length === 0" class="empty-state">
          <p>暂无伴奏</p>
        </div>

        <div v-else class="beats-list">
          <div
            v-for="beat in beats"
            :key="beat.id"
            class="beat-list-item"
            @click="goToBeat(beat.id)"
          >
            <div class="list-cover">
              <img :src="getCoverUrl(beat.cover_image)" :alt="beat.title" />
              <button class="list-play-btn" @click.stop="playBeat(beat)">
                <svg v-if="!isPlaying(beat.id)" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
              </button>
            </div>
            <div class="list-info">
              <div class="list-title-row">
                <h3 class="list-title">{{ beat.title }}</h3>
                <span v-if="beat.is_vip_only" class="list-vip-badge">VIP</span>
                <span v-else-if="beat.is_free" class="list-free-badge">FREE</span>
              </div>
              <p class="list-meta">
                <span class="list-producer">{{ beat.producer }}</span>
                <span class="list-divider">·</span>
                <span>{{ beat.genre }}</span>
                <span class="list-divider">·</span>
                <span>{{ beat.bpm }} BPM</span>
                <span class="list-divider">·</span>
                <span>{{ beat.key }}</span>
              </p>
              <div class="list-stats">
                <span>{{ formatDuration(beat.duration) }}</span>
                <span class="list-divider">·</span>
                <span>{{ beat.download_count || 0 }} 次下载</span>
              </div>
            </div>
            <div class="list-actions">
              <template v-if="authStore.isAdmin">
                <button class="list-action-btn edit-btn" @click.stop="openEditDialog(beat)" title="编辑">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <span>编辑</span>
                </button>
                <button class="list-action-btn delete-btn" @click.stop="handleDelete(beat)" title="删除">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                  <span>删除</span>
                </button>
              </template>
              <button class="list-action-btn" @click.stop="downloadBeat(beat)" title="下载">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>下载</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            class="page-btn"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <span class="page-info">{{ page }} / {{ totalPages }}</span>
          <button
            class="page-btn"
            :disabled="page >= totalPages"
            @click="goToPage(page + 1)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Edit Modal (admin only) -->
    <Teleport to="body">
      <div v-if="editingBeat" class="edit-modal-overlay" @click.self="closeEditDialog">
        <div class="edit-modal">
          <div class="edit-modal-header">
            <h3>编辑伴奏</h3>
            <button class="edit-modal-close" @click="closeEditDialog">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="edit-modal-body">
            <div class="form-group">
              <label>标题</label>
              <input type="text" v-model="editForm.title" />
            </div>
            <div class="form-group">
              <label>制作人</label>
              <input type="text" v-model="editForm.producer" />
            </div>
            <div class="form-group">
              <label>Rapper</label>
              <input type="text" v-model="editForm.rapper" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>BPM</label>
                <input type="number" v-model.number="editForm.bpm" />
              </div>
              <div class="form-group">
                <label>调</label>
                <input type="text" v-model="editForm.key" />
              </div>
            </div>
            <div class="form-group">
              <label>风格</label>
              <input type="text" v-model="editForm.genre" />
            </div>
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" v-model="editForm.is_free" />
                <span>免费</span>
              </label>
            </div>
          </div>
          <div class="edit-modal-footer">
            <button class="btn-cancel" @click="closeEditDialog">取消</button>
            <button class="btn-save" @click="saveEdit">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rapper-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  min-height: 100vh;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
  color: var(--text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 24px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.rapper-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 32px;
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border);
  margin-bottom: 32px;
}

.rapper-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rapper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 48px;
  font-weight: 700;
  color: white;
}

.rapper-info {
  flex: 1;
}

.rapper-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.rapper-bio {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 16px 0;
  max-width: 600px;
}

.rapper-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 14px;
}

.beats-section {
  margin-top: 32px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 20px 0;
}

.beats-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.beat-list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
}

.beat-list-item:hover {
  border-color: var(--accent);
  background: var(--bg-secondary);
}

.list-cover {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, #252540 0%, #1e1e2e 100%);
}

.list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-play-btn {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.beat-list-item:hover .list-play-btn {
  opacity: 1;
}

.list-info {
  flex: 1;
  min-width: 0;
}

.list-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.list-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-vip-badge,
.list-free-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.list-vip-badge {
  background: #f59e0b;
  color: #fff;
}

.list-free-badge {
  background: #16a34a;
  color: #fff;
}

.list-meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-divider {
  margin: 0 4px;
  opacity: 0.5;
}

.list-stats {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.8;
}

.list-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.list-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent-light);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.list-action-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding: 20px 0;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  color: var(--text-secondary);
  font-size: 14px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-outline {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-outline:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.beats-loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .rapper-detail {
    padding: 16px;
  }

  .rapper-header {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .rapper-avatar {
    width: 100px;
    height: 100px;
  }

  .rapper-name {
    font-size: 24px;
  }

  .rapper-stats {
    justify-content: center;
  }

  .beat-list-item {
    flex-wrap: wrap;
  }

  .list-actions {
    width: 100%;
    margin-top: 8px;
  }

  .list-action-btn {
    flex: 1;
    justify-content: center;
  }
}

/* Admin action button colors */
.list-action-btn.edit-btn:hover {
  background: #10b981;
  border-color: #10b981;
}

.list-action-btn.delete-btn:hover {
  background: #ef4444;
  border-color: #ef4444;
}

/* Edit Modal */
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.edit-modal {
  width: 90%;
  max-width: 500px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.edit-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.edit-modal-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-modal-close:hover {
  color: var(--text-primary);
}

.edit-modal-body {
  padding: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

.edit-modal-body .form-group {
  margin-bottom: 14px;
}

.edit-modal-body .form-group label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.edit-modal-body .form-group input[type="text"],
.edit-modal-body .form-group input[type="number"] {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.edit-modal-body .form-group input:focus {
  border-color: var(--accent);
}

.edit-modal-body .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.edit-modal-body .checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-primary);
}

.edit-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

.btn-cancel,
.btn-save {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: var(--bg-card);
}

.btn-save {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-save:hover {
  filter: brightness(1.1);
}
</style>
