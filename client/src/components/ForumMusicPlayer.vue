<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  src: string
  coverImage?: string | null
  title?: string
  artist?: string
  genre?: string
  bpm?: number
  allowDownload?: boolean
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isDragging = ref(false)
const showVolume = ref(false)

const progress = computed(() => {
  if (duration.value <= 0) return 0
  return (currentTime.value / duration.value) * 100
})

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function togglePlay() {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

function onProgressClick(e: MouseEvent) {
  if (!audioRef.value) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  audioRef.value.currentTime = percent * duration.value
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
  if (!audioRef.value) return
  const bar = document.querySelector('.forum-player-progress-track') as HTMLElement
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  audioRef.value.currentTime = percent * duration.value
}

function onVolumeChange(e: Event) {
  const input = e.target as HTMLInputElement
  const val = Number(input.value) / 100
  if (audioRef.value) audioRef.value.volume = val
  volume.value = val
}

function onAudioTimeUpdate() {
  if (!isDragging.value && audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

function onAudioLoaded() {
  if (audioRef.value) duration.value = audioRef.value.duration
}

function onAudioEnded() {
  isPlaying.value = false
  currentTime.value = 0
}

function onAudioPlay() { isPlaying.value = true }
function onAudioPause() { isPlaying.value = false }

onMounted(() => {
  if (audioRef.value) {
    audioRef.value.addEventListener('timeupdate', onAudioTimeUpdate)
    audioRef.value.addEventListener('loadedmetadata', onAudioLoaded)
    audioRef.value.addEventListener('ended', onAudioEnded)
    audioRef.value.addEventListener('play', onAudioPlay)
    audioRef.value.addEventListener('pause', onAudioPause)
  }
})

onUnmounted(() => {
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.removeEventListener('timeupdate', onAudioTimeUpdate)
    audioRef.value.removeEventListener('loadedmetadata', onAudioLoaded)
    audioRef.value.removeEventListener('ended', onAudioEnded)
    audioRef.value.removeEventListener('play', onAudioPlay)
    audioRef.value.removeEventListener('pause', onAudioPause)
  }
})
</script>

<template>
  <div class="forum-player">
    <audio ref="audioRef" :src="src" preload="metadata" />

    <div class="fp-cover">
      <img v-if="coverImage" :src="coverImage" :alt="title || '封面'" />
      <div v-else class="fp-cover-placeholder">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
    </div>

    <div class="fp-info">
      <div class="fp-title">{{ title || '未知歌名' }}</div>
      <div class="fp-artist">{{ artist || '未知艺术家' }}</div>
      <div v-if="genre || bpm" class="fp-meta">
        <span v-if="genre" class="fp-tag">{{ genre }}</span>
        <span v-if="bpm" class="fp-tag">{{ bpm }} BPM</span>
      </div>
    </div>

      <div class="fp-controls">
        <button class="fp-play-btn" @click="togglePlay">
          <svg v-if="!isPlaying" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
        </button>

        <div v-if="props.allowDownload" class="fp-download-btn-wrap">
          <a
            :href="props.src"
            download
            class="fp-download-btn"
            title="免费下载音频"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </a>
        </div>

        <div class="fp-time-left">{{ formatTime(currentTime) }}</div>

      <div class="fp-progress" @click="onProgressClick" @mousedown="onProgressDragStart">
        <div class="fp-progress-track">
          <div class="fp-progress-fill" :style="{ width: progress + '%' }"></div>
          <div class="fp-progress-thumb" :style="{ left: progress + '%' }"></div>
        </div>
      </div>

      <div class="fp-time-right">{{ formatTime(duration) }}</div>

      <div class="fp-volume-wrap" @mouseenter="showVolume = true" @mouseleave="showVolume = false">
        <button class="fp-vol-btn" @click.stop="showVolume = !showVolume">
          <svg v-if="volume === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
          <svg v-else-if="volume < 0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>
        <div v-if="showVolume" class="fp-volume-popup">
          <input type="range" min="0" max="100" :value="Math.round(volume * 100)" @input="onVolumeChange" class="fp-volume-slider" orient="vertical" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forum-player {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
  border: 1px solid var(--border);
}

.fp-cover {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(135deg, #252540, #1a1a30);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.fp-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fp-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fp-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fp-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-artist {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-meta {
  display: flex;
  gap: 4px;
  margin-top: 2px;
  flex-wrap: wrap;
}
.fp-tag {
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-light);
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 600;
}

.fp-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.fp-play-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, transform 0.15s;
  padding: 0;
  flex-shrink: 0;
}
.fp-play-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.fp-download-btn-wrap {
  flex-shrink: 0;
}
.fp-download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--accent);
  border: 1.5px solid var(--border);
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  text-decoration: none;
}
.fp-download-btn:hover {
  background: var(--accent-light);
  border-color: var(--accent);
  transform: scale(1.05);
}

.fp-time-left,
.fp-time-right {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 30px;
}
.fp-time-right { text-align: right; }

.fp-progress {
  width: 100px;
  cursor: pointer;
  padding: 6px 0;
}
.fp-progress-track {
  position: relative;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
}
.fp-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.1s;
}
.fp-progress-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s;
}
.fp-progress:hover .fp-progress-thumb { opacity: 1; }

.fp-volume-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.fp-vol-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
}
.fp-vol-btn:hover { color: var(--text-primary); }

.fp-volume-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 8px;
  display: flex;
  justify-content: center;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.fp-volume-slider {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 6px;
  height: 80px;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
