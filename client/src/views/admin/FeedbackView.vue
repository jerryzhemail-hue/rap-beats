<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { fetchAdminFeedback, replyFeedback, deleteFeedback, fetchNewFeedback } from '@/api/feedback'
import type { AdminFeedbackItem } from '@/api/feedback'

const feedback = ref<AdminFeedbackItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const search = ref('')
const statusFilter = ref('')

const detailVisible = ref(false)
const currentItem = ref<AdminFeedbackItem | null>(null)
const replyContent = ref('')
const replyStatus = ref<'pending' | 'replied' | 'closed'>('replied')
const replyLoading = ref(false)
const replyError = ref('')

const confirmVisible = ref(false)
const confirmAction = ref<(() => Promise<void>) | null>(null)
const confirmMessage = ref('')

// ── 新反馈监控 ────────────────────────────────────────────────────────────────
const lastServerTime = ref<string | null>(null)
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)
const newFeedbackIds = ref<Set<number>>(new Set())

// 通知 toast 状态
const toastMessage = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3500)
}

async function pollNewFeedback() {
  try {
    const data = await fetchNewFeedback(lastServerTime.value ?? undefined)
    if (data.items.length > 0) {
      // 有新反馈
      if (lastServerTime.value !== null) {
        showToast(`收到 ${data.items.length} 条新反馈`)
        // 高亮这些行
        data.items.forEach(item => newFeedbackIds.value.add(item.id))
      }
      // 更新列表（去重合并到当前列表前端）
      const existingIds = new Set(feedback.value.map(f => f.id))
      const newItems = data.items.filter(item => !existingIds.has(item.id))
      if (newItems.length > 0) {
        feedback.value = [...newItems, ...feedback.value]
        total.value += newItems.length
      }
    }
    lastServerTime.value = data.serverTime
  } catch (e) {
    // 轮询失败静默忽略，不影响正常操作
  }
}

function startPolling() {
  stopPolling()
  // 首次立即拉一次，再每 5 秒轮询
  pollNewFeedback()
  pollInterval.value = setInterval(pollNewFeedback, 5000)
}

function stopPolling() {
  if (pollInterval.value !== null) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'replied', label: '已回复' },
  { value: 'closed', label: '已关闭' },
]

const typeMap: Record<string, string> = {
  bug: 'Bug问题',
  suggestion: '功能建议',
  other: '其他',
}
const statusMap: Record<string, string> = {
  pending: '待处理',
  replied: '已回复',
  closed: '已关闭',
}

async function loadFeedback() {
  loading.value = true
  try {
    const data = await fetchAdminFeedback({
      page: page.value,
      limit: 15,
      status: statusFilter.value || undefined,
      search: search.value || undefined,
    })
    feedback.value = data.feedback
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadFeedback() }, 300)
}

function onStatusChange() {
  page.value = 1
  loadFeedback()
}

function openDetail(item: AdminFeedbackItem) {
  currentItem.value = item
  replyContent.value = item.reply || ''
  replyStatus.value = item.status as any
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  currentItem.value = null
  replyContent.value = ''
  replyError.value = ''
}

async function handleReply() {
  if (!replyContent.value.trim()) { replyError.value = '回复内容不能为空'; return }
  replyError.value = ''
  replyLoading.value = true
  try {
    await replyFeedback(currentItem.value!.id, {
      reply: replyContent.value.trim(),
      status: replyStatus.value,
    })
    closeDetail()
    await loadFeedback()
  } catch (e: any) {
    replyError.value = e?.error || '操作失败'
  } finally {
    replyLoading.value = false
  }
}

function showDeleteConfirm(item: AdminFeedbackItem) {
  confirmMessage.value = `确定要删除这条反馈吗？\n标题：${item.title}`
  confirmAction.value = async () => {
    await deleteFeedback(item.id)
    await loadFeedback()
  }
  confirmVisible.value = true
}

function closeConfirm() {
  confirmVisible.value = false
  confirmAction.value = null
}

async function executeConfirm() {
  if (confirmAction.value) {
    try { await confirmAction.value() } catch (e) { console.error(e) }
  }
  closeConfirm()
}

onMounted(() => {
  loadFeedback()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="feedback-admin">
    <div class="page-header">
      <h1 class="page-title">意见反馈</h1>
      <div class="page-subtitle">共 {{ total }} 条反馈</div>
    </div>

    <div class="filter-bar">
      <input
        v-model="search"
        class="search-input"
        placeholder="搜索标题或内容..."
        @input="onSearchInput"
      />
      <select v-model="statusFilter" class="filter-select" @change="onStatusChange">
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="feedback.length === 0" class="empty-state">暂无反馈</div>
    <template v-else>
      <table class="admin-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>类型</th>
            <th>标题</th>
            <th>用户</th>
            <th>联系方式</th>
            <th>状态</th>
            <th>提交时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in feedback" :key="item.id" :class="{ 'row-new': newFeedbackIds.has(item.id) }">
            <td class="seq-cell">{{ (page - 1) * 15 + index + 1 }}</td>
            <td><span class="type-badge" :class="item.type">{{ typeMap[item.type] }}</span></td>
            <td class="title-cell">{{ item.title }}</td>
            <td>{{ item.username || '游客' }}</td>
            <td>{{ item.contact || '-' }}</td>
            <td>
              <span class="status-badge" :class="item.status">
                {{ statusMap[item.status] }}
              </span>
            </td>
            <td>{{ new Date(item.created_at).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }}</td>
            <td class="actions">
              <button class="btn-sm btn-edit" @click="openDetail(item)">查看</button>
              <button class="btn-sm btn-danger" @click="showDeleteConfirm(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="page--; loadFeedback()">上一页</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page === totalPages" @click="page++; loadFeedback()">下一页</button>
      </div>
    </template>

    <!-- 实时通知 Toast -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toastVisible" class="toast">
          <span class="toast-dot"></span>
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>

    <!-- 详情抽屉 -->
    <Teleport to="body">
      <div v-if="detailVisible" class="drawer-overlay" @click.self="closeDetail">
        <div class="drawer-panel">
          <div class="drawer-header">
            <h3 class="drawer-title">反馈详情</h3>
            <button class="drawer-close" @click="closeDetail">&times;</button>
          </div>
          <div class="drawer-body" v-if="currentItem">
            <div class="detail-meta">
              <span class="type-badge" :class="currentItem.type">{{ typeMap[currentItem.type] }}</span>
              <span class="status-badge" :class="currentItem.status">{{ statusMap[currentItem.status] }}</span>
              <span class="detail-user">{{ currentItem.username || '游客' }} ({{ currentItem.email || '无邮箱' }})</span>
              <span class="detail-time">{{ new Date(currentItem.created_at).toLocaleString('zh-CN') }}</span>
            </div>
            <div class="detail-section">
              <div class="detail-label">标题</div>
              <div class="detail-value">{{ currentItem.title }}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">联系方式</div>
              <div class="detail-value">{{ currentItem.contact || '未填写' }}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">反馈内容</div>
              <div class="detail-content">{{ currentItem.content }}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">管理员回复</div>
              <textarea v-model="replyContent" class="reply-textarea" placeholder="输入回复内容..." rows="4"></textarea>
            </div>
            <div class="detail-section">
              <div class="detail-label">处理状态</div>
              <select v-model="replyStatus" class="detail-select">
                <option value="pending">待处理</option>
                <option value="replied">已回复</option>
                <option value="closed">已关闭</option>
              </select>
            </div>
            <div v-if="replyError" class="error-message">{{ replyError }}</div>
            <div class="drawer-actions">
              <button class="btn btn-outline" @click="closeDetail">取消</button>
              <button class="btn btn-primary" :disabled="replyLoading" @click="handleReply">
                <span v-if="replyLoading" class="spinner"></span>
                <span v-else>保存回复</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 确认对话框 -->
    <Teleport to="body">
      <div v-if="confirmVisible" class="drawer-overlay" @click.self="closeConfirm">
        <div class="confirm-card">
          <h3 class="confirm-title">确认删除</h3>
          <p class="confirm-message">{{ confirmMessage }}</p>
          <div class="confirm-actions">
            <button class="btn btn-outline" @click="closeConfirm">取消</button>
            <button class="btn btn-danger" @click="executeConfirm">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.feedback-admin {
  padding: 32px;
  max-width: 1100px;
}

.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #e0e0e8;
  margin: 0 0 4px;
}
.page-subtitle {
  font-size: 13px;
  color: #6b6b80;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.search-input {
  flex: 1;
  max-width: 360px;
  padding: 8px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: #7c3aed; }
.filter-select {
  padding: 8px 12px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 48px;
  color: #6b6b80;
  font-size: 14px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
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
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.admin-table tbody tr:hover { background: rgba(124,58,237,0.05); }
.admin-table tbody tr.row-new {
  animation: newRowPulse 2s ease-out forwards;
}
@keyframes newRowPulse {
  0%   { background: rgba(124, 58, 237, 0.25); }
  100% { background: transparent; }
}

.seq-cell { font-weight: 700; color: #c084fc; }
.title-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.type-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.type-badge.bug { background: rgba(239,68,68,0.15); color: #f87171; }
.type-badge.suggestion { background: rgba(234,179,8,0.15); color: #fbbf24; }
.type-badge.other { background: rgba(59,130,246,0.15); color: #60a5fa; }

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.status-badge.pending { background: rgba(234,179,8,0.15); color: #fbbf24; }
.status-badge.replied { background: rgba(74,222,128,0.15); color: #4ade80; }
.status-badge.closed { background: rgba(148,163,184,0.15); color: #94a3b8; }

.actions { display: flex; gap: 8px; }

.btn-sm {
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.2s;
}
.btn-sm:hover { opacity: 0.8; }
.btn-edit { background: rgba(124,58,237,0.2); color: #a78bfa; }
.btn-danger { background: rgba(239,68,68,0.2); color: #f87171; }

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}
.page-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #2a2a45;
  background: transparent;
  color: #e0e0e8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.page-btn:hover:not(:disabled) { border-color: #7c3aed; color: #a78bfa; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 13px; color: #6b6b80; }

/* 抽屉 */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
  animation: fadeIn 0.2s;
}
.drawer-panel {
  width: 480px;
  height: 100%;
  background: #1a1a2e;
  border-left: 1px solid #2a2a45;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.25s ease;
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #2a2a45;
}
.drawer-title { font-size: 16px; font-weight: 600; color: #e0e0e8; margin: 0; }
.drawer-close {
  background: none;
  border: none;
  color: #6b6b80;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}
.drawer-close:hover { color: #e0e0e8; }
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
}

.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.detail-user, .detail-time {
  font-size: 12px;
  color: #6b6b80;
}
.detail-section { display: flex; flex-direction: column; gap: 6px; }
.detail-label { font-size: 12px; color: #6b6b80; text-transform: uppercase; letter-spacing: 0.5px; }
.detail-value { font-size: 14px; color: #e0e0e8; }
.detail-content {
  font-size: 14px;
  color: #c0c0d0;
  line-height: 1.6;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.reply-textarea {
  width: 100%;
  padding: 10px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.reply-textarea:focus { border-color: #7c3aed; }
.detail-select {
  padding: 8px 12px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
}
.error-message { color: #f87171; font-size: 13px; }

/* 通用按钮 */
.btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: #7c3aed; color: white; }
.btn-primary:hover:not(:disabled) { background: #6d28d9; }
.btn-outline { background: transparent; border: 1px solid #2a2a45; color: #e0e0e8; }
.btn-outline:hover:not(:disabled) { border-color: #7c3aed; }
.btn-danger { background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
.btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.3); }
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
}

/* 确认卡片 */
.confirm-card {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1a1a2e;
  border: 1px solid #2a2a45;
  border-radius: 16px;
  padding: 28px 32px;
  width: 360px;
  z-index: 1001;
  animation: fadeIn 0.2s;
}
.confirm-title { font-size: 16px; font-weight: 600; color: #e0e0e8; margin: 0 0 12px; }
.confirm-message { font-size: 14px; color: #8888a8; line-height: 1.5; margin: 0 0 20px; white-space: pre-wrap; }
.confirm-actions { display: flex; gap: 12px; justify-content: flex-end; }

@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideIn { from { transform: translateX(40px) } to { transform: translateX(0) } }
@keyframes spin { to { transform: rotate(360deg) } }

/* Toast 通知 */
.toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: #1a1a2e;
  border: 1px solid #7c3aed;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
  color: #e0e0e8;
  font-size: 14px;
  font-weight: 500;
  max-width: 320px;
}
.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  flex-shrink: 0;
  animation: toastDotPulse 1s ease infinite;
}
@keyframes toastDotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.8); }
}

/* Toast 过渡动画 */
.toast-enter-active { animation: toastIn 0.25s ease; }
.toast-leave-active { animation: toastIn 0.2s ease reverse; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
</style>
