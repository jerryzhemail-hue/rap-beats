<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createBanner, deleteBanner, fetchAdminBanners, reorderBanners, updateBanner, uploadBannerImage } from '@/api/banners'
import type { Banner } from '@/types'

type BannerForm = {
  id: number | null
  name: string
  image_url: string
  image_value: string
  link_url: string
  sort_order: number
  is_active: boolean
  overlay_opacity: number
  display_duration: number
}

const banners = ref<Banner[]>([])
const loading = ref(true)
const editVisible = ref(false)
const saving = ref(false)
const uploading = ref(false)
const sorting = ref(false)
const dragBannerId = ref<number | null>(null)

const form = ref<BannerForm>(createEmptyForm())

async function loadBanners() {
  loading.value = true
  try {
    const data = await fetchAdminBanners()
    banners.value = data.banners
  } catch (error) {
    console.error('Failed to load banners:', error)
  } finally {
    loading.value = false
  }
}

function createEmptyForm(): BannerForm {
  return {
    id: null,
    name: '',
    image_url: '',
    image_value: '',
    link_url: '',
    sort_order: 0,
    is_active: true,
    overlay_opacity: 45,
    display_duration: 5
  }
}

function openCreate() {
  form.value = createEmptyForm()
  editVisible.value = true
}

function openEdit(banner: Banner) {
  form.value = {
    id: banner.id,
    name: banner.name,
    image_url: banner.image_url,
    image_value: banner.image_value || '',
    link_url: banner.link_url || '',
    sort_order: banner.sort_order,
    is_active: banner.is_active,
    overlay_opacity: banner.overlay_opacity,
    display_duration: banner.display_duration
  }
  editVisible.value = true
}

function closeEdit() {
  if (saving.value || uploading.value) return
  editVisible.value = false
}

async function handleImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  try {
    const result = await uploadBannerImage(file)
    form.value.image_url = result.image_url
    form.value.image_value = result.stored_value
  } catch (error: any) {
    alert(error.message || '图片上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function saveBanner() {
  if (!form.value.name.trim()) {
    alert('请填写 Banner 名称')
    return
  }

  if (!form.value.image_value) {
    alert('请先上传 Banner 背景图')
    return
  }

  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      image_url: form.value.image_value,
      link_url: form.value.link_url.trim() || null,
      sort_order: form.value.sort_order,
      is_active: form.value.is_active,
      overlay_opacity: form.value.overlay_opacity,
      display_duration: form.value.display_duration
    }

    if (form.value.id) {
      await updateBanner(form.value.id, payload)
    } else {
      await createBanner(payload)
    }

    editVisible.value = false
    await loadBanners()
  } catch (error: any) {
    alert(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(banner: Banner) {
  const confirmed = window.confirm(`确定删除 Banner「${banner.name}」吗？删除后背景图也会一起清理。`)
  if (!confirmed) return

  try {
    await deleteBanner(banner.id)
    await loadBanners()
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

async function persistBannerOrder() {
  sorting.value = true
  try {
    const nextItems = banners.value.map((banner, index) => ({
      id: banner.id,
      sort_order: index
    }))
    await reorderBanners(nextItems)
    banners.value = banners.value.map((banner, index) => ({
      ...banner,
      sort_order: index
    }))
  } catch (error: any) {
    alert(error.message || '排序保存失败')
    await loadBanners()
  } finally {
    sorting.value = false
  }
}

function handleDragStart(bannerId: number) {
  dragBannerId.value = bannerId
}

function handleDragEnd() {
  dragBannerId.value = null
}

async function handleDrop(targetBannerId: number) {
  const sourceId = dragBannerId.value
  dragBannerId.value = null

  if (!sourceId || sourceId === targetBannerId || sorting.value) return

  const sourceIndex = banners.value.findIndex((item) => item.id === sourceId)
  const targetIndex = banners.value.findIndex((item) => item.id === targetBannerId)
  if (sourceIndex === -1 || targetIndex === -1) return

  const next = [...banners.value]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  banners.value = next
  await persistBannerOrder()
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

onMounted(loadBanners)
</script>

<template>
  <div class="banners-view">
    <div class="toolbar">
      <div class="toolbar-copy">
        <h2>首页 Banner 背景管理</h2>
        <p>上传背景图并配置轮播顺序、遮罩强度、自动播放时长，首页标题和搜索框会保持原来的前景位置。列表支持拖拽排序。</p>
      </div>
      <button class="btn-primary" @click="openCreate">新增 Banner</button>
    </div>
    <div v-if="sorting" class="sorting-tip">正在保存排序...</div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>预览</th>
            <th>名称</th>
            <th>排序</th>
            <th>时长</th>
            <th>遮罩</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="banners.length === 0">
            <td colspan="8" class="empty-cell">暂无 Banner，首页将继续展示默认渐变背景。</td>
          </tr>
          <tr
            v-for="banner in banners"
            :key="banner.id"
            class="draggable-row"
            :class="{ dragging: dragBannerId === banner.id }"
            draggable="true"
            @dragstart="handleDragStart(banner.id)"
            @dragend="handleDragEnd"
            @dragover.prevent
            @drop.prevent="handleDrop(banner.id)"
          >
            <td>
              <div class="drag-cell">
                <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                <img :src="banner.image_url" :alt="banner.name" class="banner-thumb" />
              </div>
            </td>
            <td>
              <div class="banner-name">{{ banner.name }}</div>
              <div v-if="banner.link_url" class="banner-link">{{ banner.link_url }}</div>
            </td>
            <td>{{ banner.sort_order }}</td>
            <td>{{ banner.display_duration }}s</td>
            <td>{{ banner.overlay_opacity }}%</td>
            <td>
              <span class="status-badge" :class="{ active: banner.is_active }">
                {{ banner.is_active ? '启用中' : '已停用' }}
              </span>
            </td>
            <td>{{ formatDate(banner.updated_at) }}</td>
            <td class="actions">
              <button class="btn-sm btn-edit" @click="openEdit(banner)">编辑</button>
              <button class="btn-sm btn-danger" @click="handleDelete(banner)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="editVisible" class="modal-overlay" @click.self="closeEdit">
        <div class="modal-card">
          <div class="modal-header">
            <h3>{{ form.id ? '编辑 Banner' : '新增 Banner' }}</h3>
            <button class="modal-close" @click="closeEdit">×</button>
          </div>

          <div class="form-grid">
            <div class="form-item form-span-2">
              <label>Banner 名称</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="例如：首页主视觉 1" />
            </div>

            <div class="form-item form-span-2">
              <label>背景图</label>
              <div class="upload-box">
                <div v-if="form.image_url" class="image-preview">
                  <img :src="form.image_url" :alt="form.name || 'banner-preview'" />
                </div>
                <label class="upload-trigger">
                  <input type="file" accept="image/png,image/jpeg,image/webp" @change="handleImageChange" />
                  {{ uploading ? '上传中...' : '上传 Banner 图片' }}
                </label>
                <p class="field-tip">建议上传横版高清图，首页将按 680px 高度全屏裁切展示。</p>
              </div>
            </div>

            <div class="form-item">
              <label>排序</label>
              <input v-model.number="form.sort_order" type="number" min="0" max="999" class="form-input" />
            </div>

            <div class="form-item">
              <label>播放时长（秒）</label>
              <input v-model.number="form.display_duration" type="number" min="2" max="15" class="form-input" />
            </div>

            <div class="form-item">
              <label>遮罩强度（0-90）</label>
              <input v-model.number="form.overlay_opacity" type="number" min="0" max="90" class="form-input" />
            </div>

            <div class="form-item">
              <label>是否启用</label>
              <label class="toggle-switch">
                <input v-model="form.is_active" type="checkbox" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="form-item form-span-2">
              <label>跳转链接（可选）</label>
              <input v-model="form.link_url" type="text" class="form-input" placeholder="例如：https://example.com 或 /beats" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-sm btn-cancel" :disabled="saving || uploading" @click="closeEdit">取消</button>
            <button class="btn-sm btn-confirm" :disabled="saving || uploading" @click="saveBanner">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.banners-view {
  max-width: 1280px;
}

.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.toolbar-copy h2 {
  margin: 0 0 8px;
  color: #fff;
  font-size: 22px;
}

.toolbar-copy p {
  margin: 0;
  color: #a0a0b0;
  line-height: 1.6;
  max-width: 720px;
}

.btn-primary {
  padding: 11px 18px;
  border: none;
  border-radius: 10px;
  background: #7c3aed;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-primary:hover {
  background: #9333ea;
}

.loading {
  text-align: center;
  color: #a0a0b0;
  padding: 60px 0;
}

.sorting-tip {
  margin-bottom: 16px;
  color: #c4b5fd;
  font-size: 13px;
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
  min-width: 980px;
}

.admin-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  color: #a0a0b0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #16162a;
  border-bottom: 1px solid #2a2a45;
}

.admin-table td {
  padding: 14px 16px;
  color: #e0e0e8;
  border-bottom: 1px solid #1e1e35;
  vertical-align: middle;
}

.admin-table tbody tr:hover {
  background: rgba(124, 58, 237, 0.05);
}

.draggable-row {
  cursor: grab;
}

.draggable-row.dragging {
  opacity: 0.55;
}

.empty-cell {
  text-align: center;
  color: #a0a0b0;
  padding: 48px 24px;
}

.banner-thumb {
  width: 180px;
  height: 72px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #2a2a45;
}

.drag-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drag-handle {
  color: #7c829f;
  font-size: 18px;
  letter-spacing: -2px;
  user-select: none;
}

.banner-name {
  font-weight: 600;
  color: #fff;
}

.banner-link {
  margin-top: 6px;
  max-width: 260px;
  color: #a0a0b0;
  font-size: 12px;
  word-break: break-all;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

.status-badge.active {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm:disabled {
  opacity: 0.45;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  padding: 24px;
}

.modal-card {
  width: min(760px, 100%);
  background: #1e1e38;
  border: 1px solid #2a2a45;
  border-radius: 18px;
  padding: 28px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  color: #fff;
}

.modal-close {
  border: none;
  background: transparent;
  color: #a0a0b0;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.form-span-2 {
  grid-column: 1 / -1;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  color: #c7c9d7;
  font-size: 13px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #2a2a45;
  border-radius: 10px;
  background: #141425;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.form-input:focus {
  border-color: #7c3aed;
}

.upload-box {
  padding: 14px;
  border: 1px dashed #3b3b63;
  border-radius: 14px;
  background: #141425;
}

.image-preview {
  margin-bottom: 14px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #2a2a45;
}

.image-preview img {
  width: 100%;
  height: 220px;
  display: block;
  object-fit: cover;
}

.upload-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 150px;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
  font-weight: 600;
  cursor: pointer;
}

.upload-trigger input {
  display: none;
}

.field-tip {
  margin: 12px 0 0;
  color: #8b90a8;
  font-size: 12px;
  line-height: 1.6;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 24px;
  background: #2a2a45;
  transition: 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  left: 3px;
  bottom: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #7c3aed;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
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

@media (max-width: 900px) {
  .toolbar {
    flex-direction: column;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-span-2 {
    grid-column: auto;
  }

  .banner-thumb {
    width: 140px;
    height: 60px;
  }
}
</style>
