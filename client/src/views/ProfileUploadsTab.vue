<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BeatCard from '@/components/BeatCard.vue'
import { fetchMyUploads, updateMyBeat, deleteMyBeat, uploadMyBeatCover } from '@/api/user'
import {
  defaultGenreCategoryValue,
  defaultGenreValue,
  genreCategoryOptions,
  getGenreCategoryValueByGenre,
  getGenreChildrenByCategory,
  normalizeGenreValue
} from '@/constants/genres'
import type { Beat } from '@/types'
import { resolveCoverUrl } from '@/utils/assets'

const authStore = useAuthStore()
const BPM_MIN = 40
const BPM_MAX = 240

// uploads
const uploads = ref<Beat[]>([])
const uploadsTotal = ref(0)
const uploadsPage = ref(1)
const uploadsTotalPages = ref(1)
const uploadsLoading = ref(false)
const uploadActionSuccess = ref('')
const uploadActionError = ref('')
const uploadEditVisible = ref(false)
const uploadEditLoading = ref(false)
const uploadEditGenreCategory = ref(defaultGenreCategoryValue)
const uploadEditCoverFile = ref<File | null>(null)
const uploadEditCoverPreview = ref('')
const uploadEditForm = ref({
  id: 0,
  title: '',
  producer: '',
  bpm: undefined as number | undefined,
  genre: defaultGenreValue,
  tags: '',
  is_free: false
})


const uploadGenreChildOptions = computed(() => getGenreChildrenByCategory(uploadEditGenreCategory.value))

function isValidBpmValue(value: number | undefined) {
  return Number.isInteger(value) && value !== undefined && value >= BPM_MIN && value <= BPM_MAX
}

function normalizeTags(tags: Beat['tags'] | string | null | undefined) {
  if (!tags) return ''
  if (Array.isArray(tags)) return tags.join(', ')
  return String(tags)
}

function clearUploadEditCoverPreview() {
  if (uploadEditCoverPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(uploadEditCoverPreview.value)
  }
  uploadEditCoverPreview.value = ''
}

function setUploadEditCoverPreview(value: string) {
  clearUploadEditCoverPreview()
  uploadEditCoverPreview.value = value
}

function handleUploadEditCoverSelect(file: File) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowed.includes(ext)) {
    uploadActionError.value = '封面仅支持 jpg、png、webp 格式'
    return
  }

  uploadEditCoverFile.value = file
  uploadActionError.value = ''
  setUploadEditCoverPreview(URL.createObjectURL(file))
}

function onUploadEditCoverChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleUploadEditCoverSelect(file)
}

async function loadUploads() {
  uploadsLoading.value = true
  try {
    const data: any = await fetchMyUploads(uploadsPage.value)
    uploads.value = data.beats || []
    uploadsTotal.value = data.total || 0
    uploadsTotalPages.value = data.totalPages || 1
  } catch {
    uploads.value = []
  } finally {
    uploadsLoading.value = false
  }
}

function openUploadEdit(beat: Beat) {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''
  const normalizedGenre = normalizeGenreValue(beat.genre)
  uploadEditGenreCategory.value = getGenreCategoryValueByGenre(normalizedGenre)
  uploadEditCoverFile.value = null
  setUploadEditCoverPreview(resolveCoverUrl(beat.cover_image))
  uploadEditForm.value = {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm || undefined,
    genre: normalizedGenre,
    tags: normalizeTags(beat.tags as any),
    is_free: !!beat.is_free
  }
  uploadEditVisible.value = true
}

function closeUploadEdit() {
  uploadEditVisible.value = false
  uploadEditCoverFile.value = null
  clearUploadEditCoverPreview()
}

function onUploadEditGenreCategoryChange() {
  const firstChild = getGenreChildrenByCategory(uploadEditGenreCategory.value)[0]
  uploadEditForm.value.genre = firstChild?.value || defaultGenreValue
}

async function saveUploadEdit() {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''

  if (!uploadEditForm.value.title.trim() || !uploadEditForm.value.producer.trim() || !uploadEditForm.value.genre.trim()) {
    uploadActionError.value = '请完整填写标题、制作人和风格'
    return
  }

  if (!isValidBpmValue(uploadEditForm.value.bpm)) {
    uploadActionError.value = `请填写 ${BPM_MIN}-${BPM_MAX} 之间的整数 BPM`
    return
  }

  uploadEditLoading.value = true
  try {
    let nextCoverImage: string | undefined
    if (uploadEditCoverFile.value) {
      const uploadedCover = await uploadMyBeatCover(uploadEditForm.value.id, uploadEditCoverFile.value)
      nextCoverImage = uploadedCover.stored_value
    }

    await updateMyBeat(uploadEditForm.value.id, {
      title: uploadEditForm.value.title.trim(),
      producer: uploadEditForm.value.producer.trim(),
      bpm: Number(uploadEditForm.value.bpm),
      genre: uploadEditForm.value.genre.trim(),
      tags: uploadEditForm.value.tags.trim(),
      cover_image: nextCoverImage,
      is_free: uploadEditForm.value.is_free ? 1 : 0
    })
    uploadActionSuccess.value = '伴奏信息已更新'
    uploadEditVisible.value = false
    await loadUploads()
  } catch (err: any) {
    uploadActionError.value = err.message || '保存失败，请稍后重试'
  } finally {
    uploadEditLoading.value = false
  }
}

async function removeUploadedBeat(beat: Beat) {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''

  if (!window.confirm(`确定删除伴奏“${beat.title}”吗？删除后将无法恢复。`)) {
    return
  }

  try {
    await deleteMyBeat(beat.id)
    uploadActionSuccess.value = '伴奏已删除'

    if (uploads.value.length === 1 && uploadsPage.value > 1) {
      uploadsPage.value -= 1
    } else {
      await loadUploads()
    }
  } catch (err: any) {
    uploadActionError.value = err.message || '删除失败，请稍后重试'
  }
}

watch(uploadsPage, loadUploads)
onMounted(() => { if (authStore.isAdmin) loadUploads() })
</script>

<template>
    <div class="tab-content">
      <div v-if="uploadActionSuccess" class="success-msg uploads-msg">{{ uploadActionSuccess }}</div>
      <div v-if="uploadActionError" class="error-msg uploads-msg">{{ uploadActionError }}</div>
      <div v-if="uploadsLoading" class="loading-state">加载中...</div>
      <div v-else-if="uploads.length === 0" class="empty-state">
        <span class="empty-icon">&#9835;</span>
        <p>还没有上传伴奏</p>
      </div>
      <div v-else>
        <div class="beats-grid uploads-manage-grid">
          <div v-for="beat in uploads" :key="beat.id" class="upload-manage-item">
            <BeatCard :beat="beat" />
            <div class="upload-manage-actions">
              <button type="button" class="manage-btn" @click="openUploadEdit(beat)">编辑信息</button>
              <button type="button" class="manage-btn manage-btn-danger" @click="removeUploadedBeat(beat)">删除伴奏</button>
            </div>
          </div>
        </div>
        <div v-if="uploadsTotalPages > 1" class="pagination">
          <button class="page-btn" :disabled="uploadsPage <= 1" @click="uploadsPage--">上一页</button>
          <span class="page-info">{{ uploadsPage }} / {{ uploadsTotalPages }}</span>
          <button class="page-btn" :disabled="uploadsPage >= uploadsTotalPages" @click="uploadsPage++">下一页</button>
        </div>
      </div>
    </div>


    <Teleport to="body">
      <div v-if="uploadEditVisible" class="upload-edit-modal" @click.self="closeUploadEdit">
        <div class="upload-edit-card">
          <h3 class="upload-edit-title">编辑伴奏信息</h3>
          <div class="upload-edit-form">
            <div class="form-group">
              <label class="form-label">伴奏封面</label>
              <div class="upload-cover-panel">
                <div v-if="uploadEditCoverPreview" class="upload-cover-preview">
                  <img :src="uploadEditCoverPreview" alt="伴奏封面预览" />
                </div>
                <div v-else class="upload-cover-placeholder">暂无封面</div>
                <div class="upload-cover-actions">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    class="upload-cover-input"
                    @change="onUploadEditCoverChange"
                  />
                  <p class="upload-cover-hint">支持 jpg / png / webp，保存后会替换当前伴奏图片。</p>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">标题</label>
              <input v-model="uploadEditForm.title" type="text" class="form-input" placeholder="输入伴奏标题" />
            </div>
            <div class="form-group">
              <label class="form-label">制作人</label>
              <input v-model="uploadEditForm.producer" type="text" class="form-input" placeholder="输入制作人名称" />
            </div>
            <div class="form-group">
              <label class="form-label">一级风格</label>
              <select v-model="uploadEditGenreCategory" class="form-input" @change="onUploadEditGenreCategoryChange">
                <option v-for="category in genreCategoryOptions" :key="category.value" :value="category.value">
                  {{ category.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">二级风格</label>
              <select v-model="uploadEditForm.genre" class="form-input">
                <option v-for="genre in uploadGenreChildOptions" :key="genre.value" :value="genre.value">
                  {{ genre.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">BPM</label>
              <input v-model.number="uploadEditForm.bpm" type="number" :min="BPM_MIN" :max="BPM_MAX" class="form-input" placeholder="例如 140" />
            </div>
            <div class="form-group">
              <label class="form-label">标签</label>
              <input v-model="uploadEditForm.tags" type="text" class="form-input" placeholder="例如 trap, dark, freestyle" />
            </div>
            <label class="upload-free-toggle">
              <input v-model="uploadEditForm.is_free" type="checkbox" />
              <span>设为免费伴奏</span>
            </label>
          </div>
          <div class="upload-edit-actions">
            <button type="button" class="manage-btn" :disabled="uploadEditLoading" @click="closeUploadEdit">取消</button>
            <button type="button" class="btn btn-primary" :disabled="uploadEditLoading" @click="saveUploadEdit">
              <span v-if="uploadEditLoading" class="spinner"></span>
              <span v-else>保存修改</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
</template>
