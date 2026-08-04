<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'
import { uploadBeatDirectly, detectBpmFromFile } from '@/api/upload'
import { fetchRapperNames } from '@/api/rappers'
import {
  defaultGenreCategoryValue,
  defaultGenreValue,
  genreCategoryOptions,
  getGenreCategoryValueByGenre,
  getGenreChildrenByCategory
} from '@/constants/genres'

const authStore = useAuthStore()
const BPM_MIN = 40
const BPM_MAX = 240

// Form fields
const title = ref('')
const producer = ref(authStore.user?.username || '')
const genreCategory = ref(defaultGenreCategoryValue)
const genre = ref(defaultGenreValue)
const selectedRappers = ref<string[]>([])
const bpm = ref<number | undefined>(undefined)
const bpmConfidence = ref<number | null>(null)
const musicKey = ref('')
const tags = ref('')
const duration = ref<number>(0)
const isFree = ref(false)

// Rappers 多选上限
const MAX_RAPPERS = 5
const MAX_RAPPERS_REACHED = computed(() => selectedRappers.value.length >= MAX_RAPPERS)

// Files
const audioFile = ref<File | null>(null)
const coverFile = ref<File | null>(null)
const coverPreview = ref<string | null>(null)

// Drag states
const audioDragOver = ref(false)
const coverDragOver = ref(false)

// Upload state
const uploading = ref(false)
const uploadProgress = ref(0)
const detectingBpm = ref(false)
const bpmDetectProgress = ref(0)
const errorMessage = ref('')
const successMessage = ref('')

// Rappers list
const rappers = ref<string[]>([])
const loadingRappers = ref(false)

// Rappers dropdown state
const rapperInputMode = ref<'select' | 'custom'>('select')
const customRapperName = ref('')

onMounted(async () => {
  loadingRappers.value = true
  try {
    rappers.value = await fetchRapperNames()
  } catch (err) {
    console.error('Failed to load rappers:', err)
  } finally {
    loadingRappers.value = false
  }
})

function onRapperSelect(event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value

  if (value === '__create_new__') {
    rapperInputMode.value = 'custom'
    return
  }

  if (!value) return

  // 已选择则跳过
  if (selectedRappers.value.includes(value)) {
    select.value = ''
    return
  }

  // 超过上限
  if (selectedRappers.value.length >= MAX_RAPPERS) {
    alert(`最多只能选择 ${MAX_RAPPERS} 个 Rapper`)
    select.value = ''
    return
  }

  selectedRappers.value.push(value)
  select.value = ''
}

function removeRapper(name: string) {
  selectedRappers.value = selectedRappers.value.filter(r => r !== name)
}

function confirmCustomRapper() {
  const name = customRapperName.value.trim()
  if (!name) return

  if (selectedRappers.value.length >= MAX_RAPPERS) {
    alert(`最多只能选择 ${MAX_RAPPERS} 个 Rapper`)
    return
  }

  if (selectedRappers.value.includes(name)) {
    customRapperName.value = ''
    rapperInputMode.value = 'select'
    return
  }

  selectedRappers.value.push(name)
  customRapperName.value = ''
  rapperInputMode.value = 'select'
}

function switchToSelectMode() {
  rapperInputMode.value = 'select'
  customRapperName.value = ''
}

const genreChildOptions = computed(() => getGenreChildrenByCategory(genreCategory.value))
const isBpmValid = computed(() => {
  const value = Number(bpm.value)
  return Number.isInteger(value) && value >= BPM_MIN && value <= BPM_MAX
})

function syncGenreSelection(rawGenre?: string | null) {
  genreCategory.value = getGenreCategoryValueByGenre(rawGenre)
  const children = getGenreChildrenByCategory(genreCategory.value)
  const matched = children.find((child) => child.value === rawGenre)
  genre.value = matched?.value || children[0]?.value || defaultGenreValue
}

function onGenreCategoryChange() {
  const firstChild = getGenreChildrenByCategory(genreCategory.value)[0]
  genre.value = firstChild?.value || ''
}

syncGenreSelection(defaultGenreValue)

const canSubmit = computed(() => {
  // 制作人：填写了，或选择了 2 个及以上 rapper 时可留空
  const hasProducer = !!producer.value || selectedRappers.value.length >= 2
  return audioFile.value
    && title.value
    && hasProducer
    && genre.value
    && isBpmValid.value
    && musicKey.value.trim()
    && !uploading.value
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handleAudioSelect(file: File) {
  const allowed = ['.mp3', '.wav', '.flac', '.m4a', '.ogg']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowed.includes(ext)) {
    errorMessage.value = '不支持的音频格式，请上传 mp3/wav/flac/m4a/ogg'
    return
  }
  audioFile.value = file
  errorMessage.value = ''

  // Auto-detect duration
  const audio = new Audio()
  audio.src = URL.createObjectURL(file)
  audio.addEventListener('loadedmetadata', () => {
    duration.value = Math.round(audio.duration)
    URL.revokeObjectURL(audio.src)
  })
}

function handleCoverSelect(file: File) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowed.includes(ext)) {
    errorMessage.value = '不支持的图片格式，请上传 jpg/png/webp'
    return
  }
  coverFile.value = file
  errorMessage.value = ''

  // Preview
  const reader = new FileReader()
  reader.onload = (e) => {
    coverPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

function onAudioDrop(e: DragEvent) {
  audioDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) handleAudioSelect(file)
}

function onCoverDrop(e: DragEvent) {
  coverDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) handleCoverSelect(file)
}

function onAudioInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleAudioSelect(file)
}

function onCoverInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleCoverSelect(file)
}

function removeAudio() {
  audioFile.value = null
  duration.value = 0
  bpm.value = undefined
  musicKey.value = ''
}

async function handleDetectBpm() {
  if (!audioFile.value) return
  detectingBpm.value = true
  bpmDetectProgress.value = 0
  try {
    const result = await detectBpmFromFile(audioFile.value, (p) => {
      bpmDetectProgress.value = p
    })
    bpm.value = Math.round(result.bpm)
    bpmConfidence.value = result.confidence ?? null
    if (result.key) {
      musicKey.value = result.key
    }
    if (result.duration > 0 && !duration.value) {
      duration.value = result.duration
    }
  } catch (err: any) {
    errorMessage.value = err.message || '识别失败'
  } finally {
    detectingBpm.value = false
  }
}

function removeCover() {
  coverFile.value = null
  coverPreview.value = null
}

async function submitUpload() {
  if (!audioFile.value || !title.value) return

  // 制作人：填写了，或选择了 2 个及以上 rapper 时可留空
  const hasProducer = !!producer.value || selectedRappers.value.length >= 2
  if (!hasProducer) {
    errorMessage.value = '请填写制作人名称，或至少选择 2 位 Rapper'
    return
  }

  if (!isBpmValid.value) {
    errorMessage.value = `请填写 ${BPM_MIN}-${BPM_MAX} 之间的整数 BPM`
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await uploadBeatDirectly({
      title: title.value,
      producer: producer.value,
      rapper: selectedRappers.value.length > 0 ? selectedRappers.value.join(' & ') : undefined,
      genre: genre.value,
      bpm: Number(bpm.value),
      key: musicKey.value,
      tags: tags.value,
      is_free: isFree.value,
      duration: duration.value,
      audioFile: audioFile.value,
      coverFile: coverFile.value
    }, (progress) => {
      uploadProgress.value = progress
    })

    uploading.value = false
    successMessage.value = '上传成功！'
    setTimeout(() => {
      router.push('/')
    }, 1500)
  } catch (err: any) {
    uploading.value = false
    errorMessage.value = err.message || '上传失败'
  }
}
</script>

<template>
  <div class="upload-page">
    <div class="upload-container">
      <h1 class="upload-title">上传伴奏</h1>

      <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>
      <div v-if="successMessage" class="success-msg">{{ successMessage }}</div>

      <div class="upload-layout">
        <!-- File Upload Area -->
        <div class="upload-files">
          <!-- Audio upload -->
          <div class="upload-section">
            <label class="section-label">音频文件 <span class="required">*</span></label>
            <div
              class="drop-zone"
              :class="{ 'drag-over': audioDragOver, 'has-file': audioFile }"
              @dragover.prevent="audioDragOver = true"
              @dragleave="audioDragOver = false"
              @drop.prevent="onAudioDrop"
              @click="($refs.audioInput as HTMLInputElement)?.click()"
            >
              <input
                ref="audioInput"
                type="file"
                accept=".mp3,.wav,.flac,.m4a,.ogg"
                class="hidden-input"
                @change="onAudioInputChange"
              />
              <template v-if="!audioFile">
                <div class="drop-icon">&#9835;</div>
                <p class="drop-text">拖拽音频文件到这里，或点击选择</p>
                <p class="drop-hint">支持 mp3 / wav / flac / m4a / ogg</p>
              </template>
              <template v-else>
                <div class="file-info">
                  <span class="file-name">{{ audioFile.name }}</span>
                  <span class="file-size">{{ formatFileSize(audioFile.size) }}</span>
                </div>
                <button class="remove-btn" @click.stop="removeAudio">移除</button>
              </template>
            </div>
          </div>

          <!-- Cover upload -->
          <div class="upload-section">
            <label class="section-label">封面图片 <span class="optional">（可选，不上传将自动生成）</span></label>
            <div
              class="drop-zone cover-zone"
              :class="{ 'drag-over': coverDragOver, 'has-file': coverFile }"
              @dragover.prevent="coverDragOver = true"
              @dragleave="coverDragOver = false"
              @drop.prevent="onCoverDrop"
              @click="($refs.coverInput as HTMLInputElement)?.click()"
            >
              <input
                ref="coverInput"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                class="hidden-input"
                @change="onCoverInputChange"
              />
              <template v-if="!coverPreview">
                <div class="drop-icon">&#128247;</div>
                <p class="drop-text">拖拽封面图片到这里，或点击选择</p>
                <p class="drop-hint">支持 jpg / png / webp</p>
              </template>
              <template v-else>
                <img :src="coverPreview" class="cover-preview" alt="封面预览" />
                <button class="remove-btn" @click.stop="removeCover">移除</button>
              </template>
            </div>
          </div>
        </div>

        <!-- Info Form Area -->
        <div class="upload-info">
          <div class="form-group">
            <label>标题 <span class="required">*</span></label>
            <input v-model="title" type="text" placeholder="伴奏标题" />
          </div>

          <div class="form-group">
            <label>
              制作人
              <span v-if="selectedRappers.length < 2" class="required">*</span>
              <span v-else class="optional">（选填，2+ Rapper 时可留空）</span>
            </label>
            <input v-model="producer" type="text" placeholder="制作人名称" />
          </div>

          <div class="form-group">
            <label>
              Rapper
              <span class="optional">（可选，最多 {{ MAX_RAPPERS }} 个）</span>
            </label>

            <!-- 已选择的 Rapper 标签 -->
            <div v-if="selectedRappers.length > 0" class="rapper-chips">
              <span v-for="name in selectedRappers" :key="name" class="rapper-chip">
                {{ name }}
                <button type="button" class="chip-remove" @click="removeRapper(name)" :aria-label="`移除 ${name}`">×</button>
              </span>
            </div>

            <!-- Select mode -->
            <div v-if="rapperInputMode === 'select'" class="rapper-select-wrapper">
              <select :disabled="loadingRappers || MAX_RAPPERS_REACHED" @change="onRapperSelect">
                <option value="">
                  {{ MAX_RAPPERS_REACHED ? `已达上限（${MAX_RAPPERS}个）` : '选择 Rapper...' }}
                </option>
                <option
                  v-for="r in rappers.filter(name => !selectedRappers.includes(name))"
                  :key="r"
                  :value="r"
                >{{ r }}</option>
                <option v-if="!MAX_RAPPERS_REACHED" value="__create_new__">➕ 新增 Rapper...</option>
              </select>
            </div>

            <!-- Custom input mode -->
            <div v-else class="rapper-custom-input">
              <div class="custom-input-row">
                <input
                  v-model="customRapperName"
                  type="text"
                  placeholder="输入新 rapper 名称"
                  @keyup.enter="confirmCustomRapper"
                />
                <button type="button" class="btn-confirm-custom" @click="confirmCustomRapper">添加</button>
                <button type="button" class="btn-cancel-custom" @click="switchToSelectMode">
                  取消
                </button>
              </div>
              <p class="field-hint">新 rapper 将在提交时自动添加到数据库</p>
            </div>

            <p v-if="loadingRappers" class="field-hint">加载中...</p>
            <p v-else-if="selectedRappers.length > 0" class="field-hint">
              已选择 {{ selectedRappers.length }} / {{ MAX_RAPPERS }}
            </p>
          </div>

          <div class="form-group">
            <label>一级风格 <span class="required">*</span></label>
            <select v-model="genreCategory" @change="onGenreCategoryChange">
              <option v-for="category in genreCategoryOptions" :key="category.value" :value="category.value">
                {{ category.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>二级风格 <span class="required">*</span></label>
            <select v-model="genre">
              <option v-for="child in genreChildOptions" :key="child.value" :value="child.value">
                {{ child.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>BPM <span class="required">*</span></label>
            <div class="bpm-input-row">
              <input v-model.number="bpm" type="number" :min="BPM_MIN" :max="BPM_MAX" placeholder="例如 140" />
              <button
                type="button"
                class="btn-detect-bpm"
                :disabled="!audioFile || detectingBpm"
                @click="handleDetectBpm"
              >
                <template v-if="detectingBpm">识别中 {{ bpmDetectProgress }}%</template>
                <template v-else>自动识别</template>
              </button>
            </div>
            <p v-if="bpmConfidence !== null" class="field-hint" :class="{ 'hint-warn': bpmConfidence < 0.4 }">
              自动识别置信度 {{ Math.round(bpmConfidence * 100) }}%
              <template v-if="bpmConfidence < 0.4">—— 较低，建议手动核对</template>
            </p>
            <p class="field-hint">请输入 {{ BPM_MIN }}-{{ BPM_MAX }} 之间的整数，或点击自动识别。</p>
          </div>

          <div class="form-group">
            <label>调性</label>
            <input v-model="musicKey" type="text" placeholder="如 C major、F# minor" />
            <p class="field-hint">点击「自动识别」从音频自动获取调性</p>
          </div>

          <div class="form-group">
            <label>标签 <span class="optional">（可选，逗号分隔）</span></label>
            <input v-model="tags" type="text" placeholder="如: dark, melodic, hard" />
          </div>

          <div class="form-group">
            <label>时长（秒） <span class="optional">（可选，自动检测）</span></label>
            <input v-model.number="duration" type="number" min="0" placeholder="自动检测" />
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="isFree" type="checkbox" />
              <span>免费下载</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="uploading" class="progress-bar-container">
        <div class="progress-bar" :style="{ width: uploadProgress + '%' }"></div>
        <span class="progress-text">{{ uploadProgress }}%</span>
      </div>

      <!-- Submit -->
      <button
        class="btn btn-primary submit-btn"
        :disabled="!canSubmit"
        @click="submitUpload"
      >
        <template v-if="uploading">上传中...</template>
        <template v-else>上传伴奏</template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.upload-page {
  min-height: calc(100vh - 64px);
  padding: 48px 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.upload-container {
  width: 100%;
  max-width: 900px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 40px;
}

.upload-title {
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 32px;
  text-align: center;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
  font-size: 14px;
}

.success-msg {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
  font-size: 14px;
}

.upload-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 32px;
}

@media (max-width: 720px) {
  .upload-layout {
    grid-template-columns: 1fr;
  }

  .upload-container {
    padding: 24px;
  }
}

/* File upload sections */
.upload-files {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.required {
  color: #f87171;
}

.optional {
  color: var(--text-secondary);
  font-weight: 400;
}

.drop-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--accent);
  background: var(--accent-light);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: var(--accent);
}

.hidden-input {
  display: none;
}

.drop-icon {
  font-size: 32px;
  color: var(--accent);
}

.drop-text {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
}

.drop-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
}

.file-size {
  font-size: 12px;
  color: var(--text-secondary);
}

.remove-btn {
  font-size: 12px;
  color: #f87171;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  transition: background 0.2s;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.cover-zone {
  min-height: 160px;
}

.cover-preview {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

/* Form area */
.upload-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--accent);
}

.form-group select {
  cursor: pointer;
}

.form-group select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

/* Rappers custom input */
.rapper-select-wrapper select {
  width: 100%;
}

.rapper-custom-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-input-row {
  display: flex;
  gap: 8px;
}

.custom-input-row input {
  flex: 1;
}

.btn-cancel-custom {
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel-custom:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-confirm-custom {
  padding: 10px 16px;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm-custom:hover {
  background: var(--accent-hover, #6d28d9);
}

/* 已选择的 Rapper 标签 */
.rapper-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.rapper-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 12px;
  background: rgba(124, 58, 237, 0.15);
  border: 1px solid rgba(124, 58, 237, 0.4);
  border-radius: 999px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: rgba(124, 58, 237, 0.25);
  color: var(--accent);
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.chip-remove:hover {
  background: var(--accent);
  color: #fff;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group.half {
  flex: 1;
}

.bpm-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.bpm-input-row input {
  flex: 1;
}

.btn-detect-bpm {
  padding: 8px 14px;
  background: rgba(124, 58, 237, 0.15);
  border: 1px solid rgba(124, 58, 237, 0.4);
  border-radius: var(--radius-sm);
  color: #a78bfa;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  min-width: 90px;
}

.btn-detect-bpm:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.25);
  border-color: #7c3aed;
  color: #c4b5fd;
}

.btn-detect-bpm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.checkbox-group {
  flex-direction: row;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Progress bar */
.progress-bar-container {
  position: relative;
  background: var(--bg-card);
  border-radius: 8px;
  height: 28px;
  margin-bottom: 20px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 8px;
  transition: width 0.2s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Submit button */
.submit-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.field-hint.hint-warn {
  color: var(--danger, #e5484d);
  font-weight: 500;
}
</style>
