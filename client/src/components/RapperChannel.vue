<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchRappers } from '@/api/rappers'
import type { RapperItem } from '@/api/rappers'

const router = useRouter()
const rappers = ref<RapperItem[]>([])
const loading = ref(true)

const hasRappers = computed(() => rappers.value.length > 0)

onMounted(async () => {
  loading.value = true
  try {
    rappers.value = await fetchRappers()
  } catch (err) {
    console.error('Failed to load rappers:', err)
  } finally {
    loading.value = false
  }
})

function goToRapper(id: number) {
  router.push(`/rapper/${id}`)
}
</script>

<template>
  <div class="rapper-channel">
    <!-- Loading state -->
    <div v-if="loading" class="rapper-loading">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasRappers" class="rapper-empty">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </div>
      <p>暂无 Rapper 频道</p>
    </div>

    <!-- Rappers Grid -->
    <div v-else class="rapper-grid">
      <div
        v-for="rapper in rappers"
        :key="rapper.id"
        class="rapper-card"
        @click="goToRapper(rapper.id)"
      >
        <div class="rapper-card-cover">
          <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
          <div v-else class="cover-placeholder">{{ rapper.name.charAt(0).toUpperCase() }}</div>
          <div class="rapper-card-overlay">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
        </div>
        <div class="rapper-card-avatar">
          <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
          <span v-else class="avatar-placeholder">{{ rapper.name.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="rapper-card-content">
          <h3 class="rapper-card-name">{{ rapper.name }}</h3>
          <p class="rapper-card-bio">{{ rapper.bio || '暂无简介' }}</p>
          <div class="rapper-card-footer">
            <span class="stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              {{ rapper.count }} 首
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rapper-channel {
  width: 100%;
}

.rapper-loading,
.rapper-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
  color: var(--text-secondary);
}

.empty-icon {
  opacity: 0.5;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.rapper-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.rapper-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.rapper-card:hover {
  border-color: var(--accent);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.2);
}

.rapper-card-cover {
  position: relative;
  width: 100%;
  height: 100px;
  background: linear-gradient(135deg, var(--accent), #a855f7);
  overflow: hidden;
}

.rapper-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 700;
  color: white;
}

.rapper-card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  color: white;
}

.rapper-card:hover .rapper-card-overlay {
  opacity: 1;
}

.rapper-card-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-card);
  border: 3px solid var(--bg-card);
  margin: -32px auto 0;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.rapper-card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rapper-card-avatar .avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent), #a855f7);
  font-size: 24px;
  font-weight: 700;
  color: white;
}

.rapper-card-content {
  padding: 12px 12px 16px;
  text-align: center;
}

.rapper-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.rapper-card-bio {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 10px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 34px;
}

.rapper-card-footer {
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--accent);
  font-weight: 500;
}

/* Detail Overlay */
.rapper-detail-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rapper-detail-panel {
  width: 85%;
  max-width: 900px;
  max-height: 100vh;
  background: var(--bg-primary);
  overflow-y: auto;
  animation: slideIn 0.3s ease;
  box-sizing: border-box;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  z-index: 10;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
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

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.detail-info {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 32px 20px;
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-primary) 100%);
  flex-wrap: wrap;
}

.detail-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--accent), #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
}

.detail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-avatar .avatar-placeholder {
  font-size: 56px;
  font-weight: 700;
  color: white;
}

.detail-text {
  flex: 1;
}

.detail-name {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.detail-bio {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 20px 0;
  max-width: 500px;
}

.detail-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.detail-beats {
  padding: 24px;
}

.beats-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 24px 0;
}

.beats-loading,
.beats-empty {
  display: flex;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.beats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

/* Beats List (Admin Mode) */
.beats-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.beat-list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.beat-list-item:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.list-cover {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
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
  border: none;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.list-cover:hover .list-play-btn {
  opacity: 1;
}

.list-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
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
  color: white;
}

.list-free-badge {
  background: #16a34a;
  color: white;
}

.list-meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.list-producer {
  color: var(--accent);
}

.list-divider {
  color: var(--border);
}

.list-stats {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.list-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.list-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.list-action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-light);
}

.list-action-btn.edit-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.list-action-btn.delete-btn {
  color: #ef4444;
}

.list-action-btn.delete-btn:hover {
  border-color: #ef4444;
  color: white;
  background: #ef4444;
}

/* Edit Modal */
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.edit-modal {
  width: 90%;
  max-width: 500px;
  background: var(--bg-primary);
  border-radius: 16px;
  border: 1px solid var(--border);
  overflow: hidden;
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.edit-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.edit-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.edit-modal-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.edit-modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-group input[type="text"],
.form-group input[type="number"] {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent);
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row .form-group {
  flex: 1;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-direction: row;
}

.checkbox-group input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.checkbox-group span {
  font-size: 14px;
  color: var(--text-primary);
}

.edit-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border);
}

.btn-cancel,
.btn-save {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.btn-cancel:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.btn-save {
  border: none;
  background: var(--accent);
  color: white;
}

.btn-save:hover {
  background: var(--accent-hover);
}

/* Responsive */
@media (max-width: 1200px) {
  .rapper-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .rapper-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .rapper-card-cover {
    height: 80px;
  }
  
  .rapper-card-avatar {
    width: 56px;
    height: 56px;
    margin-top: -28px;
  }
  
  .rapper-card-avatar .avatar-placeholder {
    font-size: 20px;
  }
  
  .rapper-card-content {
    padding: 10px 10px 14px;
  }
  
  .rapper-card-name {
    font-size: 13px;
  }
  
  .rapper-card-bio {
    font-size: 11px;
    height: 30px;
  }
  
  .rapper-detail-panel {
    width: 100%;
  }
  
  .detail-info {
    flex-direction: column;
    text-align: center;
    padding: 24px 16px;
  }
  
  .detail-avatar {
    width: 100px;
    height: 100px;
  }
  
  .detail-avatar .avatar-placeholder {
    font-size: 40px;
  }
  
  .detail-name {
    font-size: 24px;
  }
  
  .beats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
