<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  fetchAdminApplications,
  approveBeatmakerApplication,
  rejectBeatmakerApplication,
  fetchAdminBeatmakerStats,
  fetchAdminBeatmakers,
  revokeBeatmaker,
  type AdminBeatmakerStats,
  type AdminBeatmakerItem,
} from '@/api/beatmaker'

const auth = useAuthStore()

// ─── Tab 切换 ──────────────────────────────────────────────
const activeTab = ref<'approvals' | 'beatmakers'>('approvals')

// ─── 统计面板 ──────────────────────────────────────────────
const stats = ref<AdminBeatmakerStats | null>(null)

async function loadStats() {
  try {
    stats.value = await fetchAdminBeatmakerStats()
  } catch {
    // 静默失败
  }
}

// ─── 认证审核 ──────────────────────────────────────────────
const approvalLoading = ref(false)
const approvalError = ref('')
const statusFilter = ref<'pending' | 'approved' | 'rejected'>('pending')
const approvalItems = ref<any[]>([])
const approvalTotal = ref(0)

const rejectModalOpen = ref(false)
const rejectingId = ref<number | null>(null)
const rejectReason = ref('')

const statusLabel = computed(() => {
  return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[statusFilter.value]
})

async function loadApprovals() {
  approvalLoading.value = true
  approvalError.value = ''
  try {
    const data = await fetchAdminApplications({ status: statusFilter.value })
    approvalItems.value = data.items
    approvalTotal.value = data.total
  } catch (err: any) {
    approvalError.value = err.message || '加载失败'
  } finally {
    approvalLoading.value = false
  }
}

async function approve(id: number) {
  if (!confirm('确认通过该申请？')) return
  try {
    await approveBeatmakerApplication(id)
    await Promise.all([loadApprovals(), loadStats()])
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

function openRejectModal(id: number) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectModalOpen.value = true
}

async function submitReject() {
  if (!rejectingId.value) return
  if (!rejectReason.value.trim()) {
    alert('请填写驳回原因')
    return
  }
  try {
    await rejectBeatmakerApplication(rejectingId.value, rejectReason.value.trim())
    rejectModalOpen.value = false
    await Promise.all([loadApprovals(), loadStats()])
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

// ─── Beatmaker 管理 ────────────────────────────────────────
const bmLoading = ref(false)
const bmError = ref('')
const bmSearch = ref('')
const bmSort = ref<'certified_at' | 'total_beats' | 'total_downloads'>('certified_at')
const bmItems = ref<AdminBeatmakerItem[]>([])
const bmTotal = ref(0)
const bmPage = ref(1)
const bmLimit = 20
const revokeModalOpen = ref(false)
const revokingUser = ref<AdminBeatmakerItem | null>(null)

const bmTotalPages = computed(() => Math.max(1, Math.ceil(bmTotal.value / bmLimit)))

async function loadBeatmakers() {
  bmLoading.value = true
  bmError.value = ''
  try {
    const data = await fetchAdminBeatmakers({
      search: bmSearch.value || undefined,
      sort: bmSort.value,
      page: bmPage.value,
      limit: bmLimit,
    })
    bmItems.value = data.items
    bmTotal.value = data.total
  } catch (err: any) {
    bmError.value = err.message || '加载失败'
  } finally {
    bmLoading.value = false
  }
}

function onBmSearch() {
  bmPage.value = 1
  loadBeatmakers()
}

function onBmSortChange() {
  bmPage.value = 1
  loadBeatmakers()
}

function openRevokeModal(item: AdminBeatmakerItem) {
  revokingUser.value = item
  revokeModalOpen.value = true
}

async function submitRevoke() {
  if (!revokingUser.value) return
  try {
    await revokeBeatmaker(revokingUser.value.user_id)
    revokeModalOpen.value = false
    await Promise.all([loadBeatmakers(), loadStats()])
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

// ─── 初始化 ────────────────────────────────────────────────
onMounted(async () => {
  if (!auth.isAdmin) return
  await Promise.all([loadStats(), loadApprovals(), loadBeatmakers()])
})
</script>

<template>
  <div class="manage-page">
    <!-- 统计面板 -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🎵</div>
        <div class="stat-info">
          <span class="stat-label">认证 Beatmaker</span>
          <span class="stat-value">{{ stats?.total_beatmakers ?? '-' }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-info">
          <span class="stat-label">待审核申请</span>
          <span class="stat-value">{{ stats?.pending_applications ?? '-' }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎼</div>
        <div class="stat-info">
          <span class="stat-label">Beatmaker 作品</span>
          <span class="stat-value">{{ stats?.total_beats ?? '-' }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⬇️</div>
        <div class="stat-info">
          <span class="stat-label">累计下载量</span>
          <span class="stat-value">{{ stats?.total_downloads ?? '-' }}</span>
        </div>
      </div>
    </section>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'approvals' }" @click="activeTab = 'approvals'">
        认证审核 <span v-if="stats?.pending_applications" class="badge">{{ stats.pending_applications }}</span>
      </button>
      <button :class="{ active: activeTab === 'beatmakers' }" @click="activeTab = 'beatmakers'">
        Beatmaker 管理
      </button>
    </div>

    <!-- ─── Tab: 认证审核 ──────────────────────────────── -->
    <div v-if="activeTab === 'approvals'" class="tab-content">
      <div class="sub-tabs">
        <button :class="{ active: statusFilter === 'pending' }" @click="statusFilter = 'pending'; loadApprovals()">待审核</button>
        <button :class="{ active: statusFilter === 'approved' }" @click="statusFilter = 'approved'; loadApprovals()">已通过</button>
        <button :class="{ active: statusFilter === 'rejected' }" @click="statusFilter = 'rejected'; loadApprovals()">已驳回</button>
      </div>

      <p class="muted">共 {{ approvalTotal }} 条{{ statusLabel }}申请</p>

      <div v-if="approvalLoading" class="state">加载中…</div>
      <div v-else-if="approvalError" class="state error">{{ approvalError }}</div>
      <div v-else-if="approvalItems.length === 0" class="state empty">暂无{{ statusLabel }}申请</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>申请人</th>
            <th>真实姓名</th>
            <th>作品集</th>
            <th>代表作</th>
            <th>音频</th>
            <th>提交时间</th>
            <th v-if="statusFilter === 'pending'">操作</th>
            <th v-else>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in approvalItems" :key="item.id">
            <td>
              <div class="user-cell">
                <strong>{{ item.username }}</strong>
                <small>{{ item.email }}</small>
              </div>
            </td>
            <td>{{ item.real_name }}</td>
            <td>
              <a v-if="item.portfolio_url" :href="item.portfolio_url" target="_blank" rel="noopener" class="link">查看 ↗</a>
              <span v-else class="muted">-</span>
            </td>
            <td>
              <a v-if="item.sample_work_url" :href="item.sample_work_url" target="_blank" rel="noopener" class="link">试听 ↗</a>
              <span v-else class="muted">-</span>
            </td>
            <td>
              <a v-if="item.sample_audio_url" :href="item.sample_audio_url" target="_blank" rel="noopener" class="link">播放 ↗</a>
              <span v-else class="muted">-</span>
            </td>
            <td class="muted">{{ new Date(item.created_at).toLocaleString('zh-CN') }}</td>
            <td v-if="statusFilter === 'pending'">
              <div class="action-btns">
                <button class="btn-approve" @click="approve(item.id)">通过</button>
                <button class="btn-reject" @click="openRejectModal(item.id)">驳回</button>
              </div>
            </td>
            <td v-else>
              <span v-if="item.status === 'approved'" class="status approved">已通过</span>
              <span v-else class="status rejected">
                已驳回
                <small v-if="item.reject_reason">{{ item.reject_reason }}</small>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ─── Tab: Beatmaker 管理 ────────────────────────── -->
    <div v-if="activeTab === 'beatmakers'" class="tab-content">
      <div class="toolbar">
        <input
          v-model="bmSearch"
          class="search-input"
          placeholder="搜索用户名或显示名…"
          @keyup.enter="onBmSearch"
        />
        <button class="btn-search" @click="onBmSearch">搜索</button>
        <select v-model="bmSort" class="sort-select" @change="onBmSortChange">
          <option value="certified_at">按认证时间</option>
          <option value="total_beats">按作品数量</option>
          <option value="total_downloads">按下载量</option>
        </select>
      </div>

      <p class="muted">共 {{ bmTotal }} 位认证 Beatmaker</p>

      <div v-if="bmLoading" class="state">加载中…</div>
      <div v-else-if="bmError" class="state error">{{ bmError }}</div>
      <div v-else-if="bmItems.length === 0" class="state empty">暂无认证 Beatmaker</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>显示名</th>
            <th>简介</th>
            <th>认证时间</th>
            <th>作品</th>
            <th>下载</th>
            <th>点赞</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bm in bmItems" :key="bm.user_id">
            <td>
              <div class="user-cell">
                <strong>{{ bm.username }}</strong>
                <small>ID: {{ bm.user_id }}</small>
              </div>
            </td>
            <td>{{ bm.display_name }}</td>
            <td class="bio-cell">{{ bm.bio || '-' }}</td>
            <td class="muted">{{ new Date(bm.certified_at).toLocaleDateString('zh-CN') }}</td>
            <td>{{ bm.beat_count }}</td>
            <td>{{ bm.dl_sum }}</td>
            <td>{{ bm.like_sum }}</td>
            <td>
              <div class="action-btns">
                <a v-if="bm.portfolio_url" :href="bm.portfolio_url" target="_blank" rel="noopener" class="btn-link">作品集</a>
                <button class="btn-revoke" @click="openRevokeModal(bm)">撤销认证</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div v-if="bmTotalPages > 1" class="pagination">
        <button :disabled="bmPage <= 1" @click="bmPage--; loadBeatmakers()">上一页</button>
        <span class="page-info">{{ bmPage }} / {{ bmTotalPages }}</span>
        <button :disabled="bmPage >= bmTotalPages" @click="bmPage++; loadBeatmakers()">下一页</button>
      </div>
    </div>

    <!-- 驳回弹窗 -->
    <div v-if="rejectModalOpen" class="modal-overlay" @click.self="rejectModalOpen = false">
      <div class="modal">
        <h3>驳回申请</h3>
        <p class="muted">请说明驳回原因，用户可在 3 天后重新申请</p>
        <textarea v-model="rejectReason" rows="4" placeholder="例如：作品集链接无法访问 / 代表作与本人信息不符" />
        <div class="modal-actions">
          <button class="btn-cancel" @click="rejectModalOpen = false">取消</button>
          <button class="btn-confirm-reject" @click="submitReject">确认驳回</button>
        </div>
      </div>
    </div>

    <!-- 撤销认证弹窗 -->
    <div v-if="revokeModalOpen" class="modal-overlay" @click.self="revokeModalOpen = false">
      <div class="modal">
        <h3>撤销 Beatmaker 认证</h3>
        <p>确认撤销 <strong>{{ revokingUser?.display_name }}</strong>（@{{ revokingUser?.username }}）的 Beatmaker 认证？</p>
        <ul class="revoke-warnings">
          <li>用户将失去 Beatmaker 标识</li>
          <li>Beatmaker 个人资料将被删除</li>
          <li>已上传的作品不会被删除</li>
          <li>用户可重新提交认证申请</li>
        </ul>
        <div class="modal-actions">
          <button class="btn-cancel" @click="revokeModalOpen = false">取消</button>
          <button class="btn-confirm-revoke" @click="submitRevoke">确认撤销</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manage-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* ─── 统计卡片 ──────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--accent-light, rgba(124, 58, 237, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #a0a0b0);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #fff);
}

/* ─── Tab 切换 ──────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border, #2a2a4a);
  padding-bottom: 0;
}

.tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary, #a0a0b0);
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tabs button.active {
  color: var(--accent, #7c3aed);
  font-weight: 600;
}

.tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent, #7c3aed);
}

.badge {
  background: var(--error, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  line-height: 1.4;
}

/* ─── 子 Tab ────────────────────────────────────────── */
.sub-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.sub-tabs button {
  padding: 6px 14px;
  border: 1px solid var(--border, #2a2a4a);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #a0a0b0);
}

.sub-tabs button.active {
  background: var(--accent-light, rgba(124, 58, 237, 0.15));
  color: var(--accent, #7c3aed);
  font-weight: 600;
  border-color: var(--accent, #7c3aed);
}

/* ─── 工具栏 ────────────────────────────────────────── */
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 8px;
  color: var(--text-primary, #fff);
  font-size: 14px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent, #7c3aed);
}

.btn-search {
  padding: 8px 16px;
  background: var(--accent, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-search:hover {
  background: var(--accent-hover, #6d28d9);
}

.sort-select {
  padding: 8px 12px;
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 8px;
  color: var(--text-primary, #fff);
  font-size: 14px;
  cursor: pointer;
  outline: none;
}

/* ─── 通用 ──────────────────────────────────────────── */
.muted {
  color: var(--text-secondary, #a0a0b0);
  font-size: 13px;
}

.state {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary, #a0a0b0);
}

.state.error {
  color: var(--error, #ef4444);
}

/* ─── 数据表格 ──────────────────────────────────────── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-card, #1a1a2e);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px var(--shadow, rgba(0, 0, 0, 0.2));
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border, #2a2a4a);
  font-size: 14px;
}

.data-table th {
  background: var(--bg-secondary, #141425);
  font-weight: 600;
  color: var(--text-secondary, #a0a0b0);
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-cell small {
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
}

.bio-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link {
  color: var(--accent, #7c3aed);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.action-btns {
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn-approve,
.btn-reject,
.btn-revoke,
.btn-link {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  text-decoration: none;
}

.btn-approve {
  background: var(--success, #10b981);
  color: #fff;
}

.btn-approve:hover {
  filter: brightness(1.1);
}

.btn-reject {
  background: var(--accent-light, rgba(239, 68, 68, 0.15));
  color: var(--error, #ef4444);
}

.btn-revoke {
  background: var(--accent-light, rgba(239, 68, 68, 0.15));
  color: var(--error, #ef4444);
}

.btn-link {
  background: var(--accent-light, rgba(124, 58, 237, 0.15));
  color: var(--accent, #7c3aed);
}

.status {
  font-size: 13px;
  font-weight: 500;
}

.status.approved {
  color: var(--success, #15803d);
}

.status.rejected {
  color: var(--error, #ef4444);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status small {
  color: var(--text-secondary, #9ca3af);
  font-weight: 400;
}

/* ─── 分页 ──────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.pagination button {
  padding: 6px 14px;
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 6px;
  color: var(--text-primary, #fff);
  cursor: pointer;
  font-size: 14px;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  color: var(--text-secondary, #a0a0b0);
  font-size: 14px;
}

/* ─── 弹窗 ──────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay, rgba(0, 0, 0, 0.7));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
}

.modal h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--text-primary, #fff);
}

.modal p {
  color: var(--text-secondary, #a0a0b0);
  font-size: 14px;
  margin: 0 0 8px;
}

.modal p strong {
  color: var(--text-primary, #fff);
}

.modal textarea {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 8px;
  background: var(--bg-secondary, #141425);
  color: var(--text-primary, #fff);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}

.revoke-warnings {
  margin: 12px 0;
  padding-left: 20px;
  color: var(--text-secondary, #a0a0b0);
  font-size: 13px;
}

.revoke-warnings li {
  margin-bottom: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.btn-cancel,
.btn-confirm-reject,
.btn-confirm-revoke {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel {
  background: var(--accent-light, rgba(255, 255, 255, 0.08));
  color: var(--text-secondary, #a0a0b0);
}

.btn-confirm-reject {
  background: var(--error, #dc2626);
  color: #fff;
}

.btn-confirm-revoke {
  background: var(--error, #dc2626);
  color: #fff;
}
</style>
