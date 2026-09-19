<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  user: any
  operatingId: number | null
  messagingId: number | null
}>()

const emit = defineEmits<{
  (e: 'toggle-follow', user: any): void
  (e: 'open-message', user: any): void
}>()

const router = useRouter()
const authStore = useAuthStore()
</script>

<template>
        <article
          class="user-card"
          @click="router.push(`/u/${user.id}`)"
        >
          <!-- 左列：头像区 -->
          <div class="user-avatar-col">
            <div class="avatar-frame">
              <img
                v-if="user.avatar_url"
                :src="user.avatar_url"
                :alt="user.nickname"
                class="avatar-img"
              />
              <div v-else class="avatar-fallback">
                {{ (user.nickname || user.username || '?').charAt(0).toUpperCase() }}
              </div>
              <!-- Beatmaker 认证勋章 -->
              <span
                v-if="user.is_beatmaker"
                class="badge badge-bm"
                title="官方认证 Beatmaker"
              >
                <span class="badge-icon">★</span>
              </span>
              <!-- VIP 角标 -->
              <span
                v-if="user.vip_level && user.vip_level !== 'free'"
                :class="['badge badge-vip', `vip-${user.vip_level}`]"
                :title="`${user.vip_level === 'basic' ? '基础' : user.vip_level === 'premium' ? '高级' : '至尊'} VIP`"
              >
                VIP
              </span>
            </div>
          </div>

          <!-- 中列：信息区 -->
          <div class="user-info-col">
            <div class="info-line info-name-row">
              <span class="info-name">{{ user.nickname || user.username }}</span>
              <span
                v-if="user.vip_level && user.vip_level !== 'free'"
                :class="['vip-pill', `vip-${user.vip_level}`]"
              >
                <span class="vip-icon">♛</span>
                {{ user.vip_level === 'basic' ? '基础' : user.vip_level === 'premium' ? '高级' : '至尊' }}
              </span>
              <span v-if="user.is_beatmaker" class="bm-pill">
                <span class="bm-icon">★</span>
                认证 Beatmaker
              </span>
            </div>
            <div class="info-line info-account-row">
              <span class="account-tag">RAP BEATS</span>
              <span class="account-name">@{{ user.username }}</span>
            </div>
            <div v-if="user.bio" class="info-line info-bio">{{ user.bio }}</div>
            <div class="info-line info-stats">
              <span class="stat-item">
                <strong>{{ user.followers_count ?? 0 }}</strong>
                <span class="stat-label">粉丝</span>
              </span>
              <span class="stat-divider"></span>
              <span class="stat-item">
                <strong>{{ user.beats_count ?? 0 }}</strong>
                <span class="stat-label">作品</span>
              </span>
            </div>
          </div>

          <!-- 右列：操作区 -->
          <div v-if="authStore.user && user.id !== authStore.user.id" class="user-action-col" @click.stop>
            <button
              :class="['btn', 'btn-flex', user.is_followed_by_me ? 'btn-followed' : 'btn-primary']"
              :disabled="operatingId === user.id"
              @click="emit('toggle-follow', user)"
            >
              <span v-if="operatingId === user.id" class="btn-spinner"></span>
              <span v-else>{{ user.is_followed_by_me ? '已关注' : '+ 关注' }}</span>
            </button>
            <button
              class="btn btn-flex btn-ghost"
              :disabled="messagingId === user.id"
              @click="emit('open-message', user)"
            >
              <span v-if="messagingId === user.id" class="btn-spinner"></span>
              <span v-else>私信</span>
            </button>
          </div>
          <div v-else-if="!authStore.user" class="user-action-col">
            <router-link to="/login" class="btn btn-flex btn-primary" @click.stop>
              登录后关注
            </router-link>
          </div>
        </article>
</template>

<style scoped>
.user-card {
  position: relative;
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: auto auto;
  gap: 8px 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: visible;
}

.user-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #7c3aed, #ec4899);
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 12px 0 0 12px;
}

.user-card:hover {
  border-color: rgba(124, 58, 237, 0.4);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.user-card:hover::before {
  opacity: 1;
}

/* ---------- 左列：头像 ---------- */
.user-avatar-col {
  grid-column: 1;
  grid-row: 1 / span 2;
  flex-shrink: 0;
}

.avatar-frame {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f59e0b 100%);
}

.avatar-img,
.avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  text-transform: uppercase;
  user-select: none;
}

/* Beatmaker 勋章 - 右下角 */
.badge-bm {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.5);
  border: 2px solid var(--bg-card);
  z-index: 2;
}

.badge-bm .badge-icon {
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

/* VIP 角标 - 左上角 */
.badge-vip {
  position: absolute;
  top: -6px;
  left: -8px;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  border: 2px solid var(--bg-card);
  z-index: 2;
}

.badge-vip.vip-basic {
  background: linear-gradient(135deg, #06b6d4, #0891b2);
}

.badge-vip.vip-premium {
  background: linear-gradient(135deg, #8b5cf6, #d946ef);
}

.badge-vip.vip-ultimate {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
}

/* ---------- 中列：信息 ---------- */
.user-info-col {
  grid-column: 2;
  grid-row: 1;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* 昵称 + 标签行 */
.info-name-row {
  font-size: 15px;
  align-items: baseline;
  gap: 6px;
}

.info-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 15px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
}

.vip-pill.vip-basic {
  background: linear-gradient(135deg, #06b6d4, #0891b2);
}

.vip-pill.vip-premium {
  background: linear-gradient(135deg, #8b5cf6, #d946ef);
}

.vip-pill.vip-ultimate {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
}

.vip-pill .vip-icon {
  font-size: 9px;
}

.bm-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
}

.bm-pill .bm-icon {
  font-size: 9px;
}

/* 账号行 */
.info-account-row {
  font-size: 11px;
  color: var(--text-secondary);
}

.account-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.account-name {
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-secondary);
  font-size: 11px;
}

/* 简介 */
.info-bio {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ---------- 右列：操作（在第二行） ---------- */
.user-action-col {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  text-decoration: none;
  white-space: nowrap;
}

.btn-flex {
  flex: 1;
  min-width: 0;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}

.btn-followed {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-color: var(--border);
}

.btn-followed:hover:not(:disabled) {
  color: #ef4444;
  border-color: #ef4444;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--accent);
  color: var(--accent);
}

.btn-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

</style>
