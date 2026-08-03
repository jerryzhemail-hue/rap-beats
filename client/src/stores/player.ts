import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Beat } from '@/types'
import { getStreamUrl, recordPlayEvent } from '@/api/beats'
import { checkPreviewPermission, recordPreviewPlay } from '@/api/preview'
import { useAuthStore } from '@/stores/auth'

const FREE_PREVIEW_DURATION_SECONDS = 40
const FREE_PREVIEW_LIMIT = 3

export const usePlayerStore = defineStore('player', () => {
  const currentBeat = ref<Beat | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(0.8)
  const playlist = ref<Beat[]>([])
  const showVipPrompt = ref(false)
  const showLimitPrompt = ref(false)
  const isPreviewMode = ref(false)
  const remainingFreeCount = ref(Infinity)
  const isInitialized = ref(false)
  const isLooping = ref(false) // 循环播放
  const isStopped = ref(false) // 是否已停止
  // A-B 段落重复
  const loopStart = ref<number | null>(null)  // null 表示未设置起点
  const loopEnd = ref<number | null>(null)    // null 表示未设置终点
  const isSettingLoopStart = ref(false)       // 正在设置 A 点
  const isSettingLoopEnd = ref(false)        // 正在设置 B 点

  let audio: HTMLAudioElement | null = null
  let reportedBeatId: number | null = null

  async function checkGuestPermission(): Promise<boolean> {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) {
      remainingFreeCount.value = Infinity
      return true
    }

    try {
      const result = await checkPreviewPermission()
      if (result.allowed) {
        remainingFreeCount.value = result.remaining ?? 0
        return true
      }
      remainingFreeCount.value = result.remaining ?? 0
      return false
    } catch (err) {
      return true
    }
  }

  async function recordGuestPlay(beatId: number): Promise<void> {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) return

    try {
      const result = await recordPreviewPlay(beatId)
      remainingFreeCount.value = result.remaining ?? 0
    } catch {
      // ignore
    }
  }

  function getStreamUrlWithDevice(beatId: number): string {
    return getStreamUrl(beatId)
  }

  function canPlayPreview(): boolean {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) return true
    return remainingFreeCount.value > 0
  }

  function getRemainingFreeCount(): number {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) return Infinity
    return remainingFreeCount.value
  }

  function dismissLimitPrompt() {
    showLimitPrompt.value = false
  }

  // 清除试用状态（不调服务端，客户端重置显示）
  async function clearPreview(): Promise<boolean> {
    remainingFreeCount.value = FREE_PREVIEW_LIMIT
    showLimitPrompt.value = false
    return true
  }

  function getAudio(): HTMLAudioElement {
    if (!audio) {
      audio = new Audio()
      audio.volume = volume.value

      audio.addEventListener('timeupdate', () => {
        currentTime.value = audio!.currentTime
        // 免费用户播放到60秒自动暂停
        const authStore = useAuthStore()
        if (!authStore.canFullPreview && currentTime.value >= FREE_PREVIEW_DURATION_SECONDS) {
          pause()
          showVipPrompt.value = true
        }

        // A-B 段落重复：播放到 B 点时跳回 A 点
        if (loopStart.value !== null && loopEnd.value !== null) {
          if (currentTime.value >= loopEnd.value) {
            audio!.currentTime = loopStart.value
          }
        }

        if (currentBeat.value && currentTime.value >= 3 && reportedBeatId !== currentBeat.value.id) {
          reportedBeatId = currentBeat.value.id
          recordPlayEvent(currentBeat.value.id).catch(() => {})
        }
      })
      audio.addEventListener('loadedmetadata', () => {
        duration.value = audio!.duration
      })
      audio.addEventListener('ended', () => {
        if (isLooping.value) {
          setTime(0)
          resume()
        } else {
          next()
        }
      })
      audio.addEventListener('durationchange', () => {
        duration.value = audio!.duration
      })
      audio.addEventListener('error', () => {
        // ignore audio errors
      })
    }
    return audio
  }

  async function play(beat: Beat): Promise<boolean> {
    const a = getAudio()
    const authStore = useAuthStore()

    if (!authStore.isAuthenticated) {
      const hasPermission = await checkGuestPermission()
      if (!hasPermission) {
        showLimitPrompt.value = true
        return false
      }
      await recordGuestPlay(beat.id)
    }

    isPreviewMode.value = !authStore.canFullPreview

    if (currentBeat.value?.id === beat.id) {
      if (isPlaying.value) {
        pause()
      } else {
        resume()
      }
      return true
    }

    currentBeat.value = beat
    reportedBeatId = null
    // 强制重新加载，避免之前的预览 metadata 导致 Range 416 错误
    // 使用 URL 加随机数绕过 HTTP 缓存
    const url = getStreamUrlWithDevice(beat.id) + (getStreamUrlWithDevice(beat.id).includes('?') ? '&' : '?') + 't=' + Date.now()
    a.src = ''
    await new Promise<void>((resolve) => {
      const onLoaded = () => {
        a.removeEventListener('loadedmetadata', onLoaded)
        resolve()
      }
      a.addEventListener('loadedmetadata', onLoaded)
      a.src = url
      a.load()
    })
    
    // 添加错误处理
    try {
      await a.play()
      isPlaying.value = true
    } catch (err: any) {
      isPlaying.value = false
      if (err?.message?.includes('403') || err?.message?.includes('请先登录')) {
        showLimitPrompt.value = true
      }
    }

    if (!playlist.value.find(b => b.id === beat.id)) {
      playlist.value.push(beat)
    }
    return true
  }

  function close() {
    pause()
    if (audio) {
      audio.src = ''
    }
    currentBeat.value = null
    reportedBeatId = null
    isLooping.value = false
    isStopped.value = false
    loopStart.value = null
    loopEnd.value = null
    isSettingLoopStart.value = false
    isSettingLoopEnd.value = false
  }

  function pause() {
    const a = getAudio()
    a.pause()
    isPlaying.value = false
  }

  function resume() {
    const a = getAudio()
    a.play().then(() => {
      isPlaying.value = true
      isStopped.value = false
    }).catch(() => {
      isPlaying.value = false
    })
  }

  function setTime(t: number) {
    const a = getAudio()
    a.currentTime = t
    currentTime.value = t
  }

  function setVolume(v: number) {
    volume.value = v
    const a = getAudio()
    a.volume = v
  }

  function next() {
    if (!currentBeat.value || playlist.value.length === 0) return
    const idx = playlist.value.findIndex(b => b.id === currentBeat.value!.id)
    const nextIdx = (idx + 1) % playlist.value.length
    const nextBeat = playlist.value[nextIdx]
    if (nextBeat.id !== currentBeat.value.id) {
      play(nextBeat)
    } else {
      pause()
    }
  }

  function prev() {
    if (!currentBeat.value || playlist.value.length === 0) return
    const a = getAudio()
    // If more than 3 seconds in, restart current track
    if (a.currentTime > 3) {
      setTime(0)
      return
    }
    const idx = playlist.value.findIndex(b => b.id === currentBeat.value!.id)
    const prevIdx = (idx - 1 + playlist.value.length) % playlist.value.length
    play(playlist.value[prevIdx])
  }

  watch(volume, (v) => {
    if (audio) audio.volume = v
  })

  function dismissVipPrompt() {
    showVipPrompt.value = false
  }

  function clearPlaylist() {
    playlist.value = []
    remainingFreeCount.value = Infinity
  }

  function toggleLoop() {
    isLooping.value = !isLooping.value
  }

  function stop() {
    pause()
    setTime(0)
    isStopped.value = true
  }

  function setLoopStart() {
    if (loopStart.value !== null && loopEnd.value === null) {
      if (currentTime.value > loopStart.value) {
        loopEnd.value = currentTime.value
        isSettingLoopEnd.value = false
      }
    } else {
      loopStart.value = currentTime.value
      loopEnd.value = null
      isSettingLoopStart.value = true
      isSettingLoopEnd.value = false
    }
  }

  function setLoopEnd() {
    if (loopStart.value !== null && loopEnd.value === null) {
      if (currentTime.value > loopStart.value) {
        loopEnd.value = currentTime.value
        isSettingLoopEnd.value = false
      }
    } else {
      clearLoop()
    }
  }

  function clearLoop() {
    loopStart.value = null
    loopEnd.value = null
    isSettingLoopStart.value = false
    isSettingLoopEnd.value = false
  }

  // 初始化时获取试听状态
  async function initPreviewStatus() {
    if (isInitialized.value) return
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) {
      remainingFreeCount.value = Infinity
      isInitialized.value = true
      return
    }
    
    try {
      const result = await checkPreviewPermission()
      remainingFreeCount.value = result.remaining ?? FREE_PREVIEW_LIMIT
    } catch {
      remainingFreeCount.value = FREE_PREVIEW_LIMIT
    }
    isInitialized.value = true
  }

  // 启动初始化
  initPreviewStatus()

  return {
    currentBeat,
    isPlaying,
    currentTime,
    duration,
    volume,
    playlist,
    showVipPrompt,
    showLimitPrompt,
    isPreviewMode,
    canPlayPreview,
    getRemainingFreeCount,
    play,
    close,
    pause,
    resume,
    setTime,
    setVolume,
    next,
    prev,
    dismissVipPrompt,
    dismissLimitPrompt,
    clearPreview,
    clearPlaylist,
    initPreviewStatus,
    isLooping,
    isStopped,
    loopStart,
    loopEnd,
    isSettingLoopStart,
    isSettingLoopEnd,
    toggleLoop,
    stop,
    setLoopStart,
    setLoopEnd,
    clearLoop,
  }
})
