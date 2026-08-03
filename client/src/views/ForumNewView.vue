<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { fetchForumCategories, fetchForumTopics, createForumPost, uploadForumImage, uploadForumAudio, fetchAudioBpm, uploadForumVideo, suggestForumTopics, type ForumCategory, type ForumTopic, type TopicSuggestion } from '@/api/forum'
import ForumAuthPrompt from '@/components/ForumAuthPrompt.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

const MAX_IMAGES = 6
const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const SUGGEST_DEBOUNCE = 800
const MAX_VIDEO_SIZE = 30 * 1024 * 1024
const VIDEO_ACCEPT = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm,video/x-m4v'

// 允许上传音频的版块 slug
const AUDIO_CATEGORY_SLUGS = ['creation', 'dj', 'breakdance', 'rap', 'beats', 'newbie']

const router = useRouter()
const authStore = useAuthStore()
const authPromptRef = ref<any>(null)
const categories = ref<ForumCategory[]>([])
const topics = ref<ForumTopic[]>([])
const loading = ref(false)
const submitting = ref(false)
const uploadingCount = ref(0)
const error = ref('')
const success = ref('')
const musicCategoryError = ref('')

const form = ref({
  title: '',
  content: '',
  category_id: 0,
  selectedTopics: [] as number[],
  images: [] as { url: string; uploading?: boolean }[],
  music_file: null as string | null,
  music_file_name: '',
  music_title: '',
  music_artist: '',
  music_genre: '',
  music_bpm: null as number | null,
  music_cover_image: null as string | null,
  allow_download: false,
  video_file: null as string | null,
  video_cover: null as string | null,
  video_duration: null as number | null,
})

// 风格级联选择器
const genreOptions = ref<{ label: string; value: string; children: { label: string; value: string }[] }[]>([])
const selectedGenreCategory = ref('')
const selectedGenreChild = ref('')

const suggestions = ref<TopicSuggestion[]>([])
const suggestLoading = ref(false)
let suggestTimer: ReturnType<typeof setTimeout> | null = null

// 当前 BPM 分析状态：null=未上传, 'analyzing'=分析中, number=已识别
const bpmStatus = ref<number | 'analyzing' | null>(null)

// 风格选择：选择大类后重置子类
watch(selectedGenreCategory, () => {
  selectedGenreChild.value = ''
  form.value.music_genre = ''
})
watch(selectedGenreChild, () => {
  form.value.music_genre = selectedGenreChild.value || form.value.music_genre
})

// 富文本编辑器引用
const richEditorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)
const isDraggingImage = ref(false)
const isDraggingAudio = ref(false)

// 处理拖拽到富文本编辑器的图片（接收文件）
async function handleEditorImageFiles(files: File[]) {
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      error.value = `图片 "${file.name}" 大小超过 2MB`
      continue
    }
    uploadingCount.value++
    try {
      const result = await uploadForumImage(file)
      if (richEditorRef.value) {
        richEditorRef.value.insertImageToContent(result.image_url)
      }
    } catch (err: any) {
      error.value = err.message || '图片上传失败'
    } finally {
      uploadingCount.value--
    }
  }
}

// 图片拖拽到图片上传区
function handleImageDrop(e: DragEvent) {
  e.preventDefault()
  isDraggingImage.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    error.value = '请拖拽图片文件'
    return
  }
  handleFiles(imageFiles)
}

function handleImageDragOver(e: DragEvent) {
  e.preventDefault()
  isDraggingImage.value = true
}

function handleImageDragLeave(e: DragEvent) {
  e.preventDefault()
  isDraggingImage.value = false
}

// 音频拖拽
function handleAudioDrop(e: DragEvent) {
  e.preventDefault()
  isDraggingAudio.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const audioFile = files[0]
  if (!audioFile.type.startsWith('audio/')) {
    error.value = '请拖拽音频文件'
    return
  }
  handleAudioFile(audioFile)
}

function handleAudioDragOver(e: DragEvent) {
  e.preventDefault()
  isDraggingAudio.value = true
}

function handleAudioDragLeave(e: DragEvent) {
  e.preventDefault()
  isDraggingAudio.value = false
}

// emoji picker
const showTitleEmoji = ref(false)

function onTitleEmojiSelect(emoji: string) {
  form.value.title += emoji
  showTitleEmoji.value = false
}

// 富文本编辑器中插入图片
function handleGlobalClick() {
  showTitleEmoji.value = false
}

onMounted(() => document.addEventListener('click', handleGlobalClick))
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  if (bpmPollTimer) clearInterval(bpmPollTimer)
})


onMounted(async () => {
  loading.value = true
  try {
    const [catsData, topicsData] = await Promise.all([
      fetchForumCategories(),
      fetchForumTopics(),
    ])
    categories.value = catsData.categories
    topics.value = topicsData.topics
    if (categories.value.length > 0) {
      form.value.category_id = categories.value[0].id
    }
  } catch (err) {
    error.value = '加载失败，请刷新重试'
  } finally {
    loading.value = false
  }
})

function toggleTopic(id: number) {
  const idx = form.value.selectedTopics.indexOf(id)
  if (idx >= 0) {
    form.value.selectedTopics.splice(idx, 1)
  } else {
    if (form.value.selectedTopics.length >= 3) return
    form.value.selectedTopics.push(id)
  }
}

function applySuggestion(s: TopicSuggestion) {
  if (form.value.selectedTopics.length >= 3) return
  form.value.selectedTopics.push(s.id)
  suggestions.value = suggestions.value.filter(sg => sg.id !== s.id)
}

async function fetchSuggestions() {
  const imageUrls = form.value.images
    .filter(img => !img.uploading && img.url)
    .map(img => img.url)
  const hasContent = form.value.title.trim() || form.value.content.trim() || imageUrls.length > 0 || form.value.music_file
  if (!hasContent) {
    suggestions.value = []
    return
  }
  suggestLoading.value = true
  try {
    const { suggestions: data } = await suggestForumTopics({
      title: form.value.title,
      content: form.value.content,
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
      audio_urls: form.value.music_file ? [form.value.music_file] : undefined,
      category_id: form.value.category_id,
      exclude_ids: form.value.selectedTopics,
    })
    suggestions.value = data
  } catch {
    suggestions.value = []
  } finally {
    suggestLoading.value = false
  }
}

function debouncedSuggest() {
  if (suggestTimer) clearTimeout(suggestTimer)
  suggestTimer = setTimeout(fetchSuggestions, SUGGEST_DEBOUNCE)
}

watch(
  [() => form.value.title, () => form.value.content, () => form.value.images.length, () => form.value.music_file],
  () => { debouncedSuggest() }
)

watch(() => form.value.category_id, () => {
  musicCategoryError.value = ''
})

function openFilePicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp,image/gif'
  input.multiple = true
  input.onchange = (e) => {
    const files = (e.target as HTMLInputElement).files
    if (files) handleFiles(Array.from(files))
  }
  input.click()
}

function handleFiles(files: File[]) {
  const validFiles: File[] = []
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      error.value = `图片 "${file.name}" 大小超过 2MB，请重新选择`
      return
    }
    validFiles.push(file)
  }

  const remaining = MAX_IMAGES - form.value.images.length
  if (validFiles.length > remaining) {
    error.value = `最多只能上传 ${MAX_IMAGES} 张图片，请减少 ${validFiles.length - remaining} 张`
    return
  }

  for (const file of validFiles) {
    const preview = URL.createObjectURL(file)
    const idx = form.value.images.length
    form.value.images.push({ url: preview, uploading: true })
    uploadImage(file, idx)
  }
}

async function uploadImage(file: File, idx: number) {
  uploadingCount.value++
  try {
    const result = await uploadForumImage(file)
    if (form.value.images[idx]) {
      form.value.images[idx].url = result.image_url
      form.value.images[idx].uploading = false
      debouncedSuggest()
    }
  } catch (err: any) {
    error.value = err.message || '图片上传失败，请重试'
    if (form.value.images[idx]) {
      form.value.images.splice(idx, 1)
    }
  } finally {
    uploadingCount.value--
  }
}

function removeImage(index: number) {
  form.value.images.splice(index, 1)
}

const coverInputRef = ref<HTMLInputElement | null>(null)

function openAudioPicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/mpeg,audio/wav,audio/aac,audio/mp4,audio/flac,audio/x-m4a'
  input.onchange = (e) => {
    const files = (e.target as HTMLInputElement).files
    if (files && files[0]) handleAudioFile(files[0])
  }
  input.click()
}

function openCoverPicker() {
  coverInputRef.value?.click()
}

async function handleCoverFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    error.value = '封面图片不能超过 2MB'
    return
  }
  uploadingCount.value++
  try {
    const result = await uploadForumImage(file)
    form.value.music_cover_image = result.image_url
  } catch (err: any) {
    error.value = err.message || '封面上传失败'
  } finally {
    uploadingCount.value--
    if (coverInputRef.value) coverInputRef.value.value = ''
  }
}

async function handleAudioFile(file: File) {
  const MAX_AUDIO_SIZE = 20 * 1024 * 1024
  if (file.size > MAX_AUDIO_SIZE) {
    error.value = '音频文件不能超过 20MB'
    return
  }
  musicCategoryError.value = ''
  form.value.music_file_name = file.name
  // 开始分析 BPM（先标记为 analyzing，元数据 BPM 可能马上就有）
  bpmStatus.value = 'analyzing'
  genreOptions.value = []
  selectedGenreCategory.value = ''
  selectedGenreChild.value = ''
  form.value.music_genre = ''
  uploadingCount.value++
  try {
    const result = await uploadForumAudio(file)
    form.value.music_file = result.audio_url

    // 如果后端告知 BPM 还在后台分析，开启轮询
    if (result.bpm_pending && result.audio_id) {
      pollAudioBpm(result.audio_id)
    } else if (result.bpm) {
      // 元数据直接带 BPM，立即展示
      bpmStatus.value = result.bpm
      form.value.music_bpm = result.bpm
    } else {
      bpmStatus.value = null
      form.value.music_bpm = null
    }

    // 风格选项 + 尝试自动匹配
    if (result.genre_options?.length) {
      genreOptions.value = result.genre_options
      const detectedGenre = result.genre
      if (detectedGenre) {
        // 尝试自动选中匹配的风格
        for (const cat of result.genre_options) {
          const matchedChild = cat.children.find(c => c.value === detectedGenre || c.label === detectedGenre)
          if (matchedChild) {
            selectedGenreCategory.value = cat.value
            selectedGenreChild.value = matchedChild.value
            form.value.music_genre = matchedChild.value
            break
          }
        }
        // 没匹配到就用检测值兜底
        if (!selectedGenreChild.value) {
          form.value.music_genre = detectedGenre
        }
      }
    } else if (result.genre) {
      form.value.music_genre = result.genre
    }

    if (!form.value.music_title) {
      form.value.music_title = file.name.replace(/\.[^.]+$/, '')
    }
    // 无封面时使用默认 SVG
    if (!form.value.music_cover_image) {
      form.value.music_cover_image = getDefaultMusicCover()
    }
    debouncedSuggest()
  } catch (err: any) {
    error.value = err.message || '音频上传失败，请重试'
    form.value.music_file = null
    form.value.music_file_name = ''
    bpmStatus.value = null
  } finally {
    uploadingCount.value--
  }
}

// 轮询 BPM 分析结果
let bpmPollTimer: ReturnType<typeof setInterval> | null = null
function pollAudioBpm(audioId: string) {
  if (bpmPollTimer) {
    clearInterval(bpmPollTimer)
    bpmPollTimer = null
  }
  let attempts = 0
  const MAX_ATTEMPTS = 60  // 最多轮询 60 次（60 秒）
  bpmPollTimer = setInterval(async () => {
    attempts++
    try {
      const result = await fetchAudioBpm(audioId)
      if (result.ready) {
        if (bpmPollTimer) {
          clearInterval(bpmPollTimer)
          bpmPollTimer = null
        }
        if (result.bpm) {
          bpmStatus.value = result.bpm
          form.value.music_bpm = result.bpm
        } else {
          bpmStatus.value = null
          form.value.music_bpm = null
        }
      } else if (attempts >= MAX_ATTEMPTS) {
        if (bpmPollTimer) {
          clearInterval(bpmPollTimer)
          bpmPollTimer = null
        }
        // 超时兜底
        bpmStatus.value = null
      }
    } catch {
      // 网络错误继续轮询
    }
  }, 1000)
}

function getDefaultMusicCover() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<rect fill="#1e1e38" width="200" height="200"/>' +
    '<text fill="#7c3aed" font-size="60" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">&#9835;</text>' +
    '</svg>'
  )
}

// ─── 视频上传 ────────────────────────────────────────────────────────────────

const videoUploading = ref(false)
const isDraggingVideo = ref(false)

function openVideoPicker() {
  if (videoUploading.value || form.value.video_file) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = VIDEO_ACCEPT
  input.onchange = (e) => {
    const files = (e.target as HTMLInputElement).files
    if (files && files[0]) handleVideoFile(files[0])
  }
  input.click()
}

async function handleVideoFile(file: File) {
  error.value = ''
  // 客户端先做大小校验，节省请求
  if (file.size > MAX_VIDEO_SIZE) {
    error.value = `视频大小不能超过 30MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩后再上传`
    return
  }
  videoUploading.value = true
  uploadingCount.value++
  try {
    const result = await uploadForumVideo(file)
    form.value.video_file = result.video_url
    form.value.video_cover = result.video_cover
    form.value.video_duration = result.duration
    debouncedSuggest()
  } catch (err: any) {
    error.value = err.message || '视频上传失败，请重试'
  } finally {
    videoUploading.value = false
    uploadingCount.value--
  }
}

function removeVideo() {
  form.value.video_file = null
  form.value.video_cover = null
  form.value.video_duration = null
}

function handleVideoDrop(e: DragEvent) {
  e.preventDefault()
  isDraggingVideo.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const videoFile = files[0]
  if (!videoFile.type.startsWith('video/')) {
    error.value = '请拖拽视频文件（MP4/MOV/WebM）'
    return
  }
  handleVideoFile(videoFile)
}

function handleVideoDragOver(e: DragEvent) {
  e.preventDefault()
  isDraggingVideo.value = true
}

function handleVideoDragLeave(e: DragEvent) {
  e.preventDefault()
  isDraggingVideo.value = false
}

function formatVideoDuration(seconds: number | null) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function removeAudio() {
  form.value.music_file = null
  form.value.music_file_name = ''
  form.value.music_title = ''
  form.value.music_artist = ''
  form.value.music_genre = ''
  form.value.music_bpm = null
  form.value.music_cover_image = null
  form.value.allow_download = false
  bpmStatus.value = null
  genreOptions.value = []
  selectedGenreCategory.value = ''
  selectedGenreChild.value = ''
  debouncedSuggest()
}

async function handleSubmit() {
  if (!authStore.isAuthenticated) { authPromptRef.value?.requireAuth(); return }
  error.value = ''
  success.value = ''
  musicCategoryError.value = ''

  if (!form.value.title.trim()) { error.value = '请填写标题'; return }
  // 检查内容是否为空（移除纯 HTML 标签后的内容）
  const strippedContent = form.value.content.replace(/<[^>]*>/g, '').trim()
  if (!strippedContent) { error.value = '请填写内容'; return }
  if (!form.value.category_id) { error.value = '请选择分类'; return }
  if (uploadingCount.value > 0) { error.value = '图片正在上传中，请稍候'; return }

  // 如果上传了音频，检查版块是否允许
  if (form.value.music_file) {
    const selectedCat = categories.value.find(c => c.id === form.value.category_id)
    if (!selectedCat || !AUDIO_CATEGORY_SLUGS.includes(selectedCat.slug)) {
      const allowedNames = categories.value
        .filter(c => AUDIO_CATEGORY_SLUGS.includes(c.slug))
        .map(c => c.name)
        .join('、')
      musicCategoryError.value = `请选择「${allowedNames}」版块发布音频内容`
      error.value = musicCategoryError.value
      return
    }
  }

  submitting.value = true
  try {
    const imageUrls = form.value.images.filter(img => !img.uploading).map(img => img.url)
    const data = await createForumPost({
      title: form.value.title.trim(),
      content: form.value.content,
      category_id: form.value.category_id,
      topic_ids: form.value.selectedTopics,
      images: imageUrls,
      music_file: form.value.music_file ?? undefined,
      music_title: form.value.music_title.trim() || undefined,
      music_artist: form.value.music_artist.trim() || undefined,
      music_genre: form.value.music_genre || undefined,
      music_bpm: form.value.music_bpm ?? undefined,
      music_cover_image: form.value.music_cover_image ?? undefined,
      video_url: form.value.video_file ?? undefined,
      video_cover: form.value.video_cover ?? undefined,
      video_duration: form.value.video_duration ?? undefined,
      allow_download: form.value.music_file ? form.value.allow_download : undefined,
    })
    success.value = '发布成功！'
    setTimeout(() => { router.push(`/forum/post/${data.post_id}`) }, 1000)
  } catch (err: any) {
    error.value = err.message || '发布失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

</script>

<template>
  <div class="new-post-page">
    <ForumAuthPrompt ref="authPromptRef" />
    <div class="new-post-container">
      <div class="new-post-header">
        <button class="back-btn" @click="router.back()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h1 class="page-title">发布帖子</h1>
      </div>

      <div v-if="loading" class="loading-state">加载中...</div>

      <form v-else class="post-form" @submit.prevent="handleSubmit">
        <!-- 分类选择 -->
        <div class="form-group">
          <label class="form-label">选择分类 <span class="required">*</span></label>
          <div class="category-grid">
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="cat-chip"
              :class="{ selected: form.category_id === cat.id }"
              @click="form.category_id = cat.id"
            >
              <span>{{ cat.icon }}</span>
              {{ cat.name }}
            </button>
          </div>
        </div>

        <!-- 标题 -->
        <div class="form-group">
          <label class="form-label" for="post-title">标题 <span class="required">*</span></label>
          <input
            id="post-title"
            v-model="form.title"
            type="text"
            class="form-input"
            placeholder="给帖子起个吸引人的标题吧"
            maxlength="100"
          />
          <div class="input-toolbar">
            <button type="button" class="emoji-trigger" @click.stop="showTitleEmoji = !showTitleEmoji">😊 表情</button>
            <div v-if="showTitleEmoji" class="emoji-popover">
              <EmojiPicker @select="onTitleEmojiSelect" />
            </div>
            <span class="char-count">{{ form.title.length }} / 100</span>
          </div>
        </div>

        <!-- 内容 -->
        <div class="form-group">
          <label class="form-label">内容 <span class="required">*</span> <span class="label-hint">（支持拖拽图片到编辑区）</span></label>
          <RichTextEditor
            ref="richEditorRef"
            v-model="form.content"
            placeholder="分享你的创作、想法、故事..."
            @insert-image="handleEditorImageFiles"
          />
        </div>

        <!-- 视频上传 -->
        <div class="form-group">
          <label class="form-label">
            上传视频 <span class="label-hint">（可选，最多 30MB，建议 3 分钟内的短视频，仅支持 MP4/MOV/WebM 格式）</span>
          </label>

          <div v-if="!form.video_file" class="video-upload-zone-wrap">
            <div
              class="video-upload-zone"
              :class="{ 'drag-over': isDraggingVideo, uploading: videoUploading }"
              @click="openVideoPicker"
              @drop="handleVideoDrop"
              @dragover="handleVideoDragOver"
              @dragleave="handleVideoDragLeave"
            >
              <svg v-if="!videoUploading" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              <span v-if="!videoUploading" class="video-upload-title">点击或拖拽上传视频</span>
              <span v-if="!videoUploading" class="video-upload-hint">MP4 / MOV / WebM · ≤ 30MB · 建议 3 分钟内</span>
              <div v-if="videoUploading" class="video-uploading">
                <span class="spinner-sm"></span>
                <span>正在上传视频...</span>
              </div>
            </div>
          </div>

          <div v-else class="video-preview">
            <video
              :src="form.video_file"
              :poster="form.video_cover || ''"
              controls
              preload="metadata"
              class="video-player"
            ></video>
            <div class="video-meta">
              <span v-if="form.video_duration" class="video-duration">⏱ {{ formatVideoDuration(form.video_duration) }}</span>
              <button type="button" class="video-remove-btn" @click="removeVideo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                移除视频
              </button>
            </div>
          </div>
        </div>

        <!-- 图片上传 -->
        <div class="form-group">
          <label class="form-label">上传图片 <span class="label-hint">（最多 6 张，单张不超过 2MB，支持拖拽）</span></label>
          <div
            class="image-uploader"
            :class="{ 'drag-over': isDraggingImage }"
            @drop="handleImageDrop"
            @dragover="handleImageDragOver"
            @dragleave="handleImageDragLeave"
          >
            <div
              v-for="(img, idx) in form.images"
              :key="idx"
              class="image-item"
              :class="{ uploading: img.uploading }"
            >
              <img :src="img.url" alt="预览图" />
              <div v-if="img.uploading" class="upload-overlay">
                <span class="spinner-sm"></span>
              </div>
              <button class="remove-btn" type="button" @click="removeImage(idx)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <button
              v-if="form.images.length < MAX_IMAGES"
              class="add-image-btn"
              type="button"
              @click="openFilePicker"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>添加图片</span>
            </button>
            <div v-if="isDraggingImage" class="drop-hint">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>松开鼠标上传图片</span>
            </div>
          </div>
        </div>

        <!-- 音乐卡片上传 -->
        <div class="form-group">
          <label class="form-label">上传音乐 <span class="label-hint">（上传后自动识别 BPM，风格可手动选择）</span></label>

          <!-- 未上传状态 -->
          <div
            v-if="!form.music_file"
            class="audio-upload-zone"
            :class="{ 'drag-over': isDraggingAudio }"
            @click="openAudioPicker"
            @drop="handleAudioDrop"
            @dragover="handleAudioDragOver"
            @dragleave="handleAudioDragLeave"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <span>{{ isDraggingAudio ? '松开鼠标上传音频' : '点击或拖拽上传 MP3/WAV/FLAC 等音频文件' }}</span>
          </div>

          <!-- 已上传：音乐卡片编辑 -->
          <div v-else class="music-card-editor">
            <div class="music-card-preview">
              <div class="music-cover-wrap">
                <img v-if="form.music_cover_image" :src="form.music_cover_image" class="music-cover-img" alt="封面" />
                <div v-else class="music-cover-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <button class="cover-upload-btn" type="button" @click="openCoverPicker">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </button>
                <!-- 封面上传 input -->
                <input ref="coverInputRef" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="handleCoverFile" />
              </div>
              <div class="music-info">
                <input
                  v-model="form.music_title"
                  type="text"
                  class="music-field music-title-input"
                  placeholder="歌名"
                  maxlength="100"
                />
                <input
                  v-model="form.music_artist"
                  type="text"
                  class="music-field music-artist-input"
                  placeholder="作者"
                  maxlength="50"
                />
                <div class="music-meta-row">
                  <!-- 风格：级联选择器，检测到选项时显示，否则降级为普通输入框 -->
                  <template v-if="genreOptions.length > 0">
                    <select
                      v-model="selectedGenreCategory"
                      class="music-field music-genre-select"
                    >
                      <option value="">选择大类</option>
                      <option v-for="cat in genreOptions" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                    </select>
                    <select
                      v-if="selectedGenreCategory"
                      v-model="selectedGenreChild"
                      class="music-field music-genre-select"
                    >
                      <option value="">选择风格</option>
                      <option
                        v-for="child in (genreOptions.find(c => c.value === selectedGenreCategory)?.children || [])"
                        :key="child.value"
                        :value="child.value"
                      >{{ child.label }}</option>
                    </select>
                  </template>
                  <input
                    v-else
                    v-model="form.music_genre"
                    type="text"
                    class="music-field music-genre-input"
                    placeholder="风格"
                    maxlength="30"
                  />
                  <!-- BPM：分析中显示加载动画，已识别显示只读数值 -->
                  <div v-if="bpmStatus === 'analyzing'" class="music-bpm-badge analyzing">
                    <span class="bpm-spinner"></span>
                    <span>识别中...</span>
                  </div>
                  <div v-else-if="bpmStatus" class="music-bpm-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    {{ bpmStatus }} BPM
                  </div>
                </div>
                <!-- 允许下载开关 -->
                <div class="music-download-row">
                  <label class="download-toggle">
                    <input type="checkbox" v-model="form.allow_download" class="toggle-input" />
                    <span class="toggle-track">
                      <span class="toggle-thumb"></span>
                    </span>
                    <span class="toggle-label">允许其他人免费下载此音频</span>
                  </label>
                </div>
              </div>
              <button class="remove-audio-btn" type="button" @click="removeAudio">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 音频版块错误提示 -->
        <div v-if="musicCategoryError" class="music-cat-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {{ musicCategoryError }}
        </div>

        <!-- 话题标签 -->
        <div class="form-group">
          <label class="form-label">话题标签 <span class="label-hint">（最多选3个）</span></label>
          <div class="topics-wrap">
            <button
              v-for="topic in topics"
              :key="topic.id"
              type="button"
              class="topic-chip"
              :class="{ selected: form.selectedTopics.includes(topic.id) }"
              @click="toggleTopic(topic.id)"
            >
              # {{ topic.name }}
            </button>
          </div>

          <!-- 智能推荐 -->
          <div v-if="suggestions.length > 0 || suggestLoading" class="suggestion-area">
            <div v-if="suggestLoading" class="suggest-loading">
              <span class="spinner-xs"></span>
              <span>智能分析中...</span>
            </div>
            <template v-else>
              <div class="suggest-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                根据内容推荐：
              </div>
              <div class="suggest-tags">
                <button
                  v-for="s in suggestions"
                  :key="s.id"
                  type="button"
                  class="suggest-chip"
                  :title="s.matchedKeywords.join('、')"
                  @click="applySuggestion(s)"
                >
                  + # {{ s.name }}
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- 错误/成功提示 -->
        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="success" class="success-msg">{{ success }}</div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="router.back()">取消</button>
          <button type="submit" class="btn-submit" :disabled="submitting">
            <span v-if="submitting" class="spinner"></span>
            {{ submitting ? '发布中...' : '发布帖子' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.new-post-page {
  min-height: calc(100vh - 120px);
  padding: 24px 16px;
}
.new-post-container {
  max-width: 760px;
  margin: 0 auto;
}
.new-post-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  background: transparent;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}
.back-btn:hover { background: var(--bg-card); color: var(--text-primary); }
.page-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}
.loading-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 60px;
}
.post-form {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.emoji-trigger {
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
  flex-shrink: 0;
}
.emoji-trigger:hover {
  color: var(--accent);
}

.required { color: #ef4444; }
.label-hint { font-weight: 400; font-size: 12px; color: var(--text-secondary); }

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border: 1.5px solid transparent;
}
.cat-chip:hover { color: var(--text-primary); }
.cat-chip.selected {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}

.form-input {
  background: var(--bg-secondary);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus { border-color: var(--accent); }
.form-input::placeholder { color: var(--text-secondary); }
.char-count { font-size: 12px; color: var(--text-secondary); margin-left: auto; }

.form-textarea {
  background: var(--bg-secondary);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.form-textarea:focus { border-color: var(--accent); }
.form-textarea::placeholder { color: var(--text-secondary); }

/* 内容编辑器容器 */
.content-editor-wrapper {
  position: relative;
}

.content-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.toolbar-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.emoji-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
}
.emoji-popover-bottom {
  top: auto;
  bottom: calc(100% + 6px);
}

.topics-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.topic-chip {
  padding: 5px 12px;
  border-radius: 16px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border: 1.5px solid transparent;
}
.topic-chip:hover { color: var(--accent); }
.topic-chip.selected {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}

/* 智能推荐 */
.suggestion-area {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border);
}
.suggest-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.spinner-xs {
  width: 12px;
  height: 12px;
  border: 1.5px solid rgba(124,58,237,0.3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
.suggest-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 8px;
  font-weight: 600;
}
.suggest-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.suggest-chip {
  padding: 4px 10px;
  border-radius: 14px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 12px;
  border: 1px solid var(--accent);
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.suggest-chip:hover {
  background: var(--accent);
  color: #fff;
  transform: scale(1.05);
}

/* 视频上传 */
.video-upload-zone-wrap {
  display: block;
}
.video-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 20px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.video-upload-zone:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.video-upload-zone.drag-over {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}
.video-upload-zone.uploading {
  pointer-events: none;
  opacity: 0.7;
}
.video-upload-title {
  font-size: 14px;
  font-weight: 600;
}
.video-upload-hint {
  font-size: 12px;
  opacity: 0.7;
}
.video-uploading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--accent);
}

.video-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}
.video-player {
  width: 100%;
  max-height: 420px;
  background: #000;
  border-radius: var(--radius-sm);
  display: block;
}
.video-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.video-duration {
  font-size: 13px;
  color: var(--text-secondary);
}
.video-remove-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.video-remove-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

/* 图片上传 */
.image-uploader {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  position: relative;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.image-uploader.drag-over {
  background: var(--accent-light);
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
.drop-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(124, 58, 237, 0.1);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 13px;
  pointer-events: none;
}
.image-item {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1.5px solid var(--border);
  flex-shrink: 0;
}
.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.image-item.uploading img { opacity: 0.6; }
.upload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
}
.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.remove-btn:hover { background: rgba(239,68,68,0.8); }
.add-image-btn {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  font-size: 11px;
}
.add-image-btn:hover { border-color: var(--accent); color: var(--accent); }

/* 音乐卡片上传 */
.audio-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.audio-upload-zone:hover { border-color: var(--accent); color: var(--accent); }
.audio-upload-zone.drag-over {
  border-color: var(--accent);
  border-style: dashed;
  background: var(--accent-light);
  color: var(--accent);
}

.music-card-editor {
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  overflow: hidden;
}
.music-card-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  position: relative;
}
.music-cover-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
}
.music-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}
.music-cover-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  background: linear-gradient(135deg, #252540, #1a1a30);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.cover-upload-btn {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.7);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.cover-upload-btn:hover { background: var(--accent); }
.music-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.music-field {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  width: 100%;
}
.music-field::placeholder { color: var(--text-secondary); }
.music-title-input {
  font-size: 15px;
  font-weight: 700;
}
.music-artist-input {
  font-size: 13px;
  color: var(--text-secondary);
}
.music-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.music-genre-input {
  font-size: 12px;
  background: var(--bg-primary);
  border-radius: 10px;
  padding: 2px 8px;
  color: var(--accent);
}
.music-bpm-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-light);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.music-bpm-badge.analyzing {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.15);
}
.bpm-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(167, 139, 250, 0.3);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: bpm-spin 0.8s linear infinite;
}
@keyframes bpm-spin {
  to { transform: rotate(360deg); }
}
.music-genre-select {
  background: #2a2a45;
  color: #e0e0f0;
  border: 1px solid #3a3a55;
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 12px;
  min-width: 90px;
  max-width: 120px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}
.music-genre-select:focus {
  border-color: var(--accent);
}
.music-genre-select option {
  background: #1a1a30;
  color: #e0e0f0;
}
.remove-audio-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239,68,68,0.1);
  color: #ef4444;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.remove-audio-btn:hover { background: rgba(239,68,68,0.2); }

.music-download-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
}
.download-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.toggle-input { display: none; }
.toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--border);
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-input:checked + .toggle-track {
  background: var(--accent);
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
}
.toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

.music-cat-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ef4444;
  font-size: 13px;
  margin-top: 6px;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.success-msg {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}
.btn-cancel {
  padding: 10px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.btn-cancel:hover { border-color: var(--text-secondary); color: var(--text-primary); }
.btn-submit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 28px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  border: none;
}
.btn-submit:hover:not(:disabled) { background: var(--accent-hover); }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
