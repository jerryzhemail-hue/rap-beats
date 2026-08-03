<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { computed, ref } from 'vue'
import { resolveCoverUrl } from '@/utils/assets'
import { getDownloadUrl } from '@/api/beats'

const playerStore = usePlayerStore()
const authStore = useAuthStore()

const progress = computed(() => {
  if (playerStore.duration <= 0) return 0
  return (playerStore.currentTime / playerStore.duration) * 100
})

const volumePercent = computed(() => Math.round(playerStore.volume * 100))

const isDragging = ref(false)

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function onProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerStore.setTime(percent * playerStore.duration)
}

function onProgressDragStart(e: MouseEvent) {
  isDragging.value = true
  onProgressDrag(e)
  const onMove = (ev: MouseEvent) => onProgressDrag(ev)
  const onUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onProgressDrag(e: MouseEvent) {
  const bar = document.querySelector('.prog-track') as HTMLElement
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerStore.setTime(percent * playerStore.duration)
}

function onVolumeClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerStore.setVolume(percent)
}

function togglePlay() {
  if (playerStore.isStopped) {
    playerStore.resume()
  } else if (playerStore.isPlaying) {
    playerStore.pause()
  } else {
    playerStore.resume()
  }
}

// A-B 段落起点/终点 tooltip
const abLoopTooltip = computed(() => {
  if (playerStore.loopStart !== null && playerStore.loopEnd !== null) {
    return `${formatTime(playerStore.loopStart)} — ${formatTime(playerStore.loopEnd)}`
  }
  if (playerStore.loopStart !== null) return `${formatTime(playerStore.loopStart)} → ?`
  return ''
})

function handleDownload() {
  if (!playerStore.currentBeat) return
  const url = getDownloadUrl(playerStore.currentBeat.id)
  const a = document.createElement('a')
  a.href = url
  a.download = playerStore.currentBeat.title + '.mp3'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#252540" width="200" height="200"/><text fill="#7c3aed" font-size="60" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')

function getCoverUrl(coverImage: string | null | undefined) {
  return resolveCoverUrl(coverImage, defaultCover)
}

// 进度条上鼠标位置对应的播放时间（hover 用）
const hoverTime = ref<string>('')
const hoverPercent = ref<number>(0)

function onProgressHover(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  hoverPercent.value = percent
  const t = percent * playerStore.duration
  hoverTime.value = formatTime(t)
}
function onProgressLeave() {
  hoverTime.value = ''
}
</script>

<template>
  <div v-if="playerStore.currentBeat" class="audio-player">
    <!-- 左侧：封面 + 曲目信息 + 试听提示 -->
    <div class="player-left">
      <button class="player-close" @click="playerStore.close()" title="关闭">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <img :src="getCoverUrl(playerStore.currentBeat.cover_image)" :alt="playerStore.currentBeat.title" class="player-cover" />
      <div class="player-track-info">
        <span class="player-title">{{ playerStore.currentBeat.title }}</span>
        <span class="player-producer">{{ playerStore.currentBeat.producer }}</span>
        <div class="track-badges">
          <span v-if="playerStore.isPreviewMode && !authStore.isAuthenticated" class="badge badge-preview">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            试听40秒
          </span>
          <span v-if="playerStore.isPreviewMode && !authStore.isAuthenticated" class="badge badge-count">
            剩余 <strong>{{ playerStore.getRemainingFreeCount() }}</strong> 次
          </span>
        </div>
      </div>
    </div>

    <!-- 中央：控制区 -->
    <div class="player-center">
      <!-- 控制按钮行 -->
      <div class="ctrl-row">
        <!-- 上一曲 -->
        <button class="ctrl-btn" @click="playerStore.prev()" title="上一曲">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20"/>
            <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>

        <!-- 停止 -->
        <button class="ctrl-btn" @click="playerStore.stop()" title="停止">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
        </button>

        <!-- 播放/暂停 -->
        <button class="ctrl-btn ctrl-playpause" @click="togglePlay" title="播放/暂停">
          <svg v-if="playerStore.isPlaying && !playerStore.isStopped" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>

        <!-- 下一曲 -->
        <button class="ctrl-btn" @click="playerStore.next()" title="下一曲">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>

        <!-- 循环 -->
        <button
          class="ctrl-btn"
          :class="{ active: playerStore.isLooping }"
          @click="playerStore.toggleLoop()"
          title="循环播放"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>

        <!-- A-B 重复 -->
        <button
          class="ctrl-btn"
          :class="{ active: playerStore.loopStart !== null }"
          @click="playerStore.setLoopStart()"
          title="设置A点 / A-B重复"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          <span v-if="abLoopTooltip" class="ab-tooltip">{{ abLoopTooltip }}</span>
        </button>

        <!-- A-B 清除（仅在设置了 A-B 时显示） -->
        <button
          v-if="playerStore.loopStart !== null"
          class="ctrl-btn"
          @click="playerStore.clearLoop()"
          title="清除A-B重复"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- 下载 -->
        <button class="ctrl-btn" @click="handleDownload" title="下载音频">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>

      <!-- 进度条 -->
      <div class="progress-row">
        <span class="time-label">{{ formatTime(playerStore.currentTime) }}</span>
        <div
          class="progress-wrap"
          @click="onProgressClick"
          @mousedown="onProgressDragStart"
          @mousemove="onProgressHover"
          @mouseleave="onProgressLeave"
        >
          <div class="prog-track">
            <!-- A-B 高亮区间 -->
            <div
              v-if="playerStore.loopStart !== null && playerStore.loopEnd !== null && playerStore.duration > 0"
              class="prog-ab-range"
              :style="{
                left: (playerStore.loopStart / playerStore.duration * 100) + '%',
                width: ((playerStore.loopEnd - playerStore.loopStart) / playerStore.duration * 100) + '%'
              }"
            />
            <!-- A 标记 -->
            <div
              v-if="playerStore.loopStart !== null && playerStore.duration > 0"
              class="prog-marker prog-marker-a"
              :style="{ left: (playerStore.loopStart / playerStore.duration * 100) + '%' }"
            />
            <!-- B 标记 -->
            <div
              v-if="playerStore.loopEnd !== null && playerStore.duration > 0"
              class="prog-marker prog-marker-b"
              :style="{ left: (playerStore.loopEnd / playerStore.duration * 100) + '%' }"
            />
            <div class="prog-fill" :style="{ width: `${progress}%` }" />
            <div class="prog-thumb" :style="{ left: `${progress}%` }" />
            <!-- hover 时间提示 -->
            <div v-if="hoverTime" class="prog-hover-time" :style="{ left: (hoverPercent * 100) + '%' }">{{ hoverTime }}</div>
          </div>
        </div>
        <span class="time-label">{{ formatTime(playerStore.duration) }}</span>
      </div>
    </div>

    <!-- 右侧：音量控制 -->
    <div class="player-right">
      <div class="volume-wrap" @click="onVolumeClick">
        <button class="ctrl-btn vol-icon" @click.stop="playerStore.setVolume(playerStore.volume > 0 ? 0 : 0.8)">
          <svg v-if="playerStore.volume === 0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
          <svg v-else-if="playerStore.volume < 0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>
        <div class="vol-track-wrap">
          <div class="vol-track">
            <div class="vol-fill" :style="{ width: `${volumePercent}%` }" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- VIP 提示弹窗 -->
  <Teleport to="body">
    <div v-if="playerStore.showVipPrompt" class="prompt-overlay" @click.self="playerStore.dismissVipPrompt()">
      <div class="prompt-card">
        <div class="prompt-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <h3>试听结束</h3>
        <p>升级会员畅听完整版，享受更多下载与高品质伴奏</p>
        <div class="prompt-actions">
          <button class="btn-later" @click="playerStore.dismissVipPrompt()">以后再说</button>
          <router-link to="/vip" class="btn-go" @click="playerStore.dismissVipPrompt()">开通VIP</router-link>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 免费次数弹窗 -->
  <Teleport to="body">
    <div v-if="playerStore.showLimitPrompt" class="prompt-overlay" @click.self="playerStore.dismissLimitPrompt()">
      <div class="prompt-card">
        <div class="prompt-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3>免费试听次数已用完</h3>
        <p>今日免费试听次数已用完。注册并登录后成为会员，享受完整版试听和无限下载权益。</p>
        <div class="prompt-actions">
          <button class="btn-later" @click="playerStore.dismissLimitPrompt()">继续浏览</button>
          <router-link to="/register" class="btn-go" @click="playerStore.dismissLimitPrompt()">注册账号</router-link>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── 播放器主体 ─────────────────────────────────────────── */
.audio-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: 88px;
  background: rgba(18, 18, 36, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(124, 58, 237, 0.25);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4);
}

/* ── 左侧 ──────────────────────────────────────────────── */
.player-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 0 auto;
  max-width: 260px;
}

.player-close {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
  flex-shrink: 0;
}
.player-close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.player-cover {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.player-track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.player-title {
  font-size: 13px;
  font-weight: 600;
  color: #f0f0ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-producer {
  font-size: 11px;
  color: rgba(200, 200, 220, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-badges {
  display: flex;
  gap: 4px;
  margin-top: 3px;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-preview {
  background: rgba(245, 158, 11, 0.18);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-count {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(124, 58, 237, 0.25);
}

.badge-count strong {
  color: #c4b5fd;
}

/* ── 中央 ──────────────────────────────────────────────── */
.player-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

/* 控制按钮行 */
.ctrl-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-btn {
  color: rgba(200, 200, 220, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s, transform 0.1s;
  position: relative;
  cursor: pointer;
  border: none;
  background: transparent;
}

.ctrl-btn:hover {
  color: #f0f0ff;
  background: rgba(255, 255, 255, 0.08);
  transform: scale(1.05);
}

.ctrl-btn:active {
  transform: scale(0.95);
}

.ctrl-btn.active {
  color: #a78bfa;
  background: rgba(124, 58, 237, 0.18);
}

.ctrl-btn.active:hover {
  background: rgba(124, 58, 237, 0.28);
}

.ctrl-playpause {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff !important;
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.5);
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
}

.ctrl-playpause:hover {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.65);
  transform: scale(1.08);
}

.ctrl-playpause:active {
  transform: scale(0.92);
}

/* A-B tooltip */
.ab-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 40, 0.95);
  border: 1px solid rgba(124, 58, 237, 0.4);
  color: #c4b5fd;
  font-size: 10px;
  padding: 3px 7px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}

/* 进度条 */
.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 540px;
}

.time-label {
  font-size: 11px;
  color: rgba(200, 200, 220, 0.5);
  font-variant-numeric: tabular-nums;
  min-width: 34px;
  text-align: center;
}

.progress-wrap {
  flex: 1;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.prog-track {
  position: relative;
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: visible;
  transition: height 0.15s;
}

.progress-wrap:hover .prog-track {
  height: 7px;
}

.prog-ab-range {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(124, 58, 237, 0.2);
  border-radius: 3px;
  pointer-events: none;
}

.prog-marker {
  position: absolute;
  top: -3px;
  width: 3px;
  height: 11px;
  border-radius: 2px;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 2;
}

.prog-marker-a { background: #a78bfa; }
.prog-marker-b { background: #f59e0b; }

.prog-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
  border-radius: 3px;
  pointer-events: none;
}

.prog-thumb {
  position: absolute;
  top: 50%;
  width: 13px;
  height: 13px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: opacity 0.15s;
}

.progress-wrap:hover .prog-thumb {
  opacity: 1;
}

.prog-hover-time {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  font-size: 10px;
  color: rgba(200, 200, 220, 0.7);
  pointer-events: none;
  transform: translateX(-50%);
}

/* ── 右侧 ──────────────────────────────────────────────── */
.player-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.vol-icon {
  width: 28px;
  height: 28px;
}

.vol-track-wrap {
  width: 80px;
  height: 20px;
  display: flex;
  align-items: center;
}

.vol-track {
  position: relative;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.volume-wrap:hover .vol-track {
  height: 5px;
}

.vol-fill {
  height: 100%;
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
  border-radius: 2px;
}

.reset-btn {
  font-size: 11px;
  color: #a78bfa;
  background: rgba(124, 58, 237, 0.12);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}

.reset-btn:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.25);
  color: #c4b5fd;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 弹窗 ──────────────────────────────────────────────── */
.prompt-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.prompt-card {
  background: #1a1a32;
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  min-width: 340px;
  max-width: 400px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
}

.prompt-icon { margin-bottom: 16px; }

.prompt-card h3 {
  font-size: 20px;
  color: #f0f0ff;
  margin: 0 0 10px;
}

.prompt-card p {
  font-size: 14px;
  color: rgba(200, 200, 220, 0.65);
  margin: 0 0 24px;
  line-height: 1.6;
}

.prompt-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-later {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(200, 200, 220, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-later:hover { background: rgba(255, 255, 255, 0.1); }

.btn-go {
  padding: 10px 20px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #000;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  border: none;
  display: inline-block;
}
.btn-go:hover { opacity: 0.9; transform: translateY(-1px); }

.btn-reset {
  padding: 10px 20px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}
.btn-reset:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-reset:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 响应式 ────────────────────────────────────────────── */
@media (max-width: 768px) {
  .audio-player {
    padding: 0 12px;
    gap: 10px;
    height: 80px;
  }
  .player-left { max-width: 160px; }
  .player-right { display: none; }
  .ctrl-row { gap: 4px; }
  .progress-row { max-width: 100%; }
  .track-badges { display: none; }
}
</style>
