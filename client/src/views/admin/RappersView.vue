<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchRappers, createRapper, updateRapper, deleteRapper, exportRappersCSV, importRappers, recalculateRapperWeights, fetchRapperStats, type RapperItem } from '@/api/rappers'
import { request } from '@/api/request'

const rappers = ref<RapperItem[]>([])
const loading = ref(true)
const saving = ref(false)
const recalculating = ref(false)
const statsVisible = ref(false)
const rapperStats = ref<any[]>([])
const statsWeights = ref<Record<string, number>>({})

// Create modal state
const createVisible = ref(false)
const createForm = ref({
  name: '',
  avatar_url: '',
  bio: '',
  sort_order: 0
})

// Edit modal state
const editVisible = ref(false)
const editForm = ref({
  id: 0,
  name: '',
  avatar_url: '',
  bio: '',
  sort_order: 0
})

// Avatar upload state
const avatarInputRef = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)
const currentUploadForm = ref<'create' | 'edit' | null>(null)

async function uploadAvatar(file: File, formType: 'create' | 'edit') {
  currentUploadForm.value = formType
  uploadingAvatar.value = true
  
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    
    const result = await request<{ avatar_url: string }>('/api/rappers/upload-avatar', {
      method: 'POST',
      body: formData as any,
      headers: {
        // 让浏览器自动设置 Content-Type 为 multipart/form-data
      }
    })
    
    if (formType === 'create') {
      createForm.value.avatar_url = result.avatar_url
    } else {
      editForm.value.avatar_url = result.avatar_url
    }
  } catch (err: any) {
    alert(err.message || '上传头像失败')
  } finally {
    uploadingAvatar.value = false
    currentUploadForm.value = null
    avatarInputRef.value && (avatarInputRef.value.value = '')
  }
}

function triggerAvatarUpload(formType: 'create' | 'edit') {
  currentUploadForm.value = formType
  avatarInputRef.value?.click()
}

function handleAvatarFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !currentUploadForm.value) return
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    alert('不支持的图片格式，请上传 jpg/png/webp/gif')
    return
  }
  
  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过 5MB')
    return
  }
  
  uploadAvatar(file, currentUploadForm.value)
}

function removeAvatar(formType: 'create' | 'edit') {
  if (formType === 'create') {
    createForm.value.avatar_url = ''
  } else {
    editForm.value.avatar_url = ''
  }
}

// Confirm dialog state
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => Promise<void>) | null>(null)

async function loadRappers() {
  loading.value = true
  try {
    rappers.value = await fetchRappers()
  } catch (err) {
    console.error('Failed to load rappers:', err)
  } finally {
    loading.value = false
  }
}

async function loadRapperStats() {
  try {
    const data = await fetchRapperStats()
    rapperStats.value = data.stats
    statsWeights.value = data.weights
    statsVisible.value = true
  } catch (err) {
    console.error('Failed to load rapper stats:', err)
    alert('加载统计数据失败')
  }
}

async function handleRecalculate() {
  if (!confirm('确定要重新计算所有 rapper 的权重吗？\n\n这将根据歌曲数量、播放量、下载量、收藏量自动更新排名。')) {
    return
  }
  
  recalculating.value = true
  try {
    const result = await recalculateRapperWeights()
    alert(result.message)
    await loadRappers()
    await loadRapperStats()
  } catch (err: any) {
    console.error('Failed to recalculate:', err)
    alert(err.message || '重新计算失败')
  } finally {
    recalculating.value = false
  }
}

onMounted(loadRappers)

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

function openCreate() {
  createForm.value = { name: '', avatar_url: '', bio: '', sort_order: 0 }
  createVisible.value = true
}

function closeCreate() {
  createVisible.value = false
}

async function submitCreate() {
  if (!createForm.value.name.trim()) {
    alert('请输入名称')
    return
  }
  saving.value = true
  try {
    await createRapper({
      name: createForm.value.name.trim(),
      avatar_url: createForm.value.avatar_url.trim() || undefined,
      bio: createForm.value.bio.trim() || undefined,
      sort_order: createForm.value.sort_order
    })
    closeCreate()
    await loadRappers()
  } catch (err: any) {
    alert(err.message || '创建失败')
  } finally {
    saving.value = false
  }
}

function openEdit(rapper: RapperItem) {
  editForm.value = {
    id: rapper.id,
    name: rapper.name,
    avatar_url: rapper.avatar_url || '',
    bio: rapper.bio || '',
    sort_order: rapper.sort_order
  }
  editVisible.value = true
}

function closeEdit() {
  editVisible.value = false
}

async function submitEdit() {
  if (!editForm.value.name.trim()) {
    alert('请输入名称')
    return
  }
  saving.value = true
  try {
    await updateRapper(editForm.value.id, {
      name: editForm.value.name.trim(),
      avatar_url: editForm.value.avatar_url.trim() || undefined,
      bio: editForm.value.bio.trim() || undefined,
      sort_order: editForm.value.sort_order
    })
    closeEdit()
    await loadRappers()
  } catch (err: any) {
    alert(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleDelete(rapper: RapperItem) {
  showConfirm(
    '删除 Rapper',
    `确定删除「${rapper.name}」吗？删除后，该 rapper 关联的 ${rapper.count} 首伴奏将保留原 rapper 字段值，但不再关联到此 rapper。`,
    async () => {
      try {
        await deleteRapper(rapper.id)
        await loadRappers()
      } catch (err: any) {
        alert(err.message || '删除失败')
      }
    }
  )
}

// Import/Export
const importLoading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function handleExport() {
  exportRappersCSV()
}

function handleImportClick() {
  fileInput.value?.click()
}

function parseCSV(text: string): Array<{ name: string; avatar_url?: string; bio?: string; sort_order?: number }> {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  
  const rappers: Array<{ name: string; avatar_url?: string; bio?: string; sort_order?: number }> = []
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // Simple CSV parsing (handle quoted values)
    const values: string[] = []
    let current = ''
    let inQuotes = false
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    
    // Expected: name, avatar_url, bio, sort_order
    if (values[0]) {
      rappers.push({
        name: values[0].replace(/^"|"$/g, '').replace(/""/g, '"'),
        avatar_url: values[1] ? values[1].replace(/^"|"$/g, '').replace(/""/g, '"') : undefined,
        bio: values[2] ? values[2].replace(/^"|"$/g, '').replace(/""/g, '"') : undefined,
        sort_order: values[3] ? parseInt(values[3]) || 0 : undefined
      })
    }
  }
  
  return rappers
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  importLoading.value = true
  try {
    const text = await file.text()
    const rappers = parseCSV(text)
    
    if (rappers.length === 0) {
      alert('CSV 文件为空或格式不正确')
      return
    }
    
    const result = await importRappers(rappers)
    
    let message = `导入完成：成功 ${result.success} 个，跳过 ${result.skipped} 个（已存在）`
    if (result.errors.length > 0) {
      message += `\n错误：\n${result.errors.join('\n')}`
    }
    
    alert(message)
    await loadRappers()
  } catch (err: any) {
    alert(err.message || '导入失败')
  } finally {
    importLoading.value = false
    target.value = '' // Reset file input
  }
}
</script>

<template>
  <div class="rappers-admin">
    <!-- Header -->
    <div class="page-header">
      <div class="header-info">
        <p class="header-tip">管理 Rapper 歌手分类，关联后可在伴奏库筛选</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" :disabled="recalculating" @click="loadRapperStats">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          {{ statsVisible ? '隐藏统计' : '查看统计' }}
        </button>
        <button class="btn btn-primary" :disabled="recalculating" @click="handleRecalculate">
          <svg v-if="recalculating" class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {{ recalculating ? '计算中...' : '重新计算权重' }}
        </button>
        <button class="btn btn-outline" :disabled="loading" @click="handleExport">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          导出 CSV
        </button>
        <button class="btn btn-outline" :disabled="importLoading" @click="handleImportClick">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {{ importLoading ? '导入中...' : '导入 CSV' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".csv"
          style="display: none"
          @change="handleFileChange"
        />
        <input
          ref="avatarInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style="display: none"
          @change="handleAvatarFileChange"
        />
        <button class="btn btn-primary" @click="openCreate">
          <span>+</span> 新增 Rapper
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Empty -->
    <div v-else-if="rappers.length === 0" class="empty-state">
      <p>暂无 Rapper，点击上方按钮添加</p>
    </div>

    <!-- Table -->
    <div v-else class="rapper-table-wrapper">
      <table class="rapper-table">
        <thead>
          <tr>
            <th style="width: 60px">排序</th>
            <th style="width: 80px">头像</th>
            <th>名称</th>
            <th>简介</th>
            <th style="width: 100px">关联伴奏</th>
            <th style="width: 120px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rapper in rappers" :key="rapper.id">
            <td class="sort-cell">{{ rapper.sort_order }}</td>
            <td class="avatar-cell">
              <div class="rapper-avatar">
                <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
                <span v-else class="avatar-placeholder">{{ rapper.name.charAt(0) }}</span>
              </div>
            </td>
            <td class="name-cell">
              <span class="rapper-name">{{ rapper.name }}</span>
            </td>
            <td class="bio-cell">
              <span class="rapper-bio">{{ rapper.bio || '-' }}</span>
            </td>
            <td class="count-cell">
              <span class="beat-count">{{ rapper.count }}</span>
            </td>
            <td class="actions-cell">
              <button class="action-btn edit" @click="openEdit(rapper)">编辑</button>
              <button class="action-btn delete" @click="handleDelete(rapper)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Stats Panel -->
    <div v-if="statsVisible" class="stats-panel">
      <div class="stats-header">
        <h3>Rapper 综合排名统计</h3>
        <button class="modal-close" @click="statsVisible = false">&times;</button>
      </div>
      <div class="stats-weights">
        <p class="stats-title">权重配置：</p>
        <div class="weight-tags">
          <span class="weight-tag">歌曲数 × {{ statsWeights.beat_count || 100 }}</span>
          <span class="weight-tag">播放量 × {{ statsWeights.play_count || 1 }}</span>
          <span class="weight-tag">下载量 × {{ statsWeights.download_count || 10 }}</span>
          <span class="weight-tag">收藏量 × {{ statsWeights.favorite_count || 20 }}</span>
        </div>
      </div>
      <table class="stats-table">
        <thead>
          <tr>
            <th>排名</th>
            <th>Rapper</th>
            <th>歌曲数</th>
            <th>播放量</th>
            <th>下载量</th>
            <th>收藏量</th>
            <th>综合得分</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(stat, index) in rapperStats" :key="stat.id">
            <td class="rank-cell">{{ index + 1 }}</td>
            <td class="name-cell">{{ stat.name }}</td>
            <td>{{ stat.beat_count }}</td>
            <td>{{ stat.play_count }}</td>
            <td>{{ stat.download_count }}</td>
            <td>{{ stat.favorite_count }}</td>
            <td class="score-cell">{{ stat.score }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="createVisible" class="modal-overlay" @click.self="closeCreate">
      <div class="modal">
        <div class="modal-header">
          <h3>新增 Rapper</h3>
          <button class="modal-close" @click="closeCreate">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input
              v-model="createForm.name"
              type="text"
              placeholder="输入 rapper 名称"
              maxlength="100"
            />
          </div>
          <div class="form-group">
            <label>头像</label>
            <div class="avatar-upload">
              <div class="avatar-preview" @click="triggerAvatarUpload('create')">
                <img v-if="createForm.avatar_url" :src="createForm.avatar_url" alt="头像预览" />
                <div v-else class="avatar-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>点击上传</span>
                </div>
                <div v-if="uploadingAvatar && currentUploadForm === 'create'" class="avatar-uploading">
                  <div class="spinner-small"></div>
                </div>
              </div>
              <div class="avatar-actions">
                <button type="button" class="btn btn-sm btn-outline" @click="triggerAvatarUpload('create')" :disabled="uploadingAvatar">
                  {{ uploadingAvatar && currentUploadForm === 'create' ? '上传中...' : '上传图片' }}
                </button>
                <button v-if="createForm.avatar_url" type="button" class="btn btn-sm btn-danger-outline" @click="removeAvatar('create')">
                  移除
                </button>
              </div>
            </div>
            <p class="form-hint">支持 jpg/png/webp/gif，最大 5MB</p>
          </div>
          <div class="form-group">
            <label>简介</label>
            <textarea
              v-model="createForm.bio"
              placeholder="简短描述（可选）"
              rows="3"
              maxlength="500"
            ></textarea>
          </div>
          <div class="form-group">
            <label>排序权重</label>
            <input
              v-model.number="createForm.sort_order"
              type="number"
              placeholder="数字越小越靠前"
            />
            <p class="form-hint">数字越小排列越靠前，默认为 0</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeCreate">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="submitCreate">
            {{ saving ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editVisible" class="modal-overlay" @click.self="closeEdit">
      <div class="modal">
        <div class="modal-header">
          <h3>编辑 Rapper</h3>
          <button class="modal-close" @click="closeEdit">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input
              v-model="editForm.name"
              type="text"
              placeholder="输入 rapper 名称"
              maxlength="100"
            />
            <p class="form-hint warning">注意：修改名称会同步更新所有关联伴奏的 rapper 字段</p>
          </div>
          <div class="form-group">
            <label>头像</label>
            <div class="avatar-upload">
              <div class="avatar-preview" @click="triggerAvatarUpload('edit')">
                <img v-if="editForm.avatar_url" :src="editForm.avatar_url" alt="头像预览" />
                <div v-else class="avatar-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>点击上传</span>
                </div>
                <div v-if="uploadingAvatar && currentUploadForm === 'edit'" class="avatar-uploading">
                  <div class="spinner-small"></div>
                </div>
              </div>
              <div class="avatar-actions">
                <button type="button" class="btn btn-sm btn-outline" @click="triggerAvatarUpload('edit')" :disabled="uploadingAvatar">
                  {{ uploadingAvatar && currentUploadForm === 'edit' ? '上传中...' : '上传图片' }}
                </button>
                <button v-if="editForm.avatar_url" type="button" class="btn btn-sm btn-danger-outline" @click="removeAvatar('edit')">
                  移除
                </button>
              </div>
            </div>
            <p class="form-hint">支持 jpg/png/webp/gif，最大 5MB</p>
          </div>
          <div class="form-group">
            <label>简介</label>
            <textarea
              v-model="editForm.bio"
              placeholder="简短描述（可选）"
              rows="3"
              maxlength="500"
            ></textarea>
          </div>
          <div class="form-group">
            <label>排序权重</label>
            <input
              v-model.number="editForm.sort_order"
              type="number"
              placeholder="数字越小越靠前"
            />
            <p class="form-hint">数字越小排列越靠前</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeEdit">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="submitEdit">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <div v-if="confirmVisible" class="modal-overlay" @click.self="closeConfirm">
      <div class="modal confirm-modal">
        <div class="modal-header">
          <h3>{{ confirmTitle }}</h3>
          <button class="modal-close" @click="closeConfirm">&times;</button>
        </div>
        <div class="modal-body">
          <p class="confirm-message">{{ confirmMessage }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeConfirm">取消</button>
          <button class="btn btn-danger" @click="executeConfirm">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rappers-admin {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-info {
  flex: 1;
  min-width: 200px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.header-tip {
  color: #8b8ba7;
  font-size: 13px;
  margin-top: 4px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #8b8ba7;
  gap: 12px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #1e1e3a;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #8b8ba7;
}

.rapper-table-wrapper {
  background: #1a1a2e;
  border-radius: 12px;
  overflow: hidden;
}

.rapper-table {
  width: 100%;
  border-collapse: collapse;
}

.rapper-table th {
  text-align: left;
  padding: 14px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #8b8ba7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #13132a;
  border-bottom: 1px solid #1e1e3a;
}

.rapper-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #1e1e3a;
  vertical-align: middle;
}

.rapper-table tr:last-child td {
  border-bottom: none;
}

.rapper-table tr:hover td {
  background: #1e1e38;
}

.sort-cell {
  color: #8b8ba7;
  font-size: 13px;
  font-family: monospace;
}

.avatar-cell {
  text-align: center;
}

.rapper-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: #6366f1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.rapper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 16px;
  font-weight: 700;
  color: white;
}

.name-cell .rapper-name {
  font-weight: 600;
  color: #fff;
  font-size: 14px;
}

.bio-cell .rapper-bio {
  color: #8b8ba7;
  font-size: 13px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.count-cell {
  text-align: center;
}

.beat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  padding: 4px 10px;
  background: #6366f1;
  color: #fff;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.action-btn.edit {
  background: #1e1e3a;
  color: #a5a5c0;
}

.action-btn.edit:hover {
  background: #2a2a4a;
  color: #fff;
}

.action-btn.delete {
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
}

.action-btn.delete:hover {
  background: #ef4444;
  color: #fff;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: #1a1a2e;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #1e1e3a;
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #8b8ba7;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #1e1e3a;
  color: #fff;
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #1e1e3a;
  background: #13132a;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #e0e0f0;
}

.required {
  color: #ef4444;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  background: #13132a;
  color: #fff;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #6366f1;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #8b8ba7;
}

.form-hint.warning {
  color: #f59e0b;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn svg {
  flex-shrink: 0;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #6366f1;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #5558e3;
}

.btn-outline {
  background: transparent;
  color: #a5a5c0;
  border: 1px solid #2a2a4a;
}

.btn-outline:hover:not(:disabled) {
  border-color: #6366f1;
  color: #6366f1;
}

.btn-secondary {
  background: #2a2a4a;
  color: #a5a5c0;
  border: 1px solid #2a2a4a;
}

.btn-secondary:hover:not(:disabled) {
  background: #3a3a5a;
  color: #fff;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

/* Confirm Modal */
.confirm-modal .modal-body {
  padding: 32px 24px;
}

.confirm-message {
  text-align: center;
  color: #e0e0f0;
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
}

/* Avatar Upload */
.avatar-upload {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: 12px;
  overflow: hidden;
  background: #13132a;
  border: 2px dashed #2a2a4a;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.avatar-preview:hover {
  border-color: #6366f1;
  background: #1e1e3a;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #8b8ba7;
}

.avatar-placeholder svg {
  opacity: 0.6;
}

.avatar-placeholder span {
  font-size: 11px;
}

.avatar-uploading {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.spinner-small {
  width: 24px;
  height: 24px;
  border: 2px solid #2a2a4a;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-danger-outline {
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
}

.btn-danger-outline:hover:not(:disabled) {
  background: #ef4444;
  color: #fff;
}

/* Stats Panel */
.stats-panel {
  margin-top: 24px;
  background: #13132a;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  overflow: hidden;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1a35;
  border-bottom: 1px solid #2a2a4a;
}

.stats-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.stats-weights {
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a4a;
}

.stats-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: #8b8ba7;
}

.weight-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.weight-tag {
  padding: 4px 10px;
  background: #2a2a4a;
  border-radius: 4px;
  font-size: 12px;
  color: #a5a5c0;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
}

.stats-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #8b8ba7;
  background: #1a1a35;
  border-bottom: 1px solid #2a2a4a;
}

.stats-table td {
  padding: 12px 16px;
  font-size: 14px;
  color: #e0e0f0;
  border-bottom: 1px solid #1e1e3a;
}

.stats-table tr:last-child td {
  border-bottom: none;
}

.stats-table tr:hover td {
  background: #1e1e38;
}

.rank-cell {
  font-weight: 600;
  color: #6366f1;
}

.score-cell {
  font-weight: 600;
  color: #10b981;
}
</style>
