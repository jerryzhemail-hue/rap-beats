<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { fetchBeats } from '@/api/beats'
import { deleteBeat, updateBeat, clearDemoBeats } from '@/api/admin'
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
}>({ id: 0, title: '', producer: '', bpm: null, key: '', genre: '', is_free: false })
const editLoading = ref(false)

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
  editForm.value = {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm,
    key: beat.key,
    genre: beat.genre,
    is_free: !!beat.is_free
  }
  editVisible.value = true
}

function closeEdit() {
  editVisible.value = false
}

async function saveEdit() {
  editLoading.value = true
  try {
    await updateBeat(editForm.value.id, {
      title: editForm.value.title,
      producer: editForm.value.producer,
      bpm: editForm.value.bpm,
      key: editForm.value.key,
      genre: editForm.value.genre,
      is_free: editForm.value.is_free ? 1 : 0
    })
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
</style>
