<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  fetchLicenseTemplates,
  createLicenseTemplate,
  updateLicenseTemplate,
  deleteLicenseTemplate,
  fetchLicenseAgreements,
  getLicenseAgreementsExportUrl,
  type LicenseTemplate,
  type LicenseAgreementRecord
} from '@/api/admin'

// ─── 状态 ────────────────────────────────────────────────────────────────────
const activeTab = ref<'templates' | 'agreements'>('templates')

// 模板列表
const templates = ref<LicenseTemplate[]>([])
const templatesLoading = ref(false)

// 模板编辑弹窗
const editVisible = ref(false)
const editSaving = ref(false)
const editForm = ref({ id: null as number | null, version: '', content: '', is_active: false })
const editError = ref('')

// 同意记录
const agreements = ref<LicenseAgreementRecord[]>([])
const agreementsLoading = ref(false)
const agreementsTotal = ref(0)
const agreementsPage = ref(1)
const agreementsTotalPages = ref(1)
const searchUsername = ref('')
const searchBeatTitle = ref('')

// 删除二次确认
const confirmVisible = ref(false)
const confirmAction = ref<(() => Promise<void>) | null>(null)
const confirmMessage = ref('')

// ─── 模板管理 ────────────────────────────────────────────────────────────────
async function loadTemplates() {
  templatesLoading.value = true
  try {
    const data = await fetchLicenseTemplates()
    templates.value = data.templates
  } catch (e) {
    console.error(e)
  } finally {
    templatesLoading.value = false
  }
}

function openCreate() {
  editForm.value = { id: null, version: '', content: '', is_active: false }
  editError.value = ''
  editVisible.value = true
}

function openEdit(tpl: LicenseTemplate) {
  editForm.value = { id: tpl.id, version: tpl.version, content: tpl.content, is_active: !!tpl.is_active }
  editError.value = ''
  editVisible.value = true
}

function closeEdit() {
  if (editSaving.value) return
  editVisible.value = false
}

async function saveTemplate() {
  if (!editForm.value.content.trim()) {
    editError.value = '协议内容不能为空'
    return
  }
  editSaving.value = true
  editError.value = ''
  try {
    if (editForm.value.id) {
      await updateLicenseTemplate(editForm.value.id, {
        version: editForm.value.version,
        content: editForm.value.content,
        is_active: editForm.value.is_active ? 1 : 0
      })
    } else {
      await createLicenseTemplate({
        version: editForm.value.version,
        content: editForm.value.content,
        is_active: editForm.value.is_active ? 1 : 0
      })
    }
    editVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    editError.value = e?.message ?? '保存失败'
  } finally {
    editSaving.value = false
  }
}

async function activateTemplate(id: number) {
  await updateLicenseTemplate(id, { is_active: 1 })
  await loadTemplates()
}

function promptDelete(id: number) {
  confirmMessage.value = '确定删除该协议模板吗？'
  confirmAction.value = async () => {
    await deleteLicenseTemplate(id)
    confirmVisible.value = false
    await loadTemplates()
  }
  confirmVisible.value = true
}

function confirmActionFn() {
  confirmAction.value?.()
}

// ─── 同意记录查询 ────────────────────────────────────────────────────────────
async function loadAgreements(page = 1) {
  agreementsLoading.value = true
  agreementsPage.value = page
  try {
    const data = await fetchLicenseAgreements({
      page,
      limit: 20,
      username: searchUsername.value || undefined,
      beat_title: searchBeatTitle.value || undefined
    })
    agreements.value = data.records
    agreementsTotal.value = data.total
    agreementsTotalPages.value = data.totalPages
  } catch (e) {
    console.error(e)
  } finally {
    agreementsLoading.value = false
  }
}

function searchAgreements() {
  loadAgreements(1)
}

function exportCsv() {
  const url = getLicenseAgreementsExportUrl({
    username: searchUsername.value || undefined,
    beat_title: searchBeatTitle.value || undefined
  })
  window.open(url, '_blank')
}

function formatTime(ts: string) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

function setActiveTab(tab: 'templates' | 'agreements') {
  activeTab.value = tab
  if (tab === 'agreements' && agreements.value.length === 0) {
    loadAgreements(1)
  }
}

onMounted(() => {
  loadTemplates()
})
</script>

<template>
  <div class="license-view">
    <div class="page-header-row">
      <h2>使用协议管理</h2>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'templates' }" @click="setActiveTab('templates')">
        📝 协议模板
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'agreements' }" @click="setActiveTab('agreements')">
        📋 同意记录
      </button>
    </div>

    <!-- ── 协议模板 ── -->
    <div v-if="activeTab === 'templates'" class="tab-content">
      <div class="toolbar">
        <button class="btn-primary" @click="openCreate">+ 新建模板</button>
      </div>

      <div v-if="templatesLoading" class="loading-hint">加载中...</div>
      <table v-else class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>版本</th>
            <th>激活状态</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="templates.length === 0">
            <td colspan="6" class="empty-cell">暂无模板</td>
          </tr>
          <tr v-for="tpl in templates" :key="tpl.id">
            <td>{{ tpl.id }}</td>
            <td>{{ tpl.version || '-' }}</td>
            <td>
              <span class="badge" :class="tpl.is_active ? 'badge-success' : 'badge-default'">
                {{ tpl.is_active ? '激活' : '未激活' }}
              </span>
              <button
                v-if="!tpl.is_active"
                class="btn-activate"
                @click="activateTemplate(tpl.id)"
              >激活</button>
            </td>
            <td>{{ formatTime(tpl.created_at) }}</td>
            <td>{{ formatTime(tpl.updated_at) }}</td>
            <td>
              <div class="action-btns">
                <button class="btn-sm btn-edit" @click="openEdit(tpl)">编辑</button>
                <button class="btn-sm btn-danger" @click="promptDelete(tpl.id)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── 同意记录 ── -->
    <div v-if="activeTab === 'agreements'" class="tab-content">
      <div class="toolbar">
        <div class="search-group">
          <input
            v-model="searchUsername"
            class="search-input"
            placeholder="用户名"
            @keyup.enter="searchAgreements"
          />
          <input
            v-model="searchBeatTitle"
            class="search-input"
            placeholder="伴奏标题"
            @keyup.enter="searchAgreements"
          />
          <button class="btn-search" @click="searchAgreements">搜索</button>
          <button class="btn-export" @click="exportCsv">导出 CSV</button>
        </div>
        <span class="record-count">共 {{ agreementsTotal }} 条记录</span>
      </div>

      <div v-if="agreementsLoading" class="loading-hint">加载中...</div>
      <table v-else class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>邮箱</th>
            <th>伴奏标题</th>
            <th>制作人</th>
            <th>同意时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="agreements.length === 0">
            <td colspan="6" class="empty-cell">暂无记录</td>
          </tr>
          <tr v-for="r in agreements" :key="r.id">
            <td>{{ r.id }}</td>
            <td>{{ r.username ?? '-' }}</td>
            <td>{{ r.email ?? '-' }}</td>
            <td>{{ r.beat_title ?? '-' }}</td>
            <td>{{ r.producer ?? '-' }}</td>
            <td>{{ formatTime(r.agreed_at) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div v-if="agreementsTotalPages > 1" class="pagination">
        <button class="page-btn" :disabled="agreementsPage <= 1" @click="loadAgreements(agreementsPage - 1)">上一页</button>
        <span class="page-info">{{ agreementsPage }} / {{ agreementsTotalPages }}</span>
        <button class="page-btn" :disabled="agreementsPage >= agreementsTotalPages" @click="loadAgreements(agreementsPage + 1)">下一页</button>
      </div>
    </div>

    <!-- ── 模板编辑弹窗 ── -->
    <Teleport to="body">
      <div v-if="editVisible" class="modal-overlay" @click.self="closeEdit">
        <div class="modal-card modal-large">
          <div class="modal-header">
            <h3>{{ editForm.id ? '编辑协议模板' : '新建协议模板' }}</h3>
            <button class="modal-close-btn" @click="closeEdit" :disabled="editSaving">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-row">
              <label>版本号</label>
              <input v-model="editForm.version" class="form-input" placeholder="例如 1.0" />
            </div>

            <div class="form-row">
              <label class="required">协议内容</label>
              <textarea
                v-model="editForm.content"
                class="form-textarea"
                placeholder="请输入完整的协议内容..."
                rows="18"
              ></textarea>
              <span class="form-hint">协议内容将完整展示给用户，请确保内容准确完整</span>
            </div>

            <div class="form-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="editForm.is_active" />
                <span>设为激活模板（用户将看到此版本）</span>
              </label>
            </div>

            <div v-if="editError" class="form-error">{{ editError }}</div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closeEdit" :disabled="editSaving">取消</button>
            <button class="btn-primary" @click="saveTemplate" :disabled="editSaving">
              {{ editSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── 删除二次确认 ── -->
    <Teleport to="body">
      <div v-if="confirmVisible" class="modal-overlay" @click.self="confirmVisible = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>确认操作</h3>
          </div>
          <div class="modal-body">
            <p class="confirm-msg">{{ confirmMessage }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="confirmVisible = false">取消</button>
            <button class="btn-danger" @click="confirmActionFn">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.license-view {
  padding: 24px 32px;
  max-width: 1200px;
}

.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header-row h2 {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px;
  border-radius: 10px;
  width: fit-content;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

.tab-btn.active {
  background: #7c3aed;
  color: #fff;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.search-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.loading-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 40px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  background: #1a1a30;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}

.admin-table th {
  background: #141425;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.admin-table td {
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.75);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.admin-table tr:last-child td {
  border-bottom: none;
}

.admin-table tr:hover td {
  background: rgba(124, 58, 237, 0.04);
}

.empty-cell {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  padding: 40px !important;
}

.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.badge-success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.badge-default {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.4);
}

.action-btns {
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-edit {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
}

.btn-edit:hover {
  background: rgba(124, 58, 237, 0.3);
}

.btn-activate {
  margin-left: 8px;
  padding: 3px 10px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-activate:hover {
  background: rgba(34, 197, 94, 0.25);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.25);
}

.btn-primary {
  padding: 8px 20px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #6d28d9;
}

.btn-search {
  padding: 7px 16px;
  background: rgba(124, 58, 237, 0.2);
  color: #a78bfa;
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-search:hover {
  background: rgba(124, 58, 237, 0.35);
}

.btn-export {
  padding: 7px 16px;
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export:hover {
  background: rgba(245, 158, 11, 0.2);
}

.search-input {
  padding: 7px 12px;
  background: #141425;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  outline: none;
  min-width: 140px;
}

.search-input:focus {
  border-color: rgba(124, 58, 237, 0.5);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.record-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}

.page-btn {
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.modal-card {
  background: #1e1e38;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.modal-large {
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.form-row label.required::after {
  content: ' *';
  color: #ef4444;
}

.form-input {
  padding: 9px 12px;
  background: #141425;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: rgba(124, 58, 237, 0.5);
}

.form-textarea {
  padding: 12px;
  background: #141425;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  border-color: rgba(124, 58, 237, 0.5);
}

.form-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 500 !important;
  color: rgba(255, 255, 255, 0.8) !important;
}

.checkbox-label input {
  accent-color: #7c3aed;
  width: 16px;
  height: 16px;
}

.form-error {
  color: #ef4444;
  font-size: 13px;
}

.confirm-msg {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  text-align: center;
  margin: 0;
  padding: 8px 0;
}

.btn-cancel {
  padding: 9px 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn-cancel:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
