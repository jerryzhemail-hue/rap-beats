<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { fetchBeats } from '@/api/beats'
import { deleteBeat, updateBeat, clearDemoBeats } from '@/api/admin'
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from '@/api/directUpload'
import { resolveCoverUrl } from '@/utils/assets'
import type { Beat } from '@/types'

const beats = ref<Beat[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const search = ref('')
const loading = ref(true)

// Edit modal state
const editVisible = ref(false)
const editForm = ref<{
  id: number
  title: string
  producer: string
  bpm: number | null
  key: string
  genre: string
  is_free: boolean
  cover_image: string | null
}>({ id: 0, title: '', producer: '', bpm: null, key: '', genre: '', is_free: false, cover_image: null })
const editLoading = ref(false)

// Cover upload state (within edit modal)
const coverFile = ref<File | null>(null)
const coverPreview = ref<string | null>(null)
const coverUploading = ref(false)
const coverProgress = ref(0)
const coverUploadError = ref('')
const coverDragOver = ref(false)
const coverFileInput = ref<HTMLInputElement | null>(null)

// 当前编辑行在 beats 列表里的引用，用于保存后实时刷新卡片封面预览
let editingBeat: Beat | null = null

// 现有封面预览（来自 beat 列表 / 后端返回的 URL）
const currentCoverUrl = computed(() => {
  // 优先显示用户新选的本地预览
  if (coverPreview.value) return coverPreview.value
  if (editForm.value.cover_image) return resolveCoverUrl(editForm.value.cover_image)
  return ''
})

const hasCoverSelected = computed(() => !!coverPreview.value || !!editForm.value.cover_image)

// Confirm dialog state
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => Promise<void>) | null>(null)

async function loadBeats() {
  loading.value = true
  try {
    const data = await fetchBeats({ page: page.value, limit: 20, search: search.value || undefined })
    beats.value = data.beats
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (err) {
    console.error('Failed to load beats:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadBeats)

watch(page, loadBeats)

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadBeats()
  }, 300)
})

function showConfirm(title: string, message: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmAction.value = action
  confirmVisible.value = true
}

function closeConfirm() {
  confirmVisible.value = false
  confirmAction.value = null
}

async function executeConfirm() {
  if (confirmAction.value) {
    await confirmAction.value()
  }
  closeConfirm()
}

function openEdit(beat: Beat) {
  editingBeat = beat
  editForm.value = {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm,
    key: beat.key,
    genre: beat.genre,
    is_free: !!beat.is_free,
    cover_image: beat.cover_image ?? null
  }
  // 每次打开弹框重置本地选图状态
  coverFile.value = null
  coverPreview.value = null
  coverUploadError.value = ''
  coverProgress.value = 0
  editVisible.value = true
}

function closeEdit() {
  editVisible.value = false
  editingBeat = null
  coverFile.value = null
  coverPreview.value = null
  coverUploadError.value = ''
  coverProgress.value = 0
}

function handleCoverSelect(file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  const okExt = ['.jpg', '.jpeg', '.png', '.webp'].some((ext) => file.name.toLowerCase().endsWith(ext))
  if (!allowed.includes(file.type) && !okExt) {
    coverUploadError.value = '不支持的图片格式，请上传 jpg/png/webp'
    return
  }
  // 单张封面，5MB 上限（与上传流程保持一致）
  if (file.size > 5 * 1024 * 1024) {
    coverUploadError.value = '封面大小不能超过 5MB'
    return
  }
  coverUploadError.value = ''
  coverFile.value = file

  const reader = new FileReader()
  reader.onload = (e) => {
    coverPreview.value = (e.target?.result as string) || null
  }
  reader.readAsDataURL(file)
}

function onCoverInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleCoverSelect(file)
  // 清空 value 以便重复选同一张图也能触发 change
  input.value = ''
}

function onCoverDrop(e: DragEvent) {
  e.preventDefault()
  coverDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleCoverSelect(file)
}

function onCoverDragOver(e: DragEvent) {
  e.preventDefault()
  coverDragOver.value = true
}

function onCoverDragLeave(e: DragEvent) {
  e.preventDefault()
  coverDragOver.value = false
}

function triggerCoverInput() {
  coverFileInput.value?.click()
}

function removeCover() {
  coverFile.value = null
  coverPreview.value = null
  // 把 cover_image 设为 null 表示清空封面（与 null 区别于 undefined）
  editForm.value.cover_image = null
  coverUploadError.value = ''
}

/**
 * 上传封面到直传通道，返回 cover_image 的 storedValue。
 * 如果没有选择新文件则返回 undefined（保持不变）或 null（清空封面）。
 */
async function uploadCoverIfNeeded(): Promise<string | null | undefined> {
  if (!coverFile.value) {
    // 没有新文件：如果用户点过"移除"，editForm.cover_image 已经是 null；
    // 否则返回 undefined（保持不变）。
    if (editForm.value.cover_image === null && editingBeat && (editingBeat.cover_image ?? null) !== null) {
      return null
    }
    return undefined
  }

  coverUploading.value = true
  coverProgress.value = 0
  try {
    const targets = await requestUploadTarget<{ direct_upload: boolean; cover?: DirectUploadTarget | null }>(
      '/api/beats/upload-targets',
      {
        audio: null,
        cover: {
          name: coverFile.value.name,
          type: coverFile.value.type || 'image/jpeg'
        }
      }
    )

    if (!targets.direct_upload || !targets.cover) {
      throw new Error('直传通道未开启，请联系管理员启用 OSS 直传')
    }

    await uploadFileToTarget(targets.cover, coverFile.value, (p) => {
      coverProgress.value = p
    })

    coverProgress.value = 100
    return targets.cover.storedValue
  } catch (err: any) {
    coverUploadError.value = err?.message || '封面上传失败'
    throw err
  } finally {
    coverUploading.value = false
  }
}

async function saveEdit() {
  editLoading.value = true
  try {
    const newCover = await uploadCoverIfNeeded()

    await updateBeat(editForm.value.id, {
      title: editForm.value.title,
      producer: editForm.value.producer,
      bpm: editForm.value.bpm,
      key: editForm.value.key,
      genre: editForm.value.genre,
      is_free: editForm.value.is_free ? 1 : 0,
      cover_image: newCover === undefined ? undefined : newCover
    })

    // 立即更新本地列表中对应 beat 的封面预览，不依赖列表重新拉取
    if (editingBeat) {
      if (newCover === null) {
        editingBeat.cover_image = null
      } else if (newCover) {
        editingBeat.cover_image = newCover
      }
    }

    closeEdit()
    await loadBeats()
  } catch (err: any) {
    alert(err.message || '保存失败')
  } finally {
    editLoading.value = false
  }
}

async function toggleFree(beat: Beat) {
  try {
    await updateBeat(beat.id, { is_free: beat.is_free ? 0 : 1 })
    beat.is_free = !beat.is_free
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

function handleDelete(beat: Beat) {
  showConfirm(
    '删除伴奏',
    `确定删除伴奏「${beat.title}」吗？此操作不可撤销。`,
    async () => {
      try {
        await deleteBeat(beat.id)
        await loadBeats()
      } catch (err: any) {
        alert(err.message || '删除失败')
      }
    }
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr + 'Z').toLocaleDateString('zh-CN')
}

function handleClearDemoBeats() {
  showConfirm(
    '清空示例伴奏',
    '确定清空当前所有伴奏数据吗？该操作会同时删除关联收藏、评论、下载记录，以及服务器上的音频和封面文件。',
    async () => {
      try {
        await clearDemoBeats()
        page.value = 1
        await loadBeats()
      } catch (err: any) {
        alert(err.message || '清理失败')
      }
    }
  )
}
</script>

<template>
  <div class="beats-view">
    <div class="toolbar">
      <input
        v-model="search"
        type="text"
        class="search-input"
        placeholder="搜索标题或制作人..."
      />
      <button class="btn-sm btn-danger toolbar-btn" @click="handleClearDemoBeats">一键清空示例伴奏</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <template v-else>
      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>ID</th>
              <th>标题</th>
              <th>制作人</th>
              <th>风格</th>
              <th>BPM</th>
              <th>下载量</th>
              <th>免费</th>
              <th>上传时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(beat, index) in beats" :key="beat.id">
              <td>{{ (page - 1) * 20 + index + 1 }}</td>
              <td>{{ beat.id }}</td>
              <td>{{ beat.title }}</td>
              <td>{{ beat.producer }}</td>
              <td>{{ beat.genre }}</td>
              <td>{{ beat.bpm }}</td>
              <td>{{ beat.download_count }}</td>
              <td>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    :checked="!!beat.is_free"
                    @change="toggleFree(beat)"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td>{{ formatDate(beat.created_at) }}</td>
              <td class="actions">
                <button class="btn-sm btn-edit" @click="openEdit(beat)">编辑</button>
                <button class="btn-sm btn-danger" @click="handleDelete(beat)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="page--">上一页</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="page++">下一页</button>
      </div>
    </template>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="editVisible" class="modal-overlay" @click.self="closeEdit">
        <div class="modal-card">
          <h3>编辑伴奏信息</h3>
          <div class="form-grid">
            <div class="form-item">
              <label>标题</label>
              <input v-model="editForm.title" type="text" class="form-input" />
            </div>
            <div class="form-item">
              <label>制作人</label>
              <input v-model="editForm.producer" type="text" class="form-input" />
            </div>
            <div class="form-item">
              <label>BPM</label>
              <input v-model.number="editForm.bpm" type="number" class="form-input" />
            </div>
            <div class="form-item">
              <label>调性</label>
              <input v-model="editForm.key" type="text" class="form-input" />
            </div>
            <div class="form-item">
              <label>风格</label>
              <input v-model="editForm.genre" type="text" class="form-input" />
            </div>
            <div class="form-item">
              <label>免费</label>
              <label class="toggle-switch">
                <input v-model="editForm.is_free" type="checkbox" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="form-item form-item-full">
              <label>封面图片</label>
              <div
                class="cover-uploader"
                :class="{ 'drag-over': coverDragOver, 'has-cover': hasCoverSelected }"
                @dragover="onCoverDragOver"
                @dragleave="onCoverDragLeave"
                @drop="onCoverDrop"
                @click="triggerCoverInput"
              >
                <img v-if="currentCoverUrl" :src="currentCoverUrl" class="cover-preview" alt="封面预览" />
                <div v-else class="cover-placeholder">
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  <p class="cover-hint">点击或拖拽图片到此处上传</p>
                </div>
                <input
                  ref="coverFileInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="cover-file-input"
                  @change="onCoverInputChange"
                />
                <div class="cover-actions">
                  <span class="cover-tip">支持 JPG / PNG / WEBP，最大 5MB</span>
                  <button type="button" class="btn-link" @click.stop="triggerCoverInput">
                    {{ hasCoverSelected ? '更换' : '选择图片' }}
                  </button>
                  <button v-if="hasCoverSelected" type="button" class="btn-link btn-link-danger" @click.stop="removeCover">
                    移除
                  </button>
                </div>
                <div v-if="coverUploading" class="cover-progress">
                  <div class="cover-progress-bar" :style="{ width: coverProgress + '%' }"></div>
                  <span>{{ coverProgress }}%</span>
                </div>
                <p v-if="coverUploadError" class="cover-error">{{ coverUploadError }}</p>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-sm btn-cancel" @click="closeEdit">取消</button>
            <button class="btn-sm btn-confirm" :disabled="editLoading" @click="saveEdit">
              {{ editLoading ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Dialog -->
    <Teleport to="body">
      <div v-if="confirmVisible" class="modal-overlay" @click.self="closeConfirm">
        <div class="modal-card">
          <h3>{{ confirmTitle }}</h3>
          <p>{{ confirmMessage }}</p>
          <div class="modal-actions">
            <button class="btn-sm btn-cancel" @click="closeConfirm">取消</button>
            <button class="btn-sm btn-confirm" @click="executeConfirm">确认</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.beats-view {
  max-width: 1200px;
}

.loading {
  text-align: center;
  color: #a0a0b0;
  padding: 60px 0;
  font-size: 16px;
}

.toolbar {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 320px;
  padding: 10px 16px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: #666;
}

.search-input:focus {
  border-color: #7c3aed;
}

.toolbar-btn {
  padding: 10px 16px;
}

.table-wrapper {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 800px;
}

.admin-table th:first-child,
.admin-table td:first-child {
  font-weight: 700;
  color: #c084fc;
}

.admin-table th {
  text-align: left;
  padding: 12px 16px;
  color: #a0a0b0;
  font-weight: 500;
  border-bottom: 1px solid #2a2a45;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #16162a;
}

.admin-table td {
  padding: 12px 16px;
  color: #e0e0e8;
  border-bottom: 1px solid #1e1e35;
}

.admin-table tbody tr:hover {
  background: rgba(124, 58, 237, 0.05);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-edit {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.btn-edit:hover {
  background: rgba(59, 130, 246, 0.25);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.25);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}

.page-btn {
  padding: 8px 16px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #7c3aed;
  color: #7c3aed;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #a0a0b0;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #2a2a45;
  border-radius: 22px;
  transition: 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: #a0a0b0;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #7c3aed;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
  background: #fff;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: #1e1e38;
  border: 1px solid #2a2a45;
  border-radius: 16px;
  padding: 28px;
  min-width: 440px;
  max-width: 560px;
}

.modal-card h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: #fff;
}

.modal-card p {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: #a0a0b0;
  line-height: 1.6;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item label {
  font-size: 13px;
  color: #a0a0b0;
  font-weight: 500;
}

.form-input {
  padding: 8px 12px;
  background: #141425;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #7c3aed;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  background: #2a2a45;
  color: #a0a0b0;
}

.btn-cancel:hover {
  background: #35355a;
}

.btn-confirm {
  background: #7c3aed;
  color: #fff;
}

.btn-confirm:hover {
  background: #9333ea;
}

/* Cover uploader (inside edit modal) */
.form-item-full {
  grid-column: 1 / -1;
}

.cover-uploader {
  position: relative;
  background: #141425;
  border: 2px dashed #2a2a45;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 140px;
}

.cover-uploader:hover {
  border-color: #7c3aed;
  background: #181830;
}

.cover-uploader.drag-over {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.08);
}

.cover-uploader.has-cover {
  padding: 12px;
}

.cover-file-input {
  display: none;
}

.cover-preview {
  max-width: 100%;
  max-height: 180px;
  border-radius: 6px;
  object-fit: contain;
}

.cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #666;
  padding: 16px 0;
}

.cover-placeholder svg {
  color: #555;
}

.cover-hint {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.cover-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.cover-tip {
  font-size: 12px;
  color: #666;
}

.btn-link {
  background: none;
  border: none;
  color: #7c3aed;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 4px;
}

.btn-link:hover {
  color: #9333ea;
  text-decoration: underline;
}

.btn-link-danger {
  color: #f87171;
}

.btn-link-danger:hover {
  color: #ef4444;
}

.cover-progress {
  width: 100%;
  height: 4px;
  background: #2a2a45;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
}

.cover-progress-bar {
  height: 100%;
  background: #7c3aed;
  transition: width 0.2s;
}

.cover-progress span {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 11px;
  color: #a0a0b0;
}

.cover-error {
  margin: 0;
  font-size: 12px;
  color: #f87171;
  text-align: center;
}
</style>
